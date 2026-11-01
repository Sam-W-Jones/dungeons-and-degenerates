#!/usr/bin/env bash
# Dungeons and Degenerates — machine-wide cap on concurrent headless Chrome runs (sourced by tools/*.sh).
# Many agents launching Chrome at once exhausted the machine's memory and got the app killed, so every
# headless run takes one of DD_CHROME_SLOTS (default 3) slots under .tmp/locks/ and waits for a free one.
#   ROOT=...; . "$ROOT/tools/chrome_slot.sh"; chrome_slot_acquire    # released automatically on exit
chrome_slot_release() {
  if [ -n "${CHROME_SLOT:-}" ]; then rm -rf "$CHROME_SLOT"; CHROME_SLOT=''; fi
}

chrome_slot_acquire() {
  local dir="${ROOT:?ROOT must be set}/.tmp/locks" max="${DD_CHROME_SLOTS:-3}" i d p waited=0
  mkdir -p "$dir"
  while :; do
    for ((i = 1; i <= max; i++)); do
      d="$dir/chrome.$i"
      if mkdir "$d" 2>/dev/null; then
        echo "$$" > "$d/pid"
        CHROME_SLOT="$d"
        trap 'chrome_slot_release' EXIT
        trap 'chrome_slot_release; exit 130' INT TERM
        return 0
      fi
      p="$(cat "$d/pid" 2>/dev/null)"
      if [ -n "$p" ]; then
        kill -0 "$p" 2>/dev/null || rm -rf "$d"   # holder is gone (crashed or killed run)
      elif [ -n "$(find "$d" -maxdepth 0 -mmin +2 2>/dev/null)" ]; then
        rm -rf "$d"                                # created but never claimed
      fi
    done
    sleep 1
    waited=$((waited + 1))
    if [ $((waited % 30)) -eq 0 ]; then
      echo "[chrome_slot] waiting ${waited}s for a free headless Chrome slot (max $max at once)" >&2
    fi
  done
}
