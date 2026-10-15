/**
 * A scratch renderer, not part of the plugin: prints a few representative
 * scenes straight to a real ANSI terminal, using only render.ts/mound.ts's
 * own pure functions — the same picture the pane would draw, with no engine,
 * no hooks, nothing live. For capturing a screenshot or a short recording for
 * the README, or just checking a change by eye. See the README's Develop
 * section for how to run it (needs bundling first: this repo has no
 * package.json/bundler of its own).
 */
import type { Ant, Dug, Fold, Row } from '../types'
import { compose, type Line } from '../hooks/render'
import { GROWTH_STAGES } from '../hooks/mound'

/** Turns one Line into a real ANSI-escaped string for a terminal to print. */
const toAnsi = (line: Line): string =>
  line
    .map(seg => {
      const codes: string[] = []
      if (seg.bold) codes.push('1')
      if (seg.dim) codes.push('2')
      if (seg.color) {
        const [, r, g, b] = /^#(..)(..)(..)$/.exec(seg.color) ?? []
        if (r && g && b) codes.push(`38;2;${parseInt(r, 16)};${parseInt(g, 16)};${parseInt(b, 16)}`)
      }
      if (seg.bg) {
        const [, r, g, b] = /^#(..)(..)(..)$/.exec(seg.bg) ?? []
        if (r && g && b) codes.push(`48;2;${parseInt(r, 16)};${parseInt(g, 16)};${parseInt(b, 16)}`)
      }
      return codes.length ? `\x1b[${codes.join(';')}m${seg.text}\x1b[0m` : seg.text
    })
    .join('')

const printScene = (title: string, lines: Line[]) => {
  console.log(`\n\x1b[1m-- ${title} --\x1b[0m`)
  for (const line of lines) console.log(toAnsi(line))
}

const row = (over: Partial<Row>): Row => ({ path: 'x', name: 'x', depth: 0, isDir: false, ...over })
const ant = (over: Partial<Ant>): Ant => ({
  id: 'a',
  label: 'a',
  breed: 'sonnet',
  color: '#5f87ff',
  at: -1,
  task: 'walking',
  queue: [],
  doneIds: [],
  frame: 0,
  ...over,
})

const ROWS: Row[] = [
  row({ path: 'src', name: 'src', isDir: true, isOpen: true }),
  row({ path: 'src/main.ts', name: 'main.ts', depth: 1 }),
  row({ path: 'src/utils.ts', name: 'utils.ts', depth: 1 }),
  row({ path: 'README.md', name: 'README.md' }),
]

const DUG: Dug[] = Array.from({ length: 6 }, (_, i) => ({ i, at: 0 }))

// ---- scene 1: an ordinary moment -------------------------------------------
printScene(
  'a working colony: an opus main on main.ts, a sonnet subagent walking to utils.ts, a haiku digging',
  compose(
    ROWS,
    [
      ant({ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: 1, task: 'working' }),
      ant({ id: 'sub1', label: 'explore', breed: 'sonnet', color: '#5fff5f', at: 1, task: 'walking', frame: 2 }),
      ant({ id: 'sub2', label: 'review', breed: 'haiku', color: '#ffff5f', at: -1, task: 'busy', frame: 500, queue: [] }),
    ],
    [],
    { width: 70, height: 18, tick: 500, growth: Math.floor(GROWTH_STAGES / 2), dug: DUG },
  ),
)

// ---- scene 2: a mishap ------------------------------------------------------
printScene(
  'a denied call: the ant stumbles, blinking, and the row flashes',
  compose(
    ROWS.map((r, i) => (i === 1 ? { ...r, flash: { kind: 'denied' as const, ticks: 30 } } : r)),
    [ant({ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: 1, task: 'working', frame: 1, mishap: { kind: 'denied', ticks: 30 } })],
    [],
    { width: 70, height: 18, tick: 0 },
  ),
)

// ---- scene 3: /compact mid-refactor ----------------------------------------
const fold: Fold = { id: 'main', label: 'main', before: 240, frame: 90, isMain: true, eta: 300, grown: 10 }
printScene(
  '/compact mid-refactor: workers haul the hump away while the tree folds',
  compose(ROWS, [ant({ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: -1, task: 'busy' })], [fold], {
    width: 70,
    height: 18,
    tick: 90,
    growth: 10,
  }),
)

// ---- scene 4: clicking the mound and an ant --------------------------------
printScene(
  'clicked: main gets a brief cheerful notice, and the mound flinches where it was poked',
  compose(
    ROWS,
    [ant({ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: 1, task: 'working', notice: { ticks: 6 } })],
    [],
    { width: 70, height: 18, tick: 0, poke: [{ line: 3, col: 6, ticks: 10 }] },
  ),
)

console.log(
  '\n\x1b[2mNot shown: "/anthill quiet" and "/anthill off" (the kill switch) — their effect is the absence of' +
    ' motion over time (no idle wiggle, no blink, no tunnel decoration, or nothing moving at all), which a single' +
    ' static frame cannot capture. Run the plugin live and compare /anthill full, quiet and off to see those.\x1b[0m',
)
