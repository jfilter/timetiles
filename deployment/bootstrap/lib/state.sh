#!/bin/bash
# TimeTiles Bootstrap - State Management
# Track completed steps for resumable deployments

# Prevent multiple sourcing
[[ -n "${_BOOTSTRAP_STATE_LOADED:-}" ]] && return 0
_BOOTSTRAP_STATE_LOADED=1

# ============================================================================
# CONFIGURATION
# ============================================================================
STATE_DIR="${STATE_DIR:-/var/lib/timetiles}"
STATE_FILE="${STATE_FILE:-$STATE_DIR/.bootstrap-state}"
LOCK_FILE="${LOCK_FILE:-$STATE_DIR/.bootstrap-lock}"

# ============================================================================
# STATE MANAGEMENT
# ============================================================================

# Initialize state directory and file
init_state() {
    if [[ ! -d "$STATE_DIR" ]]; then
        mkdir -p "$STATE_DIR"
        chmod 755 "$STATE_DIR"
    fi

    if [[ ! -f "$STATE_FILE" ]]; then
        cat > "$STATE_FILE" << 'EOF'
# TimeTiles Bootstrap State
# Format: STEP_NAME=TIMESTAMP
# This file tracks completed bootstrap steps for resumability
EOF
        chmod 600 "$STATE_FILE"
    fi
}

# Acquire lock to prevent concurrent runs
acquire_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null)
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            print_error "Another bootstrap process is running (PID: $pid)"
            print_info "If this is incorrect, remove $LOCK_FILE"
            return 1
        fi
        # Stale lock file, remove it
        rm -f "$LOCK_FILE"
    fi

    echo $$ > "$LOCK_FILE"
    return 0
}

# Release lock
release_lock() {
    rm -f "$LOCK_FILE"
}

# Mark a step as completed
mark_completed() {
    local step="$1"
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Remove existing entry if any
    if [[ -f "$STATE_FILE" ]]; then
        grep -v "^${step}=" "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null || true
        mv "${STATE_FILE}.tmp" "$STATE_FILE"
    fi

    # Add new entry
    echo "${step}=${ts}" >> "$STATE_FILE"
}

# Check if a step is completed
is_completed() {
    local step="$1"
    [[ -f "$STATE_FILE" ]] && grep -q "^${step}=" "$STATE_FILE" 2>/dev/null
}

# Get completion timestamp for a step
get_completion_time() {
    local step="$1"
    if [[ -f "$STATE_FILE" ]]; then
        grep "^${step}=" "$STATE_FILE" 2>/dev/null | cut -d= -f2
    fi
}

# Get list of all completed steps
get_completed_steps() {
    if [[ -f "$STATE_FILE" ]]; then
        grep -v "^#" "$STATE_FILE" 2>/dev/null | cut -d= -f1 | grep -v "^$"
    fi
}

# Get the last completed step
get_last_completed() {
    if [[ -f "$STATE_FILE" ]]; then
        grep -v "^#" "$STATE_FILE" 2>/dev/null | tail -1 | cut -d= -f1
    fi
}

# Clear all state (fresh start)
clear_state() {
    if [[ -f "$STATE_FILE" ]]; then
        rm -f "$STATE_FILE"
        print_success "State cleared - will start fresh"
    fi
    init_state
}

# Display current state/progress
show_state() {
    local steps=("$@")

    print_header "Bootstrap Progress"

    if [[ ! -f "$STATE_FILE" ]]; then
        print_info "No bootstrap state found - will start fresh"
        return
    fi

    for step in "${steps[@]}"; do
        local completion_time
        completion_time=$(get_completion_time "$step")

        if [[ -n "$completion_time" ]]; then
            echo -e "${GREEN}✓${NC} ${step} (completed: $completion_time)"
        else
            echo -e "${YELLOW}○${NC} ${step} (pending)"
        fi
    done

    echo ""
}

# Save configuration values to state (for resume)
save_config_to_state() {
    local key="$1"
    local value="$2"

    # Use a separate config section in state file
    local config_file="${STATE_DIR}/.bootstrap-config"

    if [[ ! -f "$config_file" ]]; then
        touch "$config_file"
        chmod 600 "$config_file"
    fi

    # Remove existing entry
    grep -v "^${key}=" "$config_file" > "${config_file}.tmp" 2>/dev/null || true
    mv "${config_file}.tmp" "$config_file"

    # Add new entry
    echo "${key}=${value}" >> "$config_file"
}

# Load configuration from state
load_config_from_state() {
    local config_file="${STATE_DIR}/.bootstrap-config"

    if [[ -f "$config_file" ]]; then
        # Source the config file to set variables
        # shellcheck disable=SC1090
        source "$config_file"
        return 0
    fi
    return 1
}
