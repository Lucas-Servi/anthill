/**
 * What scripts/screenshot.ts and scripts/video.ts share: compose()'s Line[] drawn as HTML,
 * the fixtures their scenes are built from, and the terminal-window look they're shown in.
 * Scratch tooling, not part of the plugin.
 */
import type { Ant, Row } from '../types'
import type { Line } from '../hooks/render'
import { HOME } from '../hooks/mound'

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One Line as HTML: a span per run of one style, the same styles the pane's Text draws. */
export const toHtml = (line: Line): string =>
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

/** A whole drawing as the inside of a `<pre>`, padded with blank lines to `rows` tall. */
export const toPre = (lines: Line[], rows = lines.length): string =>
  [...lines, ...Array.from({ length: Math.max(0, rows - lines.length) }, (): Line => [])].map(toHtml).join('\n')

export const row = (over: Partial<Row>): Row => ({ path: 'x', name: 'x', depth: 0, isDir: false, ...over })
export const ant = (over: Partial<Ant>): Ant => ({
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
export const ROWS: Row[] = [
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
export const rowAt = (path: string): number => ROWS.findIndex(r => r.path === path)

/** The colony's usual agents, in their own colors (main's red, the rest from the palette). */
export const MAIN = { id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f' } as const
export const EXPLORE = { id: 'explore', label: 'Explore', breed: 'sonnet', color: '#5fff5f' } as const
export const REVIEW = { id: 'review', label: 'review', breed: 'haiku', color: '#ffff5f' } as const
export const PLAN = { id: 'plan', label: 'Plan', breed: 'fable', color: '#5f87ff' } as const

/** One terminal window (a title bar with three dots, "Anthill"), its body `pre`'s inner HTML. */
export const windowHtml = (pre: string, id = ''): string => `
    <div class="win">
      <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>Anthill</span></div>
      <pre${id ? ` id="${id}"` : ''}>${pre}</pre>
    </div>`

/** The page's styles: a dark stage drawn at 2x (crisp on high-density screens), windows `width` columns wide. */
export const pageCss = (width: number): string => `
  html, body { margin: 0; background: #110e0c; overflow: hidden; }
  .stage { zoom: 2; display: inline-flex; gap: 28px; padding: 28px 32px 22px; background: #110e0c; align-items: flex-start; }
  figure { margin: 0; }
  .win { background: #1a1613; border: 1px solid #2e2723; border-radius: 10px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,.55); }
  .bar { display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px; background: #231e1a; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
  .bar span { margin-left: 10px; color: #9c928a; font: 12px 'DejaVu Sans', sans-serif; }
  pre { margin: 0; padding: 14px 18px 16px; width: ${width}ch; color: #e9e3dc; font: 15px/1.15 'DejaVu Sans Mono', monospace; }
  figcaption { margin-top: 10px; text-align: center; color: #8b8178; font: 13px 'DejaVu Sans', sans-serif; }`
