/**
 * A scratch renderer, not part of the plugin: an HTML page that plays a short scene of the
 * colony, for recording a demo video. It runs the plugin's own simulation tick by tick
 * (ants.ts step, dig and drop, the pokes and the dance) and draws every tick with compose(),
 * so the ants really walk the trail, dig, stumble and dance; the page then shows one frame
 * every TICK_MS, the pane's own pace, with a caption saying what's going on. Prints the page:
 *
 *   npx -y esbuild scripts/video.ts --bundle --outfile=/tmp/anthill-video.js --format=esm --platform=node
 *   mkdir -p /tmp/anthill-video && node /tmp/anthill-video.js > /tmp/anthill-video/index.html
 *
 * then open it in a browser sized to the `.stage` element and screen-record it. It loops;
 * in the page, `restart()` starts it over, `pause()` stops it and `seek(n)` shows frame n.
 *
 * docs/demo.gif was made frame by frame instead: headless Chrome (puppeteer-core) at a
 * 1000x1124 viewport, `seek(n)` and a screenshot per frame, then ffmpeg (ffmpeg-static) at
 * 25/3 fps, one frame per tick:
 *   ffmpeg -framerate 25/3 -i f%03d.png -vf "scale=640:-1:flags=lanczos,split[a][b];
 *     [a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" demo.gif
 * (for an .mp4: -vf "fps=25,format=yuv420p" -c:v libx264 -crf 18 -movflags +faststart)
 */
import type { Ant, Dug, Poke, Row } from '../types'
import { compose, type Line } from '../hooks/render'
import { DANCE_TICKS, MISHAP_TICKS, POKE_TICKS, addPoke, assign, clearBusy, dig, drop, fadePokes, finish, markBusy, step } from '../hooks/ants'
import { GROWTH_STAGES, SHAPES, stageOf } from '../hooks/mound'
import { EXPLORE, MAIN, PLAN, REVIEW, ROWS, ant, pageCss, toPre, windowHtml } from './html'

const WIDTH = 44
const TICK_MS = 120

// The scene, in ticks.
const MAIN_OUT = 2 // main reads hooks/render.ts; review starts digging (a Bash call, say)
const EXPLORE_OUT = 6 // a subagent reads hooks/ants.ts
const MAIN_DONE = 26
const EXPLORE_DONE = 30
const PLAN_OUT = 34 // another subagent reads the changelog
const PLAN_DONE = 58
const MAIN_AGAIN = 60 // main heads for README.md...
const DENIED = 66 // ...and the permission prompt says no
const DIGGING_DONE = 95
const POKES = [100, 106, 112, 118, 124, 130] // the mound clicked, again and again
const POKED_AT: [line: number, col: number][] = [[3, 6], [4, 10], [3, 12], [4, 5], [2, 8], [4, 13]]
const DANCE_FROM = 132
const END = DANCE_FROM + DANCE_TICKS + 14

const caption = (t: number): string =>
  t < PLAN_OUT ? 'every agent is an ant, walking to the files its tool calls touch'
  : t < MAIN_AGAIN ? 'work with no file to point to (Bash, MCP, thinking) digs tunnels through the mound'
  : t < DIGGING_DONE ? 'a denied call: the ant stumbles and the file flashes'
  : t < DANCE_FROM ? 'the mound grows as the context fills, and flinches where you click it'
  : 'poke it more than ten times in a minute and the colony dances'

let ants: Ant[] = [ant({ ...MAIN }), ant({ ...EXPLORE }), ant({ ...REVIEW }), ant({ ...PLAN })]
let rows: Row[] = ROWS
let dug: Dug[] = []
let poke: Poke[] = []
const set = (id: string, f: (a: Ant) => Ant) => (ants = ants.map(a => (a.id === id ? f(a) : a)))

const frames: { lines: Line[]; cap: string }[] = []
for (let t = 0; t < END; t++) {
  if (t === MAIN_OUT) {
    set(MAIN.id, a => assign(a, { id: 'm1', path: 'hooks/render.ts', kind: 'work' }))
    set(REVIEW.id, markBusy)
  }
  if (t === EXPLORE_OUT) set(EXPLORE.id, a => assign(a, { id: 'e1', path: 'hooks/ants.ts', kind: 'work' }))
  if (t === MAIN_DONE) set(MAIN.id, a => finish(a, 'm1'))
  if (t === EXPLORE_DONE) set(EXPLORE.id, a => finish(a, 'e1'))
  if (t === PLAN_OUT) set(PLAN.id, a => assign(a, { id: 'p1', path: 'CHANGELOG.md', kind: 'work' }))
  if (t === PLAN_DONE) set(PLAN.id, a => finish(a, 'p1'))
  if (t === MAIN_AGAIN) set(MAIN.id, a => assign(a, { id: 'm2', path: 'README.md', kind: 'work' }))
  if (t === DENIED) {
    const mishap = { kind: 'denied' as const, ticks: MISHAP_TICKS }
    set(MAIN.id, a => drop({ ...a, mishap }, 'm2'))
    rows = rows.map(r => (r.path === 'README.md' ? { ...r, flash: mishap } : r))
  }
  if (t === DIGGING_DONE) set(REVIEW.id, clearBusy)
  const k = POKES.indexOf(t)
  if (k !== -1) poke = addPoke(poke, POKED_AT[k]![0], POKED_AT[k]![1], POKE_TICKS)

  // the context fills as the session goes on: the mound grows a stage every ten ticks
  const growth = Math.min(16, 4 + Math.floor(t / 10))
  ;({ ants, rows } = step(ants, rows))
  dug = dig(dug, ants, stageOf(SHAPES.vertical, growth).tunnel.length, t)
  poke = fadePokes(poke)

  const lines = compose(rows, ants, [], {
    width: WIDTH,
    height: 30,
    tick: t,
    growth,
    dug,
    poke,
    contextPercent: Math.round((growth / (GROWTH_STAGES - 1)) * 100),
    dance: t >= DANCE_FROM && t < DANCE_FROM + DANCE_TICKS,
  })
  frames.push({ lines, cap: caption(t) })
}
// every frame padded to the tallest (a dance's header adds a row), so the window never jumps
const tallest = Math.max(...frames.map(f => f.lines.length))
const data = JSON.stringify(frames.map(f => ({ pre: toPre(f.lines, tallest), cap: f.cap })))

console.log(`<!doctype html>
<html><head><meta charset="utf-8"><title>anthill</title><style>${pageCss(WIDTH)}
  .stage { flex-direction: column; align-items: center; gap: 0; }
  h1 { margin: 0 0 4px; color: #efe8e0; font: bold 22px 'DejaVu Sans Mono', monospace; }
  .sub { margin: 0 0 16px; color: #9c928a; font: 13px 'DejaVu Sans', sans-serif; }
  figcaption { min-height: 2.4em; max-width: ${WIDTH}ch; margin-top: 12px; color: #c9bfb5; font-size: 14px; }
</style></head><body><div class="stage">
  <h1>anthill</h1><p class="sub">an ASCII ant colony for your Claude Code session</p>
  <figure>${windowHtml('', 'pane')}<figcaption id="cap"></figcaption></figure>
</div><script>
  const frames = ${data}
  let i = 0
  const show = () => {
    document.getElementById('pane').innerHTML = frames[i].pre
    document.getElementById('cap').textContent = frames[i].cap
    i = (i + 1) % frames.length
  }
  let timer
  const play = () => { clearInterval(timer); timer = setInterval(show, ${TICK_MS}) }
  window.restart = () => { i = 0; show(); play() }
  window.pause = () => clearInterval(timer)
  window.seek = n => { clearInterval(timer); i = n; show() }
  show()
  play()
</script></body></html>`)
