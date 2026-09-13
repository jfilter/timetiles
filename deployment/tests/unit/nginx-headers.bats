#!/usr/bin/env bats
# Static checks on nginx header inheritance, without starting nginx.

setup() {
    load '../helpers/common.bash'
}

# nginx inherits add_header only into blocks that declare none of their own.
locations_dropping_security_headers() {
    awk '
        /^[[:space:]]*#/ { next }
        !inloc && /^[[:space:]]*location[[:space:]]/ { inloc = 1; depth = 0; hdr = 0; inc = 0; name = $0 }
        inloc {
            if ($0 ~ /add_header/) hdr = 1
            if ($0 ~ /include[[:space:]]+\/etc\/nginx\/security-headers/) inc = 1
            opened = gsub(/\{/, "{"); closed = gsub(/\}/, "}")
            depth += opened - closed
            if (depth == 0 && (opened || closed)) {
                if (hdr && !inc) print FILENAME ":" name
                inloc = 0
            }
        }
    ' "$@"
}

@test "nginx locations with their own add_header re-include the security headers" {
    run locations_dropping_security_headers \
        "$DEPLOY_DIR/nginx/sites-enabled/app.conf" "$DEPLOY_DIR/allinone/nginx.conf"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "header inheritance check detects a location that drops the security headers" {
    local conf="$BATS_TEST_TMPDIR/site.conf"
    printf 'server {\n    location /x {\n        add_header Cache-Control "public";\n    }\n}\n' > "$conf"
    run locations_dropping_security_headers "$conf"
    [[ "$output" == *"location /x"* ]]
}
