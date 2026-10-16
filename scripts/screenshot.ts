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
import type { Ant, Dug, Row } from '../types'
import { compose, type Line } from '../hooks/render'
import { seatOrbits } from '../hooks/ants'
import { HOME } from '../hooks/mound'

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One Line as HTML: a span per run of one style, the same styles the pane's Text draws. */
const toHtml = (line: Line): string =>
  line
    .map(seg => {
      const style: string[] = []
      if (seg.color) style.push(`color:${seg.color}`)
      if (seg.bg) style.push(`background:${seg.bg}`)
      if (seg.bold) style.push('font-weight:bold')
      if (seg.dim) style.push('opacity:.55')
      return style.length ? `<span style="${style.join(';')}">${escape(seg.text)}</span>` : escape(seg.text)
    })
    .join('')

const row = (over: Partial<Row>): Row => ({ path: 'x', name: 'x', depth: 0, isDir: false, ...over })
const ant = (over: Partial<Ant>): Ant => ({
  id: 'a',
  label: 'a',
  breed: 'sonnet',
  color: '#5f87ff',
  at: HOME,
  task: 'home',
  queue: [],
  doneIds: [],
  frame: 0,
  ...over,
})

/** A tree shaped like this very repo. */
const ROWS: Row[] = [
  row({ path: 'hooks', name: 'hooks', isDir: true, isOpen: true }),
  row({ path: 'hooks/ants.ts', name: 'ants.ts', depth: 1 }),
  row({ path: 'hooks/mound.ts', name: 'mound.ts', depth: 1 }),
  row({ path: 'hooks/register.tsx', name: 'register.tsx', depth: 1 }),
  row({ path: 'hooks/render.ts', name: 'render.ts', depth: 1 }),
  row({ path: 'hooks/tree.ts', name: 'tree.ts', depth: 1 }),
  row({ path: 'scripts', name: 'scripts', isDir: true }),
  row({ path: 'CHANGELOG.md', name: 'CHANGELOG.md' }),
  row({ path: 'README.md', name: 'README.md' }),
]
const at = (path: string) => ROWS.findIndex(r => r.path === path)

const WIDTH = 44
const HEIGHT = 21
const GROWN = 12 // a hump risen beside the mound, crown and all
/** Old tunnels, dug long before `tick`, so their fungi have grown caps. */
const DUG: Dug[] = Array.from({ length: 20 }, (_, i) => ({ i, at: 0 }))

const atWork = compose(
  ROWS.map(r => (r.path === 'README.md' ? { ...r, flash: { kind: 'denied' as const, ticks: 30 } } : r)),
  seatOrbits([
    ant({ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: at('hooks/render.ts'), task: 'working', frame: 1 }),
    ant({ id: 'explore', label: 'Explore', breed: 'sonnet', color: '#5fff5f', at: at('hooks/ants.ts'), task: 'walking', frame: 0 }),
    ant({ id: 'review', label: 'review', breed: 'haiku', color: '#ffff5f', task: 'busy', frame: 7 }),
    ant({ id: 'plan', label: 'Plan', breed: 'fable', color: '#5f87ff' }),
  ]),
  [],
  { width: WIDTH, height: HEIGHT, tick: 500, growth: GROWN, dug: DUG, contextPercent: 52 },
)

const celebrating = compose(
  ROWS,
  [
    ant({ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f' }),
    ant({ id: 'explore', label: 'Explore', breed: 'sonnet', color: '#5fff5f' }),
    ant({ id: 'review', label: 'review', breed: 'haiku', color: '#ffff5f' }),
  ],
  [],
  { width: WIDTH, height: HEIGHT, tick: 2, growth: GROWN, dug: DUG, contextPercent: 52, dance: true },
)

/** Both panes the same height: the shorter one padded with blank lines at the bottom. */
const rowsTall = Math.max(atWork.length, celebrating.length)
const padded = (lines: Line[]): Line[] => [...lines, ...Array.from({ length: rowsTall - lines.length }, (): Line => [])]

const pane = (caption: string, lines: Line[]): string => `
  <figure>
    <div class="win">
      <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>Anthill</span></div>
      <pre>${padded(lines).map(toHtml).join('\n')}</pre>
    </div>
    <figcaption>${caption}</figcaption>
  </figure>`

console.log(`<!doctype html>
<html><head><meta charset="utf-8"><title>anthill</title><style>
  html, body { margin: 0; background: #110e0c; overflow: hidden; }
  /* drawn at 2x, so the captured image stays crisp on high-density screens */
  .stage { zoom: 2; display: inline-flex; gap: 28px; padding: 28px 32px 22px; background: #110e0c; align-items: flex-start; }
  figure { margin: 0; }
  .win { background: #1a1613; border: 1px solid #2e2723; border-radius: 10px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,.55); }
  .bar { display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px; background: #231e1a; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
  .bar span { margin-left: 10px; color: #9c928a; font: 12px 'DejaVu Sans', sans-serif; }
  pre { margin: 0; padding: 14px 18px 16px; width: ${WIDTH}ch; color: #e9e3dc;
        font: 15px/1.15 'DejaVu Sans Mono', monospace; }
  figcaption { margin-top: 10px; text-align: center; color: #8b8178; font: 13px 'DejaVu Sans', sans-serif; }
</style></head><body><div class="stage">${pane('at work', atWork)}${pane('poked more than ten times in a minute', celebrating)}
</div></body></html>`)
