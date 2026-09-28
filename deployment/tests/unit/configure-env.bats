#!/usr/bin/env bats
# Step 06 reads existing secrets back from .env.production.

setup() {
    load '../helpers/common.bash'
    load_lib common
    load_step 06-configure
}

@test "read_existing_secret returns a quoted value without its quotes" {
    printf 'DB_PASSWORD="abc=="\n' > "$BATS_TEST_TMPDIR/env"
    [ "$(read_existing_secret "$BATS_TEST_TMPDIR/env" DB_PASSWORD)" = "abc==" ]
}
