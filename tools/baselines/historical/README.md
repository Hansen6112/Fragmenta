# Historical baselines

Moved here (2e-1 close-out, 20 Nov, Tyler) rather than removed, so the
record stays but nothing live compares against them by accident.

- `bs_off_n1000.json`, `p3_off_n1000.json` (18 Nov): generated before the
  harnesses' own per-cell seeding fix (`tools/sim/README.md`'s "Seeding
  (18 Nov)" section) -- no `seed` field, not reproducible. Also compare
  against `--switch off` (`DAMAGE_TYPES_V2 = false`), a configuration the
  game no longer ships with a committed `off` default to compare against
  (`js/data/damagetypes.js`'s own line is `true` today).
- `post_damage_types_baseline_249f74f.json` (13 Nov): the same
  unseeded/`off`-vs-`on` comparison, one commit earlier, superseding an
  even older `bf0e92e` baseline per its own `note` field. Same two
  problems.

`tools/baselines/bs_on_n1000.json`/`p3_on_n1000.json` are unaffected --
both already carry a `seed` field and compare against `on`
(`DAMAGE_TYPES_V2 = true`), today's real default. They stay in
`tools/baselines/` as the current, valid baselines.
