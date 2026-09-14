#!/bin/bash
# Lima VM plumbing shared by the VM test runners.
#
# Callers set VM_NAME and VM_CMD_TIMEOUT (seconds per run_in_vm command) and
# source colors.sh before this file.

# Pin LIMA_HOME. Colima points it at ~/.colima/_lima for its own VM; inheriting
# that would create this instance inside Colima's home.
export LIMA_HOME="$HOME/.lima"

# Run a command in the VM as root. Always pass an explicit --workdir: without
# one Lima defaults to the host's cwd, which need not exist in the guest.
vm_sudo() {
    limactl shell -y --workdir / "$VM_NAME" sudo bash -c "$1"
}

vm_running() {
    [[ "$(limactl list "$VM_NAME" --format '{{.Status}}' 2>/dev/null)" == "Running" ]]
}

vm_exists() {
    limactl list --format '{{.Name}}' 2>/dev/null | grep -qx "$VM_NAME"
}

# Run a long command in the VM via nohup, polling for completion.
#
# limactl holds a persistent SSH connection and is far less prone to the
# disconnects that forced this pattern under Vagrant, but a detached job still
# survives host sleep and gives us progress output during multi-minute builds.
#
# The payload is shipped as a file rather than interpolated through nested
# quotes — commands carry their own quoting and the inline form did not
# survive another layer of escaping.
run_in_vm() {
    local desc="$1"
    local cmd="$2"
    local log="/tmp/timetiles-vm-cmd.log"
    local exitfile="/tmp/timetiles-vm-cmd.exit"
    local script="/tmp/timetiles-vm-cmd.sh"

    print_info "$desc"

    # Every log line is timestamped so per-step durations can be read off the
    # log afterwards; without that, "which step got slower" is unanswerable.
    # The exit code is captured inside the group, so $? is still the command's
    # and not the timestamper's, and it reaches $exitfile by redirect rather
    # than through the pipe.
    {
        echo '#!/bin/bash'
        echo "rm -f $exitfile"
        echo '{'
        echo "$cmd"
        echo "echo \$? > $exitfile"
        # printf, not echo: the awk program contains a literal \n that must reach
        # awk unexpanded. bash's echo leaves it alone, but sh's does not (SC2028).
        printf '%s\n' '} 2>&1 | awk '"'"'{ printf "%s %s\n", strftime("%H:%M:%S"), $0; fflush() }'"'"
    } | limactl shell -y --workdir / "$VM_NAME" sudo tee "$script" >/dev/null

    vm_sudo "nohup bash $script > $log 2>&1 &"

    local started=$SECONDS
    local deadline=$((SECONDS + VM_CMD_TIMEOUT))
    while ! vm_sudo "test -f $exitfile" 2>/dev/null; do
        if (( SECONDS > deadline )); then
            echo ""
            echo -e "${RED}Timed out after ${VM_CMD_TIMEOUT}s: $desc${NC}"
            vm_sudo "tail -30 $log" || true
            return 1
        fi
        local progress
        progress=$(vm_sudo "tail -1 $log 2>/dev/null" 2>/dev/null | tr -d '\r')
        if [[ -n "$progress" ]]; then
            printf "\r  %-80s" "${progress:0:80}"
        fi
        sleep 10
    done
    echo ""

    # Deliberately not silenced: a transport failure here must not read as success.
    local exit_code
    exit_code=$(vm_sudo "cat $exitfile" | tr -d '\r\n ')

    if [[ "$exit_code" != "0" ]]; then
        echo -e "${RED}Failed: $desc${NC}"
        vm_sudo "tail -30 $log" || true
        return 1
    fi

    echo -e "${GREEN}✓ $desc ($(( (SECONDS - started) / 60 ))m $(( (SECONDS - started) % 60 ))s)${NC}"
}

# Start Lima with INT/TERM/HUP ignored.
#
# The hostagent that keeps the VM alive is a child of whatever starts it and
# inherits that process group. Anything that interrupts this script -- a
# timeout, a cancelled command, an editor closing the terminal -- delivers the
# signal to the whole group and takes the VM down with it, usually mid-run,
# where it looks like a test failure rather than a killed VM.
#
# Ignored signal dispositions survive fork and exec, so a subshell that ignores
# them hands the hostagent the same immunity. This does not detach the process
# group (macOS has no setsid), it makes the processes indifferent to it.
lima_detached() {
    ( trap '' INT TERM HUP; "$@" )
}

# Start the VM if needed and wait until it is usable.
vm_start() {
    if ! vm_running; then
        print_info "Starting VM..."
        lima_detached limactl start -y --timeout 15m "$VM_NAME"
    fi

    # Let the boot settle before bootstrap starts its own apt work, otherwise
    # step 01 contends with apt-daily and unattended-upgrades for the dpkg lock.
    # This belongs here and not in lima.yaml's provisioning: Lima runs system
    # provision scripts as part of cloud-init, so waiting from in there deadlocks.
    vm_sudo "cloud-init status --wait >/dev/null 2>&1 || true"
    echo -e "${GREEN}✓ VM ready${NC}"

    ensure_logind_responsive
}

# Work around a boot race in this VM, not a TimeTiles bug: on vz, systemd-logind
# can come up spinning at 100% CPU in userspace and then answers no DBus call at
# all. Everything needing a logind round-trip blocks forever -- `loginctl
# enable-linger` and, because its default cgroup manager is systemd, every
# rootless Podman call in bootstrap step 13. Podman as root stays fine, which is
# what pins the cause on logind rather than on Podman.
#
# Restarting clears it (the race is at boot; the restarted process idles at
# ~0%), so probe and restart rather than restarting unconditionally -- that
# keeps the healthy path untouched and makes a recurrence visible.
ensure_logind_responsive() {
    print_info "Checking systemd-logind responsiveness..."
    if vm_sudo "timeout 10 busctl call org.freedesktop.login1 /org/freedesktop/login1 \
            org.freedesktop.DBus.Peer Ping >/dev/null 2>&1"; then
        echo -e "${GREEN}✓ logind responsive${NC}"
        return 0
    fi

    print_info "logind unresponsive (known vz boot race), restarting..."
    vm_sudo "systemctl restart systemd-logind"
    # Verify rather than assume: if the restart does not help, rootless Podman
    # cannot work and step 13 would burn its full timeouts before degrading.
    if vm_sudo "sleep 3; timeout 10 busctl call org.freedesktop.login1 /org/freedesktop/login1 \
            org.freedesktop.DBus.Peer Ping >/dev/null 2>&1"; then
        echo -e "${GREEN}✓ logind responsive after restart${NC}"
    else
        echo -e "${RED}logind still unresponsive -- rootless Podman will not work${NC}" >&2
        exit 1
    fi
}
