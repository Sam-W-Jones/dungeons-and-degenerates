#!/usr/bin/env bash
# Dungeons and Degenerates — screenshot the game (index.html) in headless Chrome.
#
#   tools/shot.sh "debug=1&screen=combat&encounter=a1_goblin_ambush&seed=3" .tmp/combat.png
#   tools/shot.sh "debug=1&screen=gallery&gallery=heroes" .tmp/heroes.png 1600x900
#   tools/shot.sh "debug=1&screen=title" .tmp/title.png 1280x720 4000
#
# Args: <query> [out.png=.tmp/shot.png] [WxH=1280x720] [virtual-ms=3500]
# Prints the output path plus any console errors. View the PNG with the Read tool.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || CHROME="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
QUERY="${1:-debug=1}"
OUT="${2:-$ROOT/.tmp/shot.png}"
SIZE="${3:-1280x720}"
BUDGET="${4:-3500}"
W="${SIZE%x*}"; H="${SIZE#*x}"
mkdir -p "$ROOT/.tmp" "$(dirname "$OUT")"
WORK="$(mktemp -d "$ROOT/.tmp/shot-XXXXXX")"
case "$OUT" in /*|?:*) ABS_OUT="$OUT" ;; *) ABS_OUT="$(pwd)/$OUT" ;; esac
URL="file:///$(cygpath -m "$ROOT")/index.html?$QUERY"
. "$ROOT/tools/chrome_slot.sh"
chrome_slot_acquire

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --disable-extensions --allow-file-access-from-files --hide-scrollbars \
  --user-data-dir="$WORK/profile" --window-size="$W,$H" --virtual-time-budget="$BUDGET" \
  --run-all-compositor-stages-before-draw --enable-logging=stderr --v=0 \
  --screenshot="$(cygpath -m "$ABS_OUT")" "$URL" >/dev/null 2>"$WORK/stderr.txt"

echo "screenshot: $ABS_OUT"
grep -E "CONSOLE" "$WORK/stderr.txt" | grep -iE "error|uncaught|warn|\[DD\]" | grep -viE "Missing value path|DevTools" \
  | sed -e 's/^.*INFO:CONSOLE[^]]*\] //' | head -40
rm -rf "$WORK"
