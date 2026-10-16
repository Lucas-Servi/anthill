# anthill 🐜

A Claude Code plugin that docks an ASCII ant colony beside your session.
Your project's file tree grows out of the anthill, and every agent is an ant
crawling its branches:

![anthill: an ASCII ant colony docked beside a Claude Code session: ants walking to files, digging, stumbling on a denied call, and dancing](https://raw.githubusercontent.com/Lucas-Servi/anthill/assets/demo.gif)

- **Read / Edit / Grep / Glob**: the ant walks to that file or directory and works on it.
- **Write to a new file**: the ant walks there and builds the new branch, piece by piece.
- Ants climb out of the hole on top of the anthill and crawl down its side onto the tree. When the tool call finishes, the ant climbs back up and into the hole, where its antennae peek out until its next job. A subagent's ant leaves the colony when its work is done — and also when the subagent itself stopped, failed or was killed, even with no final turn to say so.
- **Bash, WebSearch, an MCP tool, or just thinking** (no file to point to): the ant stays inside the mound, shown as a small dot of its own color digging through the mound's body along a winding tunnel, so it never looks as idle as a truly resting ant. What it digs changes the mound until it next resets (see below): packed red tunnel walls, nursery chambers of larvae, roots, and fungi that sprout and grow the longer the colony works.
- **A tool call that errors or gets denied**: the ant stumbles, dropping its load and heading home, and the file's row flashes — both fade after a few seconds. A path that turns out not to be on disk (a Read of a missing file, a denied Write of a new one) is then removed from the tree, so failed calls leave no fake rows.
- **`/compact`**: the ants refactor the anthill. Workers haul the grown hump away and pack the mound tight, filling in its tunnels, while the file tree folds up under a live "folding its memory" header. It's paced to last about as long as the compaction itself: the more context there is to fold, the slower they go, and the anthill times each compaction to pace the next one better. Once it resolves, the header says how many messages were folded into how many, and the tree unfolds again.
- The mound itself grows as your context window fills, one step every 5% — a second hump rises beside it and spills over near the auto-compact threshold, and the tunnels dig on into it — then returns to its original shape once the conversation is compacted or cleared.
- **Click an ant**: a brief, cheerful acknowledgement, and a toast of what it's doing right now (which file, or idle). **Click the mound**: a brief flinch where you clicked. Neither leaves a mark, and after a click lands the next one is ignored for 3 seconds. Poke the mound more than 10 times within a minute and the ants come out of the hole and dance on top of it in a shower of confetti — once every 10 minutes at most (in quiet mode you just get the toast). Clicking only works while the pane is docked in a fullscreen terminal — not in the strip, and not on a narrow terminal's inline pane, since that's the one place a terminal reports clicks at all.

Each agent gets its own **color**. Each model gets its own **body**:

| model  | ant                  |
| ------ | -------------------- |
| haiku  | tiny worker          |
| sonnet | medium worker        |
| opus   | big armoured soldier |
| fable  | winged queen         |

## Install

```
/plugin install anthill --marketplace Lucas-Servi/anthill
```

It may say one option isn't set yet: that's the Animation setting (see Configure),
which already defaults to `full`, so there's nothing to do.

Already installed and want the latest version? `claude plugin update` only
installs a newer version if `plugin.json`'s `version` field actually changed,
so:

```
/plugin marketplace update anthill
/plugin update anthill@anthill
```

then restart Claude Code (or start a new session) to pick it up.

To remove it: `/plugin uninstall anthill@anthill`.

## Requirements

- Claude Code 2.1.300 or 2.1.301 (what it's tested on). It's built on Claude Code's
  plugin hooks API, which is early access and can change between releases: after
  updating Claude Code, update anthill too.
- A terminal with 24-bit color.
- Clicking the ants and the mound needs the fullscreen layout with the pane docked:
  that's the only place a terminal reports clicks. Everything else works in the
  inline pane and the strip too.

## Use

The pane opens by itself when the terminal is at least 144 columns wide. At any
width, type `/anthill` to open it.

The anthill normally docks beside the transcript (or sits inline above the
prompt on a narrow terminal). A small `▬ strip` button at its bottom-right
moves it instead to a short, wide strip directly above the prompt box — handy
when the terminal is too short for the usual mound. A `▮ side` button there
switches it back. Both are reachable from the keyboard too (`ctrl+x tab`, then
the button's hotkey), and `/anthill strip` / `/anthill side` do the same thing
without touching the mouse.

## Configure

The plugin's one setting, under `/config`, is **Animation**:

- **full** (the default): the usual colony.
- **quiet**: shortens mishap flashes and stops the color-blink, drops the idle
  antennae wiggle, and stops the busy dots decorating the mound as they dig —
  the ants still walk, work and dig, just without the extra flourish.
- **off**: a full kill switch. Nothing animates, the pane and strip stay
  closed, and the simulation itself stops ticking.

`/anthill quiet`, `/anthill full` and `/anthill off` switch it right away —
and that choice is saved too (the same way the strip/side layout choice is),
so it's what the next session starts in, taking priority over `/config`'s
own setting from then on.

## What it reads, sends and keeps

anthill runs entirely inside your Claude Code session. It makes no network calls,
runs no tools, shell commands or processes, starts no agents, and never reads a
file's contents. Nothing it sees leaves your machine.

**What it reads.** To draw the colony, it reads the events Claude Code hands every
plugin: which tool each agent calls, the file or folder path in that call, and
whether the call succeeded, errored or was denied. It also asks Claude Code which
model each agent runs on, which subagents are still running, and how full the
context window is. It lists the folders a path leads through, and checks whether a
file exists, to draw the tree.

**What it writes, all within Claude Code on your machine.** The colony goes in the
session's own state and is gone when the session is. Three settings go in Claude
Code's plugin storage: your pane/strip layout, your Animation setting, and how long
compactions take, so the next one's animation is paced right. It shows a short
toast when you click an ant, and when the colony dances. Its pane is drawn by its
own module (`hooks/mound-client.tsx`), which posts where you clicked to anthill's
own hooks; Claude Code delivers a pane's posts only to the plugin that drew it.

### Hook by hook

Apart from anthill's own `/anthill` command, every hook passes its event on
unchanged and hands back Claude Code's own result unchanged: anthill only watches.

- **`session.start`**: once Claude Code has started the session, loads the colony
  and the three settings, lists the project's top folder, registers `/anthill`,
  opens the pane (unless Animation is off), and starts a 120 ms timer that
  animates the colony.
- **`tool.call`**: sees every tool call any agent makes, to move that agent's ant.
  For a call that names a file or folder (Read, Edit, Write and the like), it lists
  the folders on that path and checks whether the file exists, to draw it in the
  tree. It never blocks, changes or answers a call.
- **`agent.spawn`**: notices a subagent starting, to give it an ant. It gives the
  agent nothing and changes nothing about it.
- **`turn.step`** and **`turn.complete`**: mark an agent's ant busy, or back home;
  the turn's stream passes through untouched.
- **`session.compact`**: plays the compaction animation, and times how long the
  compaction takes.
- **`session.measure`** and **`session.end`**: grow the mound as the context fills,
  and reset it after `/clear`.
- **`command.run`**: answers only `/anthill`, anthill's own command, which switches
  the layout or the animation and opens or closes the pane. Every other command
  passes by untouched.
- **`ui.message`**: receives the click positions anthill's own pane module posts,
  and nothing else.
- **`ui.render`** (`Pane`, `AbovePrompt`): draws anthill's pane, and the strip above
  the prompt while that layout is on. Otherwise the strip is left as Claude Code
  draws it.

The `scripts/` and `tests/` folders don't run as part of the plugin: the scripts
are development tools that draw the README's images, and the tests run only under
`claude plugin test`.

## Develop

```
claude --plugin-dir /path/to/anthill
```

Claude Code watches the folder and reloads the plugin when you save a file.

```
claude plugin validate .
claude plugin test .
```

Layout: `hooks/register.tsx` wires up Claude Code events; `hooks/tree.ts` and
`hooks/ants.ts` hold the pure tree and ant logic; `hooks/mound.ts` holds the
anthill's picture, colors, the ants' trail from the summit hole to the tree,
the tunnel busy ants dig through, and how the mound grows with the context
window; `hooks/render.ts` draws the ASCII picture, in either the tall or the
short-and-wide layout, and hit-tests a click against it. `hooks/mound-client.tsx`
is a `Client` surface module: it draws the pane's own body (so a click over it
can be reported at all) and posts a hit back to `register.tsx`'s `ui.message`
hook, which decides what it means. The state contract lives in `types/index.d.ts`,
and the tests in `tests/`.

Bumping `plugin.json`'s `version` is how an installed copy actually picks up
a change — `claude plugin update` compares versions, not commits.

A small scratch script, `scripts/demo.ts`, renders a representative scene
(ants walking and building, a busy dot digging, a mishap flashing, a
`/compact` refactor mid-animation) straight to a real ANSI terminal, using
only `hooks/render.ts`/`hooks/mound.ts`'s own pure functions — handy for
checking a change by eye. Run it with
`npx -y esbuild@0.28.2 scripts/demo.ts --bundle --outfile=/tmp/anthill-demo.js --format=esm --platform=node && node /tmp/anthill-demo.js`.
`scripts/video.ts` and `scripts/screenshot.ts` draw the demo above, and a still of it, the
same way, as HTML pages to capture in a browser; `scripts/icon.ts` draws the plugin's icon.
Their header comments say how.

## License

MIT — see [LICENSE](./LICENSE).
