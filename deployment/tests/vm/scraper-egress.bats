#!/usr/bin/env bats
# Scraper sandbox egress, proven with real connections.
#
# Runs as root inside the throwaway VM from run-egress-vm.sh, never in CI: the
# fixtures are network namespaces. Every container probe runs as the app user
# through step 13's own podman_as, the way the runner starts scrapers.

APP_USER="timetiles"
PROBE_IMAGE="${PROBE_IMAGE:-docker.io/library/alpine:3.20}"
FIXTURE_DIR="/run/tt-egress"
PROBE_PORT=8080

# A private neighbour on the compose subnet: routed from the host, not the host.
PRIVATE_NS="tt-egress-private"
PRIVATE_HOST_IP="172.16.238.1"
PRIVATE_PEER_IP="172.16.238.10"

# TEST-NET-2 is in no blocked range, so it stands in for the internet without
# the tests depending on, or sending traffic to, a real external host.
PUBLIC_NS="tt-egress-public"
PUBLIC_HOST_IP="198.51.100.1"
PUBLIC_PEER_IP="198.51.100.10"

LOOPBACK_PORT=8081
HOST_ADDRESS_PORT=8082

# slirp4netns's alias for the host's loopback inside the rootless network.
SLIRP_HOST_GATEWAY="10.0.2.2"

load_step13() {
    load '../helpers/common.bash'
    _source_bootstrap_file "$BOOTSTRAP_DIR/lib/common.sh"
    _source_bootstrap_file "$BOOTSTRAP_DIR/steps/13-scraper-setup.sh"
}

# The host's own primary address; a route lookup sends no packet.
host_address() {
    ip -4 route get 198.18.0.1 | awk '{ for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1) }'
}

# Usage: serve <name> <bind-ip> <port> [as-user] [netns]
serve() {
    local name="$1" ip="$2" port="$3" as_user="${4:-root}" ns="${5:-}"
    local dir="$FIXTURE_DIR/$name"
    local -a prefix=()
    if [[ -n "$ns" ]]; then
        prefix=(ip netns exec "$ns")
    fi

    mkdir -p "$dir"
    echo "reached-$name" > "$dir/marker"
    chmod -R a+rX "$FIXTURE_DIR"

    # Detached from bats' descriptors, or the suite waits on them forever.
    "${prefix[@]}" setpriv --reuid="$as_user" --regid="$as_user" --clear-groups \
        python3 -m http.server "$port" --bind "$ip" --directory "$dir" \
        </dev/null >/dev/null 2>&1 3>&- &
    echo $! > "$FIXTURE_DIR/$name.pid"

    local _
    for _ in $(seq 50); do
        "${prefix[@]}" curl -fsS --max-time 1 "http://$ip:$port/marker" >/dev/null 2>&1 && return 0
        sleep 0.1
    done
    echo "fixture listener $name did not come up on $ip:$port" >&2
    return 1
}

# Usage: neighbour <netns> <veth-prefix> <host-ip> <peer-ip>
neighbour() {
    local ns="$1" veth="$2" host_ip="$3" peer_ip="$4"

    ip netns add "$ns"
    ip link add "$veth-h" type veth peer name "$veth-p"
    ip link set "$veth-p" netns "$ns"
    ip addr add "$host_ip/24" dev "$veth-h"
    ip link set "$veth-h" up
    ip -n "$ns" addr add "$peer_ip/24" dev "$veth-p"
    ip -n "$ns" link set "$veth-p" up
    ip -n "$ns" link set lo up
    ip -n "$ns" route add default via "$host_ip"
}

remove_fixtures() {
    local pid
    for pid in "$FIXTURE_DIR"/*.pid; do
        if [[ -f "$pid" ]]; then
            kill "$(cat "$pid")" 2>/dev/null || true
        fi
    done
    ip netns del "$PRIVATE_NS" 2>/dev/null || true
    ip netns del "$PUBLIC_NS" 2>/dev/null || true
    rm -rf "$FIXTURE_DIR"
}

setup_file() {
    remove_fixtures
    neighbour "$PRIVATE_NS" tteg-priv "$PRIVATE_HOST_IP" "$PRIVATE_PEER_IP"
    neighbour "$PUBLIC_NS" tteg-pub "$PUBLIC_HOST_IP" "$PUBLIC_PEER_IP"
    serve private "$PRIVATE_PEER_IP" "$PROBE_PORT" root "$PRIVATE_NS"
    serve public "$PUBLIC_PEER_IP" "$PROBE_PORT" root "$PUBLIC_NS"
    serve loopback 127.0.0.1 "$LOOPBACK_PORT"
    serve host-address "$(host_address)" "$HOST_ADDRESS_PORT"
}

teardown_file() {
    remove_fixtures
}

setup() {
    load_step13
}

# Usage: container_fetch <ip> <port>
# Network and isolation flags as in apps/timescrape's container-config.ts.
container_fetch() {
    podman_as "$APP_USER" 120 run --rm --userns=auto --cap-drop=ALL \
        --network=scraper-sandbox --dns=1.1.1.1 "$PROBE_IMAGE" \
        wget -T 5 -q -O - "http://$1:$2/marker" </dev/null 2>&1
}

# Usage: app_user_fetch <ip> <port>
app_user_fetch() {
    sudo -u "$APP_USER" curl -fsS --max-time 5 "http://$1:$2/marker" </dev/null 2>&1
}

# =============================================================================
# Controls: without these, a failed connection could be a dead fixture
# =============================================================================

@test "control: the host reaches the private neighbour" {
    run curl -fsS --max-time 5 "http://$PRIVATE_PEER_IP:$PROBE_PORT/marker"
    [ "$status" -eq 0 ]
    [ "$output" = "reached-private" ]
}

@test "control: the host reaches the public-style neighbour" {
    run curl -fsS --max-time 5 "http://$PUBLIC_PEER_IP:$PROBE_PORT/marker"
    [ "$status" -eq 0 ]
    [ "$output" = "reached-public" ]
}

@test "control: the host-bound listeners answer" {
    run curl -fsS --max-time 5 "http://127.0.0.1:$LOOPBACK_PORT/marker"
    [ "$output" = "reached-loopback" ]
    run curl -fsS --max-time 5 "http://$(host_address):$HOST_ADDRESS_PORT/marker"
    [ "$output" = "reached-host-address" ]
}

# =============================================================================
# The sandbox
# =============================================================================

@test "a scraper reaches a public destination" {
    run container_fetch "$PUBLIC_PEER_IP" "$PROBE_PORT"
    echo "$output"
    [ "$status" -eq 0 ]
    [[ "$output" == *"reached-public"* ]]
}

@test "a scraper cannot reach a private neighbour" {
    run container_fetch "$PRIVATE_PEER_IP" "$PROBE_PORT"
    echo "$output"
    [ "$status" -ne 0 ]
    [[ "$output" != *"reached-private"* ]]
}

@test "a scraper cannot reach services bound to the host's loopback" {
    run container_fetch "$SLIRP_HOST_GATEWAY" "$LOOPBACK_PORT"
    echo "$output"
    [ "$status" -ne 0 ]
    [[ "$output" != *"reached-loopback"* ]]
}

@test "a scraper cannot reach the host through its own address" {
    run container_fetch "$(host_address)" "$HOST_ADDRESS_PORT"
    echo "$output"
    [ "$status" -ne 0 ]
    [[ "$output" != *"reached-host-address"* ]]
}

# =============================================================================
# What the runner and the CLI, running as the same user, still need
# =============================================================================

@test "the app user still reaches loopback services" {
    run app_user_fetch 127.0.0.1 "$LOOPBACK_PORT"
    [ "$status" -eq 0 ]
    [ "$output" = "reached-loopback" ]
}

@test "the app user still reaches public destinations" {
    run app_user_fetch "$PUBLIC_PEER_IP" "$PROBE_PORT"
    [ "$status" -eq 0 ]
    [ "$output" = "reached-public" ]
}

# A query for "localhost" answers locally, so nothing leaves the VM.
@test "the app user can still query the local DNS stub" {
    run sudo -u "$APP_USER" python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.settimeout(5)
s.sendto(bytes.fromhex('abcd01000001000000000000096c6f63616c686f73740000010001'), ('127.0.0.53', 53))
print('answered', len(s.recv(512)))
"
    [ "$status" -eq 0 ]
    [[ "$output" == *"answered"* ]]
}

# Replies on an accepted connection are not NEW, so the fence must leave them be.
@test "the runner port still answers the compose network" {
    serve runner "$PRIVATE_HOST_IP" "$SCRAPER_RUNNER_PORT" "$APP_USER"

    run ip netns exec "$PRIVATE_NS" curl -fsS --max-time 5 \
        "http://$PRIVATE_HOST_IP:$SCRAPER_RUNNER_PORT/marker"
    [ "$status" -eq 0 ]
    [ "$output" = "reached-runner" ]
}

# =============================================================================
# The rules themselves
# =============================================================================

@test "the fence is loaded for IPv4 and IPv6" {
    local uid
    uid="$(id -u "$APP_USER")"

    run bash -c "iptables -S ufw-before-output | grep -c -- '--uid-owner $uid'"
    [ "$output" -eq $(( ${#SCRAPER_BLOCKED_DESTINATIONS[@]} + 1 )) ]
    run bash -c "ip6tables -S ufw6-before-output | grep -c -- '--uid-owner $uid'"
    [ "$output" -eq $(( ${#SCRAPER_BLOCKED_DESTINATIONS_V6[@]} + 1 )) ]
}

@test "re-applying the egress rules changes nothing" {
    local before after
    before="$(iptables -S; ip6tables -S; cat /etc/ufw/before.rules /etc/ufw/before6.rules)"

    run apply_sandbox_egress_rules "$APP_USER"
    [ "$status" -eq 0 ]

    after="$(iptables -S; ip6tables -S; cat /etc/ufw/before.rules /etc/ufw/before6.rules)"
    [ "$before" = "$after" ]
}
