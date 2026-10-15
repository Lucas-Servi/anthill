# anthill — notes for whoever (human or Claude) works on this next

## Deferred roadmap (market research, 2026-10-15)

A market-research pass (surveying competing Claude Code visualization
plugins, reading user complaints/wishlists across HN and GitHub issues, and
auditing this codebase) turned up nine gaps standing between anthill and
wider adoption. Four were addressed in 0.7.0 (a kill switch/quiet mode, a
numeric context-% readout, and two robustness fixes — `Ant.doneIds` growing
unbounded, and a per-tick O(ants × rows) row scan). The other five are
deliberately deferred; this is where they're meant to be picked up again.

1. **A persistent mishap log/counter.** Mishaps (a denied/failed tool call)
   fade from the pane in ~5 seconds with nothing kept afterward. The single
   most-requested feature across every source in the research was multi-agent
   *visibility*, specifically around failures and collisions — a user who
   isn't watching at the right second currently has no way to learn a call
   failed. Needs: a bounded log (legend footer, or a `/anthill mishaps`
   command), kept across the fade, cleared on `/clear` alongside the mound.

2. **A visible degraded mode if a hook payload's shape ever changes.** The
   closest competitor (Pixel Agents) broke twice when Claude Code changed
   internal log formats, and a user who hit it gave up on the extension
   ("slows the computer and agents stay idle"). anthill already uses the
   documented hooks API rather than scraping logs, which avoids most of this
   risk — but if a future Claude Code release ever changes an event's shape
   in a way `register.tsx` doesn't expect, the colony should visibly stall
   (a small warning glyph) rather than silently going quiet forever.

3. **Raising `PEEKS` past 3.** Capacity audit: `PALETTE` (8→12) and
   `TUNNEL_SEATS` (6→9) were raised in 0.7.0 since both are pure spacing/count
   parameters. `PEEKS` (`mound.ts`) is 3 literal `{line, col}` coordinates
   baked into the hole's ASCII art — raising it needs an actual art change
   (and the usual mask/invariant tests), a bigger lift than a constant bump,
   so it's out of scope until someone wants to touch the mound's art directly.

4. **CI, lint config, CONTRIBUTING.md.** There's no `.github/workflows`, no
   `.eslintrc`/`.prettierrc`, no contributor guide — fine for a single-author
   repo, but worth adding once (or before) outside contributions start,
   especially now that the repo carries a LICENSE and is headed public.

5. **Cross-agent support (Codex, Gemini CLI, etc.).** The highest-starred
   tools in the research (ccusage, Clawd on Desk, Petdex) all support more
   than one coding agent, and that correlates with their size — anthill is
   Claude-Code-only by design today. Reasonable to defer past v1, but worth
   keeping in mind if `hooks/register.tsx`'s event names/shapes ever need to
   generalize.

## Where things live

See the README's own "Develop" section for the file layout (`register.tsx`
wires up events; `tree.ts`/`ants.ts`/`mound.ts`/`render.ts` are pure logic
and drawing). `scripts/demo.ts` renders a few representative scenes straight
to a real terminal for screenshots or eyeballing a change, without needing a
live Claude Code session.
