import type { Row, Ant, Task, Breed, Fold, Dug } from '../types'
import {
  MOUND,
  MOUND_PALETTE,
  SHAPES,
  TREE_INDENT,
  glyphStart,
  stageOf,
  trailIndexFor,
  type Cell as MoundCell,
  type MoundShape,
  type Orientation,
} from './mound'
import { inHole, seatPeeks, tunnelIndex } from './ants'
import { branchPrefixSteps, isBuilt } from './tree'

/** A run of text in one style. `bg` is a background color (the hole's, under anything drawn on it). */
export type Seg = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean }
export type Line = Seg[]

export const lineText = (line: Line): string => line.map(s => s.text).join('')

export { MOUND }

const SPARKLE = ['.', '*', "'", '*']

/** The sparkle line is colored by the sparkle currently shown. */
const SPARKLE_COLORS: Record<string, string | undefined> = {
  '.': MOUND_PALETTE.w,
  '*': MOUND_PALETTE.k,
  "'": MOUND_PALETTE.k,
}

/** One character cell of the picture. */
type Cell = { ch: string; color?: string; bg?: string; bold?: boolean }

/** The mound as cells, colored through its mask; the sparkles on top twinkle with `tick`. */
const moundCells = (tick: number, shape: MoundShape, stage: number): Cell[][] => {
  const { mound, mask: maskLines } = stageOf(shape, stage)
  return mound.map((text, li) => {
    const mask = Array.from(maskLines[li] ?? '')
    return Array.from(text).map((ch, i): Cell => {
      if (ch === ' ') return { ch }
      if (li === shape.sparkleLine) {
        const sparkle = SPARKLE[(tick + i) % SPARKLE.length]!
        const color = SPARKLE_COLORS[sparkle]
        return color ? { ch: sparkle, color } : { ch: sparkle }
      }
      const color = MOUND_PALETTE[mask[i] ?? '']
      return color ? { ch, color } : { ch }
    })
  })
}

/** A busy ant's dot's current cell along `route` (the drawn stage's tunnel). */
const tunnelCellFor = (a: Ant, route: MoundCell[]): MoundCell | undefined => {
  const i = tunnelIndex(a, route.length)
  return i === undefined ? undefined : route[i]
}

// ---- dug tunnel cells -------------------------------------------------------

/** A well-mixed hash of a tunnel index (murmur3's finalizer), so neighbouring cells look unrelated. */
const cellHash = (i: number): number => {
  let h = (i + 0x9e3779b9) | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Packed tunnel walls: a deeper red than the mound's own shades, so a dug tunnel reads as one. */
const PASSAGE_COLOR = '#8a3a24'
/** Larvae tended in a nursery chamber. */
const LARVA_COLOR = '#f2e2c0'
/** A root grown down through the mound. */
const ROOT_COLOR = '#9a7a4e'

/** The colors of the fungi that sprout in old tunnels: pale cream, pink, and a glowing teal. */
const FUNGUS_COLORS = ['#f3e5c0', '#ef9fbd', '#6fe0c8'] as const

/** A fungus's growth, by its tunnel's age in ticks: a spore, a sprout, a stalk, then a cap. */
const FUNGUS_FRAMES: readonly [minAge: number, ch: string][] = [
  [140, 'τ'],
  [80, 'ı'],
  [40, ','],
  [15, '.'],
]

/**
 * How a dug tunnel cell looks, `age` ticks after it was dug: never a blank, but a change to
 * the mound itself — packed, deeper-red tunnel wall where the shades were, a nursery chamber
 * of larvae, a root showing through, or (about one cell in seven) a fungus that grows from a
 * spore to a capped stalk the longer the colony keeps working (ticks only advance while
 * something is busy). Which of them a cell gets is fixed by its index, so it never changes
 * kind from one draw to the next; a fungus too young to show yet is plain tunnel wall.
 */
export function dugSprite(i: number, age: number): { ch: string; color: string } {
  const h = cellHash(i)
  const kind = h % 20
  if (kind >= 17) {
    const frame = FUNGUS_FRAMES.find(([minAge]) => age >= minAge)
    if (frame) return { ch: frame[1], color: FUNGUS_COLORS[(h >>> 8) % FUNGUS_COLORS.length]! }
  }
  if (kind === 15 || kind === 16) return { ch: '~', color: ROOT_COLOR } // a root
  if (kind >= 11 && kind <= 14) return { ch: 'o', color: LARVA_COLOR } // a nursery chamber's larva
  return { ch: '▓', color: PASSAGE_COLOR } // packed tunnel wall
}

/**
 * Writes `text` into `cells` from column `start`, padding with blanks as needed. Cells
 * of the hole keep its dark color as their background, so the hole still reads as one
 * on a light terminal under antennae or an ant climbing out.
 */
const paint = (cells: Cell[], start: number, text: string, color: string, bold = false) => {
  Array.from(text).forEach((ch, j) => {
    while (cells.length < start + j) cells.push({ ch: ' ' })
    const under = cells[start + j]
    const bg = under?.bg ?? (under?.color === MOUND_PALETTE.H ? MOUND_PALETTE.H : undefined)
    const cell: Cell = { ch, color }
    if (bg) cell.bg = bg
    if (bold) cell.bold = true
    cells[start + j] = cell
  })
}

/** Joins cells into runs of the same style. */
const toLine = (cells: Cell[]): Line => {
  const line: Line = []
  for (const c of cells) {
    const last = line.at(-1)
    if (last && last.color === c.color && last.bg === c.bg && !!last.bold === !!c.bold) {
      last.text += c.ch
      continue
    }
    const seg: Seg = { text: c.ch }
    if (c.color) seg.color = c.color
    if (c.bg) seg.bg = c.bg
    if (c.bold) seg.bold = true
    line.push(seg)
  }
  return line
}

/**
 * Antennae of an ant resting in the hole, busy with the colony's own work: a
 * slow idle wiggle between two frames (register.tsx advances `frame` for a
 * home ant even with no file to crawl to, so the hole never looks frozen).
 */
const PEEK_FRAMES: readonly [string, string] = ['"', "'"]
export const PEEK = PEEK_FRAMES[0]
export const peekGlyph = (frame: number): string => PEEK_FRAMES[frame % 2]!

// ---- ant glyphs -----------------------------------------------------------

/** Walking/returning frames per breed (fixed width, legs alternate). Index: 0 down, 1 up. */
const WALK: Record<Breed, [string, string]> = {
  haiku: ['.o', 'o.'],
  sonnet: ['oOo', 'OoO'],
  opus: ['<OOO>', '>OOO<'],
  fable: ['}o8o{', ')o8o('],
  other: ['ooo', 'ooo'],
}

/** Working/building frames per breed, same width as WALK for that breed. */
const WORK: Record<Breed, [string, string]> = {
  haiku: ['o.', '.o'],
  sonnet: ['OoO', 'oOo'],
  opus: ['>OOO<', '<OOO>'],
  fable: [')o8o(', '}o8o{'],
  other: ['ooo', 'ooo'],
}

const pick = (pair: readonly [string, string], parity: number): string => (parity === 0 ? pair[0] : pair[1])

export const antGlyph = (breed: Breed, task: Task, frame: number): string => {
  const parity = frame % 2
  if (task === 'returning') return pick(WALK[breed], 1 - parity)
  if (task === 'working' || task === 'building') return pick(WORK[breed], parity)
  // 'walking', 'home' and 'busy' (shown as a dot on the mound, not on the trail: only
  // the legend ever draws its glyph) all face down the tree
  return pick(WALK[breed], parity)
}

// ---- work/build effects ---------------------------------------------------

const SPARKS = ['*', '+', 'x', "'"]
const DUST = ['#', '=', '~', '=']

export const workFx = (task: Task, frame: number): string => {
  if (task === 'working') return ' ' + SPARKS[frame % SPARKS.length]
  if (task === 'building') return ' ' + DUST[frame % DUST.length]
  return ''
}

// ---- composition -----------------------------------------------------------

type Opts = {
  width: number
  height: number
  tick: number
  mainRow?: number
  orientation?: Orientation
  /** The mound's growth stage (how full the context window is); defaults to 0, ungrown. */
  growth?: number
  /** Tunnel cells already dug, along the drawn stage's route; defaults to none. */
  dug?: Dug[]
  /** Whether to draw the legend under the picture; defaults to true (the strip draws its own beside its button). */
  legend?: boolean
}

/** The legend: each ant's glyph, label and model, wrapped into lines `width` wide. */
export const legendLines = (ants: Ant[], width: number, tick: number): Line[] => {
  const items = ants.map(a => ({
    text: antGlyph(a.breed, a.task, tick) + ' ' + a.label + ' (' + a.breed + ')',
    color: a.color,
  }))
  const legend: Line[] = []
  let cur: Line = []
  let curW = 0
  for (const item of items) {
    const w = item.text.length + 2
    if (curW > 0 && curW + w > width) {
      legend.push(cur)
      cur = []
      curW = 0
    }
    if (curW > 0) {
      cur.push({ text: '  ', dim: true })
      curW += 2
    }
    cur.push({ text: item.text, color: item.color })
    curW += item.text.length
  }
  if (cur.length > 0) legend.push(cur)
  return legend
}


const clip = (s: string, width: number): string => Array.from(s).slice(0, Math.max(0, width)).join('')

const clipLine = (line: Line, width: number): Line => {
  let left = width
  const out: Line = []
  for (const seg of line) {
    if (left <= 0) break
    const text = clip(seg.text, left)
    if (text.length === 0) continue
    out.push({ ...seg, text })
    left -= Array.from(text).length
  }
  return out
}

/**
 * The mound with home ants peeking out of the hole and ants crawling its trail.
 * Each ant in the hole peeks from its own seat (seatPeeks), so one ant leaving
 * never makes another's antennae jump.
 */
const moundLines = (ants: Ant[], tick: number, shape: MoundShape, stage: number, dug: Dug[]): Line[] => {
  const cells = moundCells(tick, shape, stage)
  const route = stageOf(shape, stage).tunnel

  // The ground first: cells some busy ant has already dug through (a cell past the drawn
  // stage's route, dug while the mound was bigger, isn't shown), then the busy ants' dots
  // digging on, so ants on the trail and antennae in the hole are drawn over both.
  for (const d of dug) {
    const cell = route[d.i]
    const row = cell && cells[cell.line]
    if (!cell || !row) continue
    const { ch, color } = dugSprite(d.i, tick - d.at)
    paint(row, cell.col, ch, color)
  }
  // busy ants (no file to point to), as a dot digging through the mound body. seatOrbits
  // already keeps their seats spaced apart, so unlike the trail no two can ever land
  // on the same cell here (apart from a bounce at the tunnel's ends, briefly hiding one).
  for (const a of ants) {
    const cell = tunnelCellFor(a, route)
    const row = cell && cells[cell.line]
    if (cell && row) paint(row, cell.col, BUSY_DOT, a.color)
  }

  let inMouth = false
  for (const a of seatPeeks(ants)) {
    const at = a.peek === undefined ? undefined : shape.peeks[a.peek]
    const row = at && cells[at.line]
    if (!at || !row) continue
    paint(row, at.col, peekGlyph(a.frame), a.color, true)
    if (at.line === shape.hole.line) inMouth = true
  }
  // Antennae darken their whole mouth cell (it keeps the hole's ground); the rest of
  // the mouth does the same, or the hole looks lopsided on a light terminal. A cell an
  // ant painted never has the hole's own color (it's the ant's), so this only touches
  // cells no antennae reached.
  const mouth = cells[shape.hole.line]
  if (inMouth && mouth) {
    for (let col = shape.hole.start; col <= shape.hole.end; col++) {
      const c = mouth[col]
      if (c && c.color === MOUND_PALETTE.H) mouth[col] = { ...c, bg: MOUND_PALETTE.H }
    }
  }

  // trail ants, nearest the hole first
  const onPoint: Ant[][] = shape.trail.map(() => [])
  for (const a of ants) {
    if (inHole(a)) continue
    const k = trailIndexFor(shape, a.at)
    if (k !== undefined) onPoint[k]!.push(a)
  }
  // One ant to a point (step() keeps them apart; this is for any that still meet): a
  // second would stand beside the first, inside the mound or over the hole, so it is
  // drawn a point back along its way, where it stood a tick ago. Beside the trunk
  // there's open ground and down in the well nowhere further back: there they stand
  // side by side.
  const last = shape.trail.length - 1
  for (let moved = true; moved; ) {
    moved = false
    onPoint.forEach((here, k) => {
      if (k === last) return
      for (const a of here.slice(1)) {
        const back = a.task === 'returning' ? k + 1 : k - 1
        if (back < 0) continue
        here.splice(here.indexOf(a), 1)
        onPoint[back]!.push(a)
        moved = true
      }
    })
  }
  // Points on one line can sit closer together than a glyph is wide (the summit's
  // k1..k3 are 2 columns apart), so glyphs are placed per line: one that would
  // overlap an ant already there moves beside it instead.
  const taken = new Map<number, Span[]>()
  onPoint.forEach((here, k) => {
    const point = shape.trail[k]!
    const row = cells[point.line]
    if (!row || here.length === 0) return
    const spans = taken.get(point.line) ?? []
    taken.set(point.line, spans)
    let want = -1
    for (const a of here) {
      const glyph = antGlyph(a.breed, a.task, a.frame)
      const width = Array.from(glyph).length
      if (want < 0) want = glyphStart(point, width)
      const start = freeStart(spans, want, width)
      paint(row, start, glyph, a.color)
      spans.push({ start, end: start + width })
      want = start + width
    }
  })

  return cells.map(toLine)
}

/** A busy ant's dot, digging through the mound body while it has no file to point to. */
const BUSY_DOT = '•'

/** Columns `start` (inclusive) to `end` (exclusive) of one mound line, held by an ant. */
type Span = { start: number; end: number }

const isFree = (spans: Span[], start: number, width: number): boolean =>
  spans.every(s => start + width <= s.start || start >= s.end)

/**
 * Where a glyph `width` wide that wants column `want` goes among the ants already
 * on its line: there if free, else the nearest free place to its left (the trail
 * runs leftward along the summit and down the flank), else the nearest to its right.
 */
const freeStart = (spans: Span[], want: number, width: number): number => {
  if (isFree(spans, want, width)) return want
  for (let x = want - 1; x >= 0; x--) if (isFree(spans, x, width)) return x
  let x = want + 1
  while (!isFree(spans, x, width)) x++
  return x
}

/**
 * A tree row's indent/branch text with one or more climbing ants' glyphs painted over
 * their ancestor trunk column, instead of appended after the row's own prefix — the
 * same "last write wins" overlay `paint()` uses on the mound, here on plain text since
 * a tree row has no background to preserve.
 */
const overlayLine = (base: string, overlays: { col: number; glyph: string; color: string }[]): Line => {
  const chars: { ch: string; color?: string }[] = Array.from(base).map(ch => ({ ch }))
  for (const o of overlays) {
    Array.from(o.glyph).forEach((ch, j) => {
      const idx = o.col + j
      while (chars.length <= idx) chars.push({ ch: ' ' })
      chars[idx] = { ch, color: o.color }
    })
  }
  const line: Line = []
  for (const c of chars) {
    const last = line.at(-1)
    const dim = c.color === undefined
    if (last && last.color === c.color && !!last.dim === dim) {
      last.text += c.ch
      continue
    }
    const seg: Seg = { text: c.ch }
    if (c.color) seg.color = c.color
    else seg.dim = true
    line.push(seg)
  }
  return line
}

/** How many ticks between fold stages shrinking by one branch. */
const FOLD_STAGE_TICKS = 3

/**
 * One compaction's block: while it runs, a small generic tree (sized only by how many
 * messages there were, never their content — that's private) collapsing branch by
 * branch; once resolved, a single settled row for `f.settle` ticks, then gone.
 */
const foldLines = (f: Fold, indent: string): Line[] => {
  const header: Line = [{ text: `${indent}${f.label} folding its memory…`, dim: true }]
  if (f.after !== undefined) {
    return [header, [{ text: `${indent}└── (summarized, ${f.before} → ${f.after})`, dim: true }]]
  }
  const branches = Math.min(3, Math.max(1, f.before))
  const open = Math.max(1, branches - Math.floor(f.frame / FOLD_STAGE_TICKS))
  const body = Array.from({ length: open }, (_, i): Line => [
    { text: `${indent}${i === open - 1 ? '└── ' : '├── '}…`, dim: true },
  ])
  return [header, ...body]
}

/**
 * Scrolls `treeLines` into a `room`-tall window around `anchor` (a row index, or -1 for
 * none), with "… N more" markers when it doesn't all fit; returned as-is, unscrolled,
 * when it already does. Shared by both orientations — only how much `room` they have,
 * and where the mound sits relative to the result, differs between them.
 */
const scrollWindow = (treeLines: Line[], room: number, anchor: number, indent: string): Line[] => {
  if (treeLines.length <= room) return treeLines

  const windowFor = (visible: number) => {
    let s = anchor >= 0 ? Math.max(0, anchor - visible + 1) : 0
    s = Math.min(s, Math.max(0, treeLines.length - visible))
    const e = Math.min(treeLines.length, s + visible)
    return { start: s, end: e }
  }

  // Shrink the window until the "more" markers it needs fit beside it: making room
  // for one can scroll the window enough to need the other. Keep at least one row.
  let reserve = 0
  let { start, end } = windowFor(room)
  for (;;) {
    const need = (start > 0 ? 1 : 0) + (end < treeLines.length ? 1 : 0)
    if (need <= reserve) break
    reserve = need
    ;({ start, end } = windowFor(Math.max(Math.min(1, room), room - reserve)))
  }
  // a pane too short for both markers drops what it can't hold
  const spare = room - (end - start)
  const top = start > 0 && spare >= 1
  const bottom = end < treeLines.length && spare >= (top ? 2 : 1)

  const out: Line[] = []
  if (top) out.push([{ text: `${indent}… ${start} more`, dim: true }])
  out.push(...treeLines.slice(start, end))
  if (bottom) out.push([{ text: `${indent}… ${treeLines.length - end} more`, dim: true }])
  return out
}

/** Today's only layout: the mound stacked above the (scrolled) tree, then the legend. */
const composeVertical = (
  mound: Line[], foldBlock: Line[], legend: Line[], treeLines: Line[], indent: string,
  anchor: number, width: number, height: number,
): Line[] => {
  const reserved = mound.length + foldBlock.length + legend.length
  const room = Math.max(0, height - reserved)
  const out = scrollWindow(treeLines, room, anchor, indent)
  return [...mound, ...foldBlock, ...out, ...legend].map(l => clipLine(l, width)).slice(0, height)
}

/**
 * The short-and-wide layout: the (now short) mound sits in the left columns, the
 * (scrolled) tree fills the rest of the width beside it — the mound no longer eats into
 * the tree's own row budget, since it isn't stacked above it any more. The fold block
 * and legend still stack full-width above/below, unchanged: they're rare/short enough
 * that giving them their own column treatment isn't worth the complexity.
 */
const composeHorizontal = (
  mound: Line[], foldBlock: Line[], legend: Line[], treeLines: Line[], indent: string,
  anchor: number, width: number, height: number, moundArt: string[],
): Line[] => {
  // The tree's own window: unaffected by the mound's height, since the two share rows
  // (zipped below) rather than costing separate budget — a tree shorter than the mound
  // already fits "for free" alongside it, same as the no-fold-no-legend case today.
  const reserved = foldBlock.length + legend.length
  const room = Math.max(0, height - reserved)
  const out = scrollWindow(treeLines, room, anchor, indent)

  // Measured from the mound's own static art, not the painted lines: an ant's glyph can
  // be wider than one cell, and painting one near the mound's right edge would otherwise
  // stretch that one line past the art's real width, making the tree's column drift.
  const moundWidth = Math.max(0, ...moundArt.map(l => Array.from(l).length))
  const gap = 2
  const rowCount = Math.max(mound.length, out.length)
  const zipped: Line[] = []
  for (let r = 0; r < rowCount; r++) {
    const left = mound[r] ?? []
    const pad = Math.max(0, moundWidth - Array.from(lineText(left)).length) + gap
    zipped.push([...left, { text: ' '.repeat(pad) }, ...(out[r] ?? [])])
  }

  // The zipped block is `rowCount` rows regardless of `room` (at least the mound's own
  // height), so it has to be checked against `height` explicitly here, or a short pane
  // would draw fold/legend rows nothing is left to show — silently cut off by the final
  // slice below, instead of a deliberate choice. Folds give way first, then the legend,
  // same precedence composeVertical gives them.
  const keptFold = rowCount + foldBlock.length <= height ? foldBlock : []
  const keptLegend = rowCount + keptFold.length + legend.length <= height ? legend : []
  return [...zipped, ...keptFold, ...keptLegend].map(l => clipLine(l, width)).slice(0, height)
}

export const compose = (rows: Row[], ants: Ant[], folds: Fold[], opts: Opts): Line[] => {
  const { width, height } = opts
  const orientation = opts.orientation ?? 'vertical'
  const shape = SHAPES[orientation]
  const stage = shape.stages.indexOf(stageOf(shape, opts.growth ?? 0))

  // -- mound block --
  const mound = moundLines(ants, opts.tick, shape, stage, opts.dug ?? [])
  const indent = ' '.repeat(TREE_INDENT)
  const foldBlock: Line[] = folds.flatMap(f => foldLines(f, indent))

  // -- legend block --
  const legend = opts.legend === false ? [] : legendLines(ants, width, opts.tick)

  // -- tree rows --
  const prefixSteps = branchPrefixSteps(rows)
  const byRow = new Map<number, Ant[]>()
  for (const a of ants) {
    if (inHole(a) || a.at < 0) continue
    const list = byRow.get(a.at) ?? []
    list.push(a)
    byRow.set(a.at, list)
  }

  const treeLines: Line[] = rows.map((row, i) => {
    const steps = prefixSteps[i] ?? []
    const here = byRow.get(i) ?? []
    const gutterAnts = here.filter(a => a.task === 'walking' || a.task === 'returning')
    const standingAnts = here.filter(a => a.task === 'working' || a.task === 'building')

    // A gutter ant still easing toward this row's depth is drawn climbing down the
    // shallower ancestor's trunk column instead of after the row's own full prefix.
    const climbing = gutterAnts.filter(a => a.climbDepth !== undefined && a.climbDepth < row.depth)
    const walking = gutterAnts.filter(a => !climbing.includes(a))
    const baseText = indent + steps.join('')
    const overlays = climbing.map(a => ({
      col: indent.length + steps.slice(0, a.climbDepth!).join('').length,
      glyph: antGlyph(a.breed, a.task, a.frame),
      color: a.color,
    }))

    const line: Line = overlays.length > 0 ? overlayLine(baseText, overlays) : [{ text: baseText, dim: true }]
    for (const a of walking) line.push({ text: antGlyph(a.breed, a.task, a.frame) + ' ', color: a.color })

    if (isBuilt(row)) {
      const highlighted = standingAnts[0]
      const name = row.isDir ? row.name + '/' : row.name
      line.push(
        highlighted
          ? { text: name, color: highlighted.color, bold: true }
          : { text: name, bold: row.isDir },
      )
    }

    for (const a of standingAnts) {
      line.push({ text: ' ' + antGlyph(a.breed, a.task, a.frame), color: a.color })
      const fx = workFx(a.task, a.frame)
      if (fx) line.push({ text: fx, color: a.color, dim: true })
    }

    return line
  })

  // follow the main ant when it's on the tree (the camera's own ask); otherwise keep
  // the lowest ant on the tree visible, as before, so a lone busy subagent (main idle
  // at home) still stays in view. The mound and its trail always show regardless.
  let lowest = -1
  for (const rowIdx of byRow.keys()) lowest = Math.max(lowest, rowIdx)
  const anchor = opts.mainRow !== undefined && opts.mainRow >= 0 ? opts.mainRow : lowest

  return orientation === 'horizontal'
    ? composeHorizontal(mound, foldBlock, legend, treeLines, indent, anchor, width, height, stageOf(shape, stage).mound)
    : composeVertical(mound, foldBlock, legend, treeLines, indent, anchor, width, height)
}
