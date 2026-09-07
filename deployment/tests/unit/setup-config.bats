#!/usr/bin/env bats
# Run only setup's configuration-copy phase in a disposable deployment tree.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    FIXTURE_DEPLOY="$TEST_TEMP_DIR/deployment"
    mkdir -p "$FIXTURE_DEPLOY/tests/helpers" "$TEST_TEMP_DIR/bin"
    # Stop before generated credentials, nginx, ownership, or Compose operations.
    grep -qxF '# Set test values' "$TESTS_DIR/helpers/setup-test-env.sh"
    awk '/^# Set test values$/ {exit} {print}' "$TESTS_DIR/helpers/setup-test-env.sh" \
        > "$FIXTURE_DEPLOY/tests/helpers/setup-test-env.sh"
    cp "$DEPLOY_DIR/.env.production.example" "$FIXTURE_DEPLOY/.env.production.example"
    touch "$FIXTURE_DEPLOY/.env.production"
    for command in docker restic; do
        printf '#!/bin/bash\nexit 0\n' > "$TEST_TEMP_DIR/bin/$command"
        chmod +x "$TEST_TEMP_DIR/bin/$command"
    done
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
    export DEPLOYMENT_TEST_DISPOSABLE=1
}

teardown() {
    teardown_temp_dir
}

run_config_setup() {
    run bash "$FIXTURE_DEPLOY/tests/helpers/setup-test-env.sh"
}

@test "setup accepts an existing deployment without optional scraper settings" {
    run_config_setup
    [ "$status" -eq 0 ]
    [ -f "$FIXTURE_DEPLOY/.env.production.pre-test-backup" ]
}

@test "setup preserves a scraper URL even without an API key" {
    printf '%s\n' 'SCRAPER_RUNNER_URL=http://runner.test:4000' > "$FIXTURE_DEPLOY/.env.production"
    run_config_setup
    [ "$status" -eq 0 ]
    grep -qxF 'SCRAPER_RUNNER_URL=http://runner.test:4000' "$FIXTURE_DEPLOY/.env.production"
}

@test "setup preserves literal scraper values and uses the last configured value" {
    cat > "$FIXTURE_DEPLOY/.env.production" << 'EOF'
SCRAPER_RUNNER_URL=http://old.test:4000
SCRAPER_RUNNER_URL=http://runner.test:4000/path?a=1&b=2
SCRAPER_API_KEY='fixture&key\with|symbols='
EOF
    run_config_setup
    [ "$status" -eq 0 ]
    grep -qxF 'SCRAPER_RUNNER_URL=http://runner.test:4000/path?a=1&b=2' "$FIXTURE_DEPLOY/.env.production"
    grep -qxF "SCRAPER_API_KEY='fixture&key\with|symbols='" "$FIXTURE_DEPLOY/.env.production"
    [ "$(grep -c '^SCRAPER_RUNNER_URL=' "$FIXTURE_DEPLOY/.env.production")" -eq 1 ]
}
