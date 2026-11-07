#!/usr/bin/env bats
# Step 06 reads existing secrets back from .env.production.

setup() {
    load '../helpers/common.bash'
    load_lib common
    load_step 06-configure
    setup_temp_dir

    INSTALL="$TEST_TEMP_DIR/install"
    mkdir -p "$INSTALL"
    cp "$DEPLOY_DIR/.env.production.example" "$INSTALL/.env.production.example"
}

teardown() {
    teardown_temp_dir
}

# run_step in a separate process with the root-only side effects stubbed.
run_configure() {
    run env INSTALL_DIR="$INSTALL" DOMAIN_NAME=new.example.org \
        LETSENCRYPT_EMAIL=ops@example.org bash -c '
        source "$1/lib/common.sh"; source "$1/lib/prompts.sh"; source "$1/steps/06-configure.sh"
        chown() { :; }; configure_nginx() { :; }; create_credentials_file() { :; }
        run_step' _ "$BOOTSTRAP_DIR"
}

@test "read_existing_secret returns a quoted value without its quotes" {
    printf 'DB_PASSWORD="abc=="\n' > "$BATS_TEST_TMPDIR/env"
    [ "$(read_existing_secret "$BATS_TEST_TMPDIR/env" DB_PASSWORD)" = "abc==" ]
}

@test "a fresh install gets .env.production from the template with the configured values" {
    run_configure
    [ "$status" -eq 0 ]

    [ "$(env_get "$INSTALL/.env.production" DOMAIN_NAME)" = new.example.org ]
    [ "$(env_get "$INSTALL/.env.production" TIMETILES_VERSION)" = edge ]
    [ -n "$(read_existing_secret "$INSTALL/.env.production" DB_PASSWORD)" ]
}

@test "a rerun keeps operator settings the template does not carry" {
    {
        sed -e 's|^TIMETILES_VERSION=.*|TIMETILES_VERSION=1.2.3|' \
            -e 's|^UPLOAD_HOST_DIR=.*|UPLOAD_HOST_DIR=/srv/uploads|' \
            -e 's|^DOMAIN_NAME=.*|DOMAIN_NAME=old.example.org|' \
            -e 's|^DB_PASSWORD=.*|DB_PASSWORD=kept-db-password|' \
            "$INSTALL/.env.production.example"
        echo "RESTIC_OFFSITE_REPOSITORY=s3:s3.example.org/bucket/timetiles"
        echo "SCRAPER_RUNNER_URL=http://host.docker.internal:4000"
    } > "$INSTALL/.env.production"

    run_configure
    [ "$status" -eq 0 ]

    local env_file="$INSTALL/.env.production"
    [ "$(env_get "$env_file" TIMETILES_VERSION)" = 1.2.3 ]
    [ "$(env_get "$env_file" UPLOAD_HOST_DIR)" = /srv/uploads ]
    [ "$(env_get "$env_file" RESTIC_OFFSITE_REPOSITORY)" = s3:s3.example.org/bucket/timetiles ]
    [ "$(env_get "$env_file" SCRAPER_RUNNER_URL)" = http://host.docker.internal:4000 ]
    [ "$(env_get "$env_file" DB_PASSWORD)" = kept-db-password ]
    [ "$(env_get "$env_file" DOMAIN_NAME)" = new.example.org ]
}

@test "env_set rewrites an active key, fills a placeholder and appends a missing one" {
    local env="$BATS_TEST_TMPDIR/env"
    printf 'A=old\n# B=\nC=keep\nA=older\n' > "$env"
    chmod 600 "$env"

    env_set "$env" A 'x|y&z/w'
    env_set "$env" B b-value
    env_set "$env" D appended

    [ "$(cat "$env")" = "$(printf 'A=x|y&z/w\nB=b-value\nC=keep\nA=x|y&z/w\nD=appended')" ]
    [ "$(stat -c %a "$env" 2>/dev/null || stat -f %Lp "$env")" = 600 ]
}

@test "a rerun adds keys an older .env.production lacks" {
    grep -v '^CONFIG_DIR=' "$INSTALL/.env.production.example" > "$INSTALL/.env.production"

    run_configure
    [ "$status" -eq 0 ]

    [ "$(env_get "$INSTALL/.env.production" CONFIG_DIR)" = ../apps/web/config ]
}

@test "a rerun with a changed scraper key updates the active one" {
    sed -e 's|^# SCRAPER_API_KEY=.*|SCRAPER_API_KEY=old-scraper-key|' \
        "$INSTALL/.env.production.example" > "$INSTALL/.env.production"

    SKIP_SCRAPER=false SCRAPER_API_KEY=new-scraper-key run_configure
    [ "$status" -eq 0 ]

    [ "$(grep -c '^SCRAPER_API_KEY=' "$INSTALL/.env.production")" -eq 1 ]
    [ "$(env_get "$INSTALL/.env.production" SCRAPER_API_KEY)" = new-scraper-key ]
}

@test "without SMTP a fresh install switches app mail off" {
    run_configure
    [ "$status" -eq 0 ]

    [ "$(env_get "$INSTALL/.env.production" EMAIL_DISABLED)" = true ]
    [ -z "$(env_get "$INSTALL/.env.production" EMAIL_SMTP_HOST || true)" ]
}

@test "configured SMTP is written and turns app mail back on" {
    { cat "$INSTALL/.env.production.example"; echo "EMAIL_DISABLED=true"; } > "$INSTALL/.env.production"

    EMAIL_SMTP_HOST=smtp.mail.example.org EMAIL_SMTP_USER=mailer EMAIL_SMTP_PASS='p&ss|w=rd' run_configure
    [ "$status" -eq 0 ]

    local env_file="$INSTALL/.env.production"
    [ "$(env_get "$env_file" EMAIL_SMTP_HOST)" = smtp.mail.example.org ]
    [ "$(env_get "$env_file" EMAIL_SMTP_USER)" = mailer ]
    [ "$(env_get "$env_file" EMAIL_SMTP_PASS)" = 'p&ss|w=rd' ]
    [ "$(env_get "$env_file" EMAIL_DISABLED)" = false ]
}

@test "a host added to .env.production by hand keeps app mail on" {
    sed -e 's|^# EMAIL_SMTP_HOST=.*|EMAIL_SMTP_HOST=smtp.by-hand.example.org|' \
        "$INSTALL/.env.production.example" > "$INSTALL/.env.production"

    run_configure
    [ "$status" -eq 0 ]

    [ "$(env_get "$INSTALL/.env.production" EMAIL_SMTP_HOST)" = smtp.by-hand.example.org ]
    [ "$(env_get "$INSTALL/.env.production" EMAIL_DISABLED)" = false ]
}

@test "a host added by hand to a mail-disabled install turns app mail back on" {
    run_configure
    [ "$status" -eq 0 ]
    [ "$(env_get "$INSTALL/.env.production" EMAIL_DISABLED)" = true ]

    env_set "$INSTALL/.env.production" EMAIL_SMTP_HOST smtp.by-hand.example.org
    run_configure
    [ "$status" -eq 0 ]

    [ "$(env_get "$INSTALL/.env.production" EMAIL_SMTP_HOST)" = smtp.by-hand.example.org ]
    [ "$(env_get "$INSTALL/.env.production" EMAIL_DISABLED)" = false ]
}
