#!/usr/bin/env bash
# Dungeons and Degenerates — run the headless test harness (tests/test.html) in Chrome and print results.
#
#   tools/test.sh                         # all suites
#   tools/test.sh "suite=engine,mapgen"   # name substrings (comma separated)
#   tools/test.sh "tag=content&n=5&verbose=1"
#   CONSOLE=1 tools/test.sh               # also print browser console warnings/errors
#
# Exit code: 0 on PASS, 1 on FAIL / harness crash.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || CHROME="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
QUERY="${1:-}"
BUDGET="${VTB:-600000}"
mkdir -p "$ROOT/.tmp"
WORK="$(mktemp -d "$ROOT/.tmp/test-XXXXXX")"
URL="file:///$(cygpath -m "$ROOT")/tests/test.html?$QUERY"
. "$ROOT/tools/chrome_slot.sh"
chrome_slot_acquire

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --disable-extensions --allow-file-access-from-files \
  --user-data-dir="$WORK/profile" --virtual-time-budget="$BUDGET" \
  --enable-logging=stderr --v=0 \
  --dump-dom "$URL" >"$WORK/dom.html" 2>"$WORK/stderr.txt"

decode() { sed -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&quot;/"/g' -e "s/&#39;/'/g" -e 's/&amp;/\&/g'; }

SUMMARY="$(sed -n 's:.*<pre id="summary">\(.*\)</pre>.*:\1:p' "$WORK/dom.html" | head -1 | decode)"
# results <pre> spans many lines
RESULTS="$(awk '/<pre id="results">/{flag=1} flag{print} /<\/pre>/{if(flag){flag=0}}' "$WORK/dom.html" | sed -e 's:.*<pre id="results">::' -e 's:</pre>.*::' | decode)"

echo "$RESULTS"
echo
echo "SUMMARY: ${SUMMARY:-<no summary — harness did not finish; see console below>}"

if [ "${CONSOLE:-0}" = "1" ] || [ -z "$SUMMARY" ]; then
  echo
  echo "== browser console (warnings/errors) =="
  grep -E "CONSOLE" "$WORK/stderr.txt" | grep -viE "Missing value path|DevTools" | sed -e 's/^.*INFO:CONSOLE[^]]*\] //' | head -80
fi

rm -rf "$WORK"
case "$SUMMARY" in
  PASS*) exit 0 ;;
  *) exit 1 ;;
esac
