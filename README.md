# anthill 🐜

A Claude Code plugin that docks an ASCII ant colony beside your session.
Your project's file tree grows out of the anthill, and every agent is an ant
crawling its branches:

- **Read / Edit / Grep / Glob**: the ant walks to that file or directory and works on it.
- **Write to a new file**: the ant walks there and builds the new branch, piece by piece.
- Ants climb out of the hole on top of the anthill and crawl down its side onto the tree. When the tool call finishes, the ant climbs back up and into the hole, where its antennae peek out until its next job. A subagent's ant leaves the colony when its work is done.
- **Bash, WebSearch, an MCP tool, or just thinking** (no file to point to): the ant stays inside the mound, shown as a small dot of its own color orbiting the mound's body, so it never looks as idle as a truly resting ant.
- **`/compact`**: the file tree folds up while the conversation is summarized, then unfurls back once it resolves.

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

## Use

The pane opens by itself when the terminal is at least 144 columns wide. At any
width, type `/anthill` to open it.

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
anthill's picture, colors and the ants' trail from the summit hole to the tree;
`hooks/render.ts` draws the ASCII picture. The state contract lives in `types/index.d.ts`.
