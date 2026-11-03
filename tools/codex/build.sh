#!/usr/bin/env bash
# Builds codex data for the Fragmenta Codex Tracker.
#   tools/codex/build.sh <repoDir> <dataDir>
# dataDir is a checkout of the codex-data branch. Writes:
#   latest/snapshot.json   every data registry (js/data) at this commit
#   latest/entries.json    exact codex text for every item, enemy, ability, status
#   latest/items_codex.html, latest/enemy_codex.html   full generated codexes
#   latest/audit.txt       output of tools/audit.js
#   changes/<n>-<sha>.json entity-level diff vs the previous build (n = build number)
#   commits/<n>-<sha>.txt  commit messages and changed files covered by that build
#   latest/BUILD           sha, previous sha, build number, UTC time
set -euo pipefail
REPO=$(cd "$1" && pwd); DATA=$(mkdir -p "$2" && cd "$2" && pwd); HERE=$(cd "$(dirname "$0")" && pwd)
SHA=$(git -C "$REPO" rev-parse HEAD)
mkdir -p "$DATA/latest" "$DATA/changes" "$DATA/commits"
PREV=""; N=1
if [ -f "$DATA/latest/BUILD" ]; then PREV=$(sed -n 's/^sha=//p' "$DATA/latest/BUILD"); N=$(( $(sed -n 's/^build=//p' "$DATA/latest/BUILD") + 1 )); fi
if [ "$PREV" = "$SHA" ]; then echo "already built $SHA"; exit 0; fi
node "$HERE/snapshot.js" "$REPO" "$DATA/latest/snapshot.new.json"
if [ -f "$DATA/latest/snapshot.json" ]; then
  node "$HERE/diff.js" "$DATA/latest/snapshot.json" "$DATA/latest/snapshot.new.json" > "$DATA/changes/$(printf %05d $N)-${SHA:0:7}.json"
else echo "[]" > "$DATA/changes/$(printf %05d $N)-${SHA:0:7}.json"; fi
mv "$DATA/latest/snapshot.new.json" "$DATA/latest/snapshot.json"
node "$HERE/render.js" "$DATA/latest/snapshot.json" "$DATA/latest"
( cd "$REPO" && node tools/audit.js > "$DATA/latest/audit.txt" 2>&1 || true )
{ echo "range: ${PREV:-start}..$SHA"; git -C "$REPO" log --stat --format='=== %H %ad%n%s%n%b' --date=iso $([ -n "$PREV" ] && echo "$PREV..$SHA" || echo "-1 $SHA") ; } > "$DATA/commits/$(printf %05d $N)-${SHA:0:7}.txt" 2>/dev/null || true
# engine/rule code changes as a patch, so the tracker can describe rule changes without running code
if [ -n "$PREV" ]; then git -C "$REPO" diff "$PREV" "$SHA" -- js/engine index.html > "$DATA/commits/$(printf %05d $N)-${SHA:0:7}.engine.patch" || true; fi
printf 'sha=%s\nprev=%s\nbuild=%s\ntime=%s\n' "$SHA" "$PREV" "$N" "$(date -u +%FT%TZ)" > "$DATA/latest/BUILD"
echo "built $N $SHA"
