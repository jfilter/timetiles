#!/usr/bin/env bats
# Unit tests for step 13's ufw rules-file writer. The fence itself is proven
# with real connections by vm/scraper-egress.bats.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    STEP13="$BOOTSTRAP_DIR/steps/13-scraper-setup.sh"
    RULES_FILE="$TEST_TEMP_DIR/before.rules"

    cat > "$RULES_FILE" <<'RULES'
*filter
:ufw-before-output - [0:0]
# End required lines

# allow all on loopback
-A ufw-before-output -o lo -j ACCEPT
COMMIT
RULES
}

teardown() {
    teardown_temp_dir
}

# A separate process: die inside a sourced step signals the top-level shell.
write_block() {
    run bash -c 'source "$1/lib/common.sh"; source "$2"; write_ufw_block "$3" "$4"' \
        _ "$BOOTSTRAP_DIR" "$STEP13" "$RULES_FILE" "$1"
}

@test "the block lands right after the required lines, ahead of the loopback accept" {
    write_block "-A ufw-before-output -d 10.0.0.0/8 -j REJECT"
    [ "$status" -eq 0 ]

    run grep -n -x -e '# End required lines' -e '# BEGIN timetiles scraper egress' \
        -e '-A ufw-before-output -d 10.0.0.0/8 -j REJECT' -e '# END timetiles scraper egress' \
        -e '-A ufw-before-output -o lo -j ACCEPT' "$RULES_FILE"
    [ "${lines[0]%%:*}" -eq 3 ]
    [ "${lines[1]%%:*}" -eq 4 ]
    [ "${lines[2]%%:*}" -eq 5 ]
    [ "${lines[3]%%:*}" -eq 6 ]
    [[ "${lines[4]}" == *"-o lo -j ACCEPT" ]]
}

@test "writing twice leaves one block" {
    write_block "-A ufw-before-output -d 10.0.0.0/8 -j REJECT"
    local first
    first="$(cat "$RULES_FILE")"

    write_block "-A ufw-before-output -d 10.0.0.0/8 -j REJECT"
    [ "$status" -eq 0 ]
    [ "$(cat "$RULES_FILE")" = "$first" ]
}

@test "a changed rule set replaces the old block instead of adding to it" {
    write_block "-A ufw-before-output -d 10.0.0.0/8 -j REJECT"
    write_block $'-A ufw-before-output -d 10.0.0.0/8 -j REJECT\n-A ufw-before-output -d 100.64.0.0/10 -j REJECT'
    [ "$status" -eq 0 ]

    run grep -c '# BEGIN timetiles scraper egress' "$RULES_FILE"
    [ "$output" -eq 1 ]
    run grep -c -- '-j REJECT' "$RULES_FILE"
    [ "$output" -eq 2 ]
}

@test "a rules file without ufw's anchor fails instead of being written blind" {
    printf '*filter\nCOMMIT\n' > "$RULES_FILE"

    write_block "-A ufw-before-output -d 10.0.0.0/8 -j REJECT"
    [ "$status" -ne 0 ]
    run grep -c 'timetiles scraper egress' "$RULES_FILE"
    [ "$output" -eq 0 ]
}

# apply_sandbox_egress_rules with ufw stubbed (or absent) and the rules writer recorded.
# PATH leaves out /usr/sbin, where a host's real ufw lives.
apply_rules() {
    run env PATH="$TEST_TEMP_DIR/bin:/usr/bin:/bin" SKIP_FIREWALL="${SKIP_FIREWALL:-}" bash -c '
        source "$1/lib/common.sh"; source "$2"
        write_ufw_block() { echo "write_ufw_block $1"; }
        apply_sandbox_egress_rules "$(id -un)"' _ "$BOOTSTRAP_DIR" "$STEP13"
}

stub_ufw() {
    mkdir -p "$TEST_TEMP_DIR/bin"
    printf '#!/bin/sh\n[ "$1" = status ] && echo "Status: %s"\nexit 0\n' "$1" > "$TEST_TEMP_DIR/bin/ufw"
    chmod +x "$TEST_TEMP_DIR/bin/ufw"
}

@test "an active ufw gets the egress rules without a warning" {
    stub_ufw active

    apply_rules
    [ "$status" -eq 0 ]
    assert_contains "$output" "write_ufw_block /etc/ufw/before.rules"
    assert_contains "$output" "write_ufw_block /etc/ufw/before6.rules"
    assert_not_contains "$output" "⚠"
}

@test "scraper setup fails when ufw is not installed" {
    apply_rules
    [ "$status" -ne 0 ]
    assert_contains "$output" "Scraper egress firewall unavailable"
    assert_contains "$output" "SKIP_FIREWALL=true"
    assert_not_contains "$output" "write_ufw_block"
}

@test "scraper setup fails when ufw is installed but inactive" {
    stub_ufw inactive

    apply_rules
    [ "$status" -ne 0 ]
    assert_contains "$output" "Scraper egress firewall unavailable"
}

@test "SKIP_FIREWALL=true lets setup continue without ufw, with a warning" {
    SKIP_FIREWALL=true apply_rules
    [ "$status" -eq 0 ]
    assert_contains "$output" "scraper egress is not filtered here"
}
