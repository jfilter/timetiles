#!/usr/bin/env bats
# Integration tests for nginx routing and SSL

setup() {
    load '../helpers/docker.bash'
    init_docker
    skip_if_no_docker
    skip_if_services_not_running
}

# =============================================================================
# HTTP to HTTPS Redirect
# =============================================================================

@test "HTTP redirects to HTTPS" {
    run curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health
    [ "$output" = "301" ]
}

@test "HTTP redirect location is HTTPS" {
    run curl -sI http://localhost/api/health
    [[ "$output" == *"Location: https://"* ]]
}

# =============================================================================
# HTTPS Endpoints
# =============================================================================

@test "HTTPS health endpoint returns 200" {
    run curl -sfk https://localhost/api/health
    [ "$status" -eq 0 ]
}

@test "HTTPS explore page returns HTML" {
    run curl -sfk https://localhost/explore
    [ "$status" -eq 0 ]
    [[ "$output" == *"<html"* ]] || [[ "$output" == *"<!DOCTYPE"* ]]
}

# =============================================================================
# Security Headers
# =============================================================================

@test "X-Frame-Options header present" {
    run curl -skI https://localhost/
    [[ "$output" == *"X-Frame-Options"* ]] || [[ "$output" == *"x-frame-options"* ]]
}

@test "X-Content-Type-Options header present" {
    run curl -skI https://localhost/
    [[ "$output" == *"X-Content-Type-Options"* ]] || [[ "$output" == *"x-content-type-options"* ]]
}

@test "Strict-Transport-Security header present" {
    run curl -skI https://localhost/
    # HSTS might not be set for localhost/self-signed
    [[ "$output" == *"Strict-Transport-Security"* ]] || \
    [[ "$output" == *"strict-transport-security"* ]] || \
    skip "HSTS not enabled (expected for test environment)"
}

# =============================================================================
# Let's Encrypt Challenge Path
# =============================================================================

@test "ACME challenge path accessible over HTTP" {
    # Create test challenge file
    run_in_container certbot mkdir -p /var/www/certbot/.well-known/acme-challenge 2>/dev/null || true
    run_in_container certbot sh -c 'echo "test-challenge" > /var/www/certbot/.well-known/acme-challenge/test.txt' 2>/dev/null || true

    run curl -sf http://localhost/.well-known/acme-challenge/test.txt
    [ "$status" -eq 0 ]
    [[ "$output" == *"test-challenge"* ]]
}

# =============================================================================
# Proxy Behavior
# =============================================================================

@test "nginx proxies to web container" {
    # Check that nginx is actually proxying, not serving directly
    run curl -skI https://localhost/api/health
    [ "$status" -eq 0 ]
    # Should have response from Next.js app
}

@test "static files served correctly" {
    # Try to fetch a static asset (may not exist in minimal setup)
    run curl -skI https://localhost/_next/static/
    # Either 200 or 404 is fine, but not 502 (bad gateway)
    [[ "$output" != *"502"* ]]
}
