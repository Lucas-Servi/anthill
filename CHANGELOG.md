# Changelog

All notable changes to anthill are recorded here, newest first.

## [0.7.0]

- Added a kill switch / reduced-motion mode: a new `Animation` setting
  (`full`/`quiet`/`off`, under `/config`), with `/anthill quiet|full|off` to
  switch it immediately and have it stick across sessions. `off` freezes the
  whole simulation outright; `quiet` keeps the ants moving but drops the
  idle wiggle, the busy-dot tunnel decoration, and shortens mishap flashes
  and the color-blink.
- Added a numeric context readout — `"<n>% to compact"` — to the legend, the
  same fraction the mound's own growth already visualizes.
- Fixed `Ant.doneIds` growing without bound for a session's whole life; it is
  now pruned once a job it names is no longer current or queued.
- Replaced two per-tick, per-ant linear row scans with one lookup map built
  once a tick, so a tick's cost no longer grows with `ants × rows`.
- Widened `PALETTE` (8 → 12 colors) and `TUNNEL_SEATS` (6 → 9) so more
  concurrent agents stay visually distinct before colors repeat or a busy
  dot goes undotted.
- Fixed a race where `/anthill`'s layout and animation commands could
  resolve before the choice actually finished saving.
- Added a `LICENSE` (MIT), `userConfig`/manifest metadata, a `Configure`
  section in the README, and `scripts/demo.ts` for capturing a screenshot.

## [0.6.1]

- Paced the `/compact` refactoring animation to the context being folded,
  instead of a fixed duration — proportional to tokens, and learning the
  real per-token cost from each compaction that actually ran.

## [0.6.0]

- `/compact` now shows the ants refactoring the anthill: workers haul the
  grown hump away and pack the mound tight while the file tree folds up
  under a live header, instead of nothing visibly happening.

## [0.5.0] – [0.5.2]

- Ants of subagents that ended without a final turn (stopped, failed,
  killed) now leave the colony instead of lingering forever.
- Failed and denied tool calls are shown clearly: the ant stumbles and the
  file's row flashes, both fading after a few seconds.
- A failed call on a path that isn't really on disk leaves no fake row
  behind once its flash fades.

## [0.4.0]

- A real second hump (not just a taller mound) that grows as the context
  window fills, with tunnels that visibly change the mound as busy ants dig,
  and strip-layout fixes.

## [0.3.0]

- The mound grows in stages with context usage, resetting after `/compact`
  or `/clear`; busy ants dig winding tunnels instead of orbiting in place;
  a strip above the prompt (and its layout button) replaced an automatic,
  often-wrong horizontal orientation.

## [0.2.0]

- A horizontal layout for short, wide panes; fixed the pane silently not
  drawing in some cases; added branch-climbing and a camera that follows
  the main ant.

## [0.1.0]

- First release: an ASCII ant colony that crawls the file tree, one ant per
  agent, walking to the files their tool calls touch.
