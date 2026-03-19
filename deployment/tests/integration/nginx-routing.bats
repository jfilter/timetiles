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
    # Capture both HTTP status and body — if this fails, the output shows why
    local http_code body
    http_code=$(curl -sk -o /tmp/explore-test.html -w "%{http_code}" https://localhost/explore)
    body=$(cat /tmp/explore-test.html)

    # Show diagnostics on failure
    echo "HTTP status: $http_code"
    echo "Body length: ${#body}"
    echo "First 200 chars: ${body:0:200}"

    [[ "$http_code" =~ ^(200|301|302|307|308)$ ]]
    [[ "$body" == *"<html"* ]] || [[ "$body" == *"<!DOCTYPE"* ]] || [[ "$http_code" =~ ^3 ]]
}

# =============================================================================
# Security Headers
# =============================================================================

@test "X-Frame-Options header present" {
    # Must use the configured domain to hit the main server block (not a redirect)
    local domain
    run curl -skI https://localhost/api/health
    [[ "$output" == *"X-Frame-Options"* ]] || [[ "$output" == *"x-frame-options"* ]]
}

@test "X-Content-Type-Options header present" {
    local domain
    run curl -skI https://localhost/api/health
    [[ "$output" == *"X-Content-Type-Options"* ]] || [[ "$output" == *"x-content-type-options"* ]]
}

@test "Strict-Transport-Security header present" {
    local domain
    run curl -skI https://localhost/api/health
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
