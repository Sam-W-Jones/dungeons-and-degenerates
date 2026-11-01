#!/usr/bin/env bash
# Dungeons and Degenerates — whole-campaign balance simulation (tests/sim/sim.html) in headless Chrome.
# DD.Run + DD.AutoPlay play full runs with random parties; prints the report (win rates, per-kind HP lost / rounds /
# downs / signatures / Hype, encounters, downs by cause, heroes, skills, gold). Params: see tests/sim/sim.js.
#
#   tools/sim.sh "seeds=40&from=200&diff=normal"
#   tools/sim.sh "seeds=20&diff=brutal&stop=1&bal=act.1.hp:1.3,hype.dealtPer:6" .tmp/sim/brutal_a1.txt
#   JSON=1 tools/sim.sh "seeds=10&json=1" out.txt      # also writes out.json (one record per fight)
#
# Args: <query> [out.txt]. One page at a time: it takes a headless Chrome slot (tools/chrome_slot.sh) like test.sh.
# Batch seeds inside one page (seeds=N) instead of starting several sims in parallel.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || CHROME="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
QUERY="${1:-seeds=4}"
OUT="${2:-}"
BUDGET="${VTB:-6000000}"
mkdir -p "$ROOT/.tmp"
WORK="$(mktemp -d "$ROOT/.tmp/sim-XXXXXX")"
URL="file:///$(cygpath -m "$ROOT")/tests/sim/sim.html?$QUERY"
. "$ROOT/tools/chrome_slot.sh"
chrome_slot_acquire

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --disable-extensions --allow-file-access-from-files \
  --user-data-dir="$WORK/profile" --virtual-time-budget="$BUDGET" \
  --enable-logging=stderr --v=0 \
  --dump-dom "$URL" >"$WORK/dom.html" 2>"$WORK/stderr.txt"

decode() { sed -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&quot;/"/g' -e "s/&#39;/'/g" -e 's/&amp;/\&/g'; }
block() { awk -v id="$1" 'index($0, "<pre id=\"" id "\">"){flag=1} flag{print} /<\/pre>/{if(flag){flag=0}}' "$WORK/dom.html" | sed -e "s:.*<pre id=\"$1\">::" -e 's:</pre>.*::' | decode; }

if [ -n "$OUT" ]; then
  mkdir -p "$(dirname "$OUT")"
  block out > "$OUT"
  if [ "${JSON:-0}" = "1" ]; then block json > "${OUT%.txt}.json"; fi
  head -12 "$OUT"
  echo "(full report: $OUT)"
else
  block out
fi
if [ "${CONSOLE:-0}" = "1" ]; then
  grep -E "CONSOLE" "$WORK/stderr.txt" | grep -viE "Missing value path|DevTools" | sed -e 's/^.*INFO:CONSOLE[^]]*\] //' | head -60
fi
rm -rf "$WORK"
