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
