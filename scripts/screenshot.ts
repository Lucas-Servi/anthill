/**
 * A scratch renderer, not part of the plugin: draws the README's screenshot as an HTML
 * page, two panes side by side (the colony at work, and celebrating), with the plugin's
 * own compose() — so the picture is exactly what the pane shows, only in a browser,
 * where it can be captured as an image. Prints the page to stdout:
 *
 *   npx -y esbuild scripts/screenshot.ts --bundle --outfile=/tmp/anthill-shot.js --format=esm --platform=node
 *   mkdir -p /tmp/anthill-shot && node /tmp/anthill-shot.js > /tmp/anthill-shot/index.html
 *
 * then open that file in a browser sized to the `.stage` element (it's drawn at 2x) and screenshot it.
 */
import type { Dug } from '../types'
import { compose, type Line } from '../hooks/render'
import { seatOrbits } from '../hooks/ants'
import { EXPLORE, MAIN, PLAN, REVIEW, ROWS, ant, pageCss, rowAt, toPre, windowHtml } from './html'

const WIDTH = 44
const HEIGHT = 21
const GROWN = 12 // a hump risen beside the mound, crown and all
/** Old tunnels, dug long before `tick`, so their fungi have grown caps. */
const DUG: Dug[] = Array.from({ length: 20 }, (_, i) => ({ i, at: 0 }))

const atWork = compose(
  ROWS.map(r => (r.path === 'README.md' ? { ...r, flash: { kind: 'denied' as const, ticks: 30 } } : r)),
  seatOrbits([
    ant({ ...MAIN, at: rowAt('hooks/render.ts'), task: 'working', frame: 1 }),
    ant({ ...EXPLORE, at: rowAt('hooks/ants.ts'), task: 'walking', frame: 0 }),
    ant({ ...REVIEW, task: 'busy', frame: 7 }),
    ant({ ...PLAN }),
  ]),
  [],
  { width: WIDTH, height: HEIGHT, tick: 500, growth: GROWN, dug: DUG, contextPercent: 52 },
)

const celebrating = compose(
  ROWS,
  [ant({ ...MAIN }), ant({ ...EXPLORE }), ant({ ...REVIEW })],
  [],
  { width: WIDTH, height: HEIGHT, tick: 2, growth: GROWN, dug: DUG, contextPercent: 52, dance: true },
)

/** Both panes the same height: the shorter one padded with blank lines at the bottom. */
const rowsTall = Math.max(atWork.length, celebrating.length)
const pane = (caption: string, lines: Line[]): string =>
  `<figure>${windowHtml(toPre(lines, rowsTall))}<figcaption>${caption}</figcaption></figure>`

console.log(`<!doctype html>
<html><head><meta charset="utf-8"><title>anthill</title><style>${pageCss(WIDTH)}
</style></head><body><div class="stage">${pane('at work', atWork)}${pane('poked more than ten times in a minute', celebrating)}
</div></body></html>`)
