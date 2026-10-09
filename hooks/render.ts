import type { Row, Ant, Task, Breed, Fold } from '../types'
import {
  HOLE,
  MOUND,
  MOUND_MASK,
  MOUND_PALETTE,
  PEEKS,
  SPARKLE_LINE,
  TRAIL,
  TREE_INDENT,
  glyphStart,
  trailIndex,
} from './mound'
import { inHole, orbitCell, seatPeeks } from './ants'
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
const moundCells = (tick: number): Cell[][] =>
  MOUND.map((text, li) => {
    const mask = Array.from(MOUND_MASK[li] ?? '')
    return Array.from(text).map((ch, i): Cell => {
      if (ch === ' ') return { ch }
      if (li === SPARKLE_LINE) {
        const sparkle = SPARKLE[(tick + i) % SPARKLE.length]!
        const color = SPARKLE_COLORS[sparkle]
        return color ? { ch: sparkle, color } : { ch: sparkle }
      }
      const color = MOUND_PALETTE[mask[i] ?? '']
      return color ? { ch, color } : { ch }
    })
  })

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

type Opts = { width: number; height: number; tick: number; mainRow?: number }

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
const moundLines = (ants: Ant[], tick: number): Line[] => {
  const cells = moundCells(tick)

  let inMouth = false
  for (const a of seatPeeks(ants)) {
    const at = a.peek === undefined ? undefined : PEEKS[a.peek]
    const row = at && cells[at.line]
    if (!at || !row) continue
    paint(row, at.col, peekGlyph(a.frame), a.color, true)
    if (at.line === HOLE.line) inMouth = true
  }
  // Antennae darken their whole mouth cell (it keeps the hole's ground); the rest of
  // the mouth does the same, or the hole looks lopsided on a light terminal. A cell an
  // ant painted never has the hole's own color (it's the ant's), so this only touches
  // cells no antennae reached.
  const mouth = cells[HOLE.line]
  if (inMouth && mouth) {
    for (let col = HOLE.start; col <= HOLE.end; col++) {
      const c = mouth[col]
      if (c && c.color === MOUND_PALETTE.H) mouth[col] = { ...c, bg: MOUND_PALETTE.H }
    }
  }

  // trail ants, nearest the hole first
  const onPoint: Ant[][] = TRAIL.map(() => [])
  for (const a of ants) {
    if (inHole(a)) continue
    const k = trailIndex(a.at)
    if (k !== undefined) onPoint[k]!.push(a)
  }
  // One ant to a point (step() keeps them apart; this is for any that still meet): a
  // second would stand beside the first, inside the mound or over the hole, so it is
  // drawn a point back along its way, where it stood a tick ago. Beside the trunk
  // there's open ground and down in the well nowhere further back: there they stand
  // side by side.
  const last = TRAIL.length - 1
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
    const point = TRAIL[k]!
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

  // busy ants (no file to point to), as a dot orbiting the mound body. seatOrbits
  // already keeps their seats spaced apart, so unlike the trail no two can ever land
  // on the same cell here.
  for (const a of ants) {
    const cell = orbitCell(a)
    const row = cell && cells[cell.line]
    if (cell && row) paint(row, cell.col, ORBIT_DOT, a.color)
  }

  return cells.map(toLine)
}

/** A busy ant's dot, orbiting inside the mound while it has no file to point to. */
const ORBIT_DOT = '•'

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

export const compose = (rows: Row[], ants: Ant[], folds: Fold[], opts: Opts): Line[] => {
  const { width, height } = opts

  // -- mound block --
  const mound = moundLines(ants, opts.tick)
  const indent = ' '.repeat(TREE_INDENT)
  const foldBlock: Line[] = folds.flatMap(f => foldLines(f, indent))

  // -- legend block --
  const legendItems = ants.map(a => ({
    text: antGlyph(a.breed, a.task, opts.tick) + ' ' + a.label + ' (' + a.breed + ')',
    color: a.color,
  }))
  const legend: Line[] = []
  if (legendItems.length > 0) {
    let cur: Line = []
    let curW = 0
    for (const item of legendItems) {
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
  }

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

  // -- viewport: fit mound + fold + legend + tree into height --
  const reserved = mound.length + foldBlock.length + legend.length
  const room = Math.max(0, height - reserved)

  if (treeLines.length > room) {
    // follow the main ant when it's on the tree (the camera's own ask); otherwise keep
    // the lowest ant on the tree visible, as before, so a lone busy subagent (main idle
    // at home) still stays in view. The mound and its trail always show regardless.
    let lowest = -1
    for (const rowIdx of byRow.keys()) lowest = Math.max(lowest, rowIdx)
    const anchor = opts.mainRow !== undefined && opts.mainRow >= 0 ? opts.mainRow : lowest

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
    return [...mound, ...foldBlock, ...out, ...legend].map(l => clipLine(l, width)).slice(0, height)
  }

  return [...mound, ...foldBlock, ...treeLines, ...legend].map(l => clipLine(l, width)).slice(0, height)
}
