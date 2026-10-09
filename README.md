# anthill 🐜

A Claude Code plugin that docks an ASCII ant colony beside your session.
Your project's file tree grows out of the anthill, and every agent is an ant
crawling its branches:

- **Read / Edit / Grep / Glob**: the ant walks to that file or directory and works on it.
- **Write to a new file**: the ant walks there and builds the new branch, piece by piece.
- Ants climb out of the hole on top of the anthill and crawl down its side onto the tree. When the tool call finishes, the ant climbs back up and into the hole, where its antennae peek out until its next job. A subagent's ant leaves the colony when its work is done.
- **Bash, WebSearch, an MCP tool, or just thinking** (no file to point to): the ant stays inside the mound, shown as a small dot of its own color digging through the mound's body along a winding tunnel, so it never looks as idle as a truly resting ant. What it digs changes the mound until it next resets (see below): packed red tunnel walls, nursery chambers of larvae, roots, and fungi that sprout and grow the longer the colony works.
- **`/compact`**: the file tree folds up while the conversation is summarized, then unfurls back once it resolves.
- The mound itself grows as your context window fills, one step every 5% — a second hump rises beside it and spills over near the auto-compact threshold, and the tunnels dig on into it — then returns to its original shape once the conversation is compacted or cleared.

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

Already installed and want the latest version? `claude plugin update` only
installs a newer version if `plugin.json`'s `version` field actually changed,
so:

```
/plugin marketplace update anthill
/plugin update anthill@anthill
```

then restart Claude Code (or start a new session) to pick it up.

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
short-and-wide layout. The state contract lives in `types/index.d.ts`.

Bumping `plugin.json`'s `version` is how an installed copy actually picks up
a change — `claude plugin update` compares versions, not commits.
