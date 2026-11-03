# Codex data (for the Fragmenta Codex Tracker)

On every push to the default branch, `.github/workflows/codex-snapshot.yml` runs
`tools/codex/build.sh`, which loads the `js/data` registries (`snapshot.js`), diffs
them against the previous build (`diff.js`), renders the item and enemy codex text
(`render.js`), runs `tools/audit.js`, and commits the results to the `codex-data`
branch. The nightly Codex Tracker agent reads that branch and updates the codex docs
in Google Drive. Nothing here is loaded by the game.
