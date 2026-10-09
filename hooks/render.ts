import type { Row, Ant, Task, Breed } from '../types'
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
import { inHole, seatPeeks } from './ants'
import { branchPrefixes, isBuilt } from './tree'

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
  // 'walking' and 'home' both face down the tree
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

type Opts = { width: number; height: number; tick: number }

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

  return cells.map(toLine)
}

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

export const compose = (rows: Row[], ants: Ant[], opts: Opts): Line[] => {
  const { width, height } = opts

  // -- mound block --
  const mound = moundLines(ants, opts.tick)

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
  const prefixes = branchPrefixes(rows)
  const indent = ' '.repeat(TREE_INDENT)
  const byRow = new Map<number, Ant[]>()
  for (const a of ants) {
    if (inHole(a) || a.at < 0) continue
    const list = byRow.get(a.at) ?? []
    list.push(a)
    byRow.set(a.at, list)
  }

  const treeLines: Line[] = rows.map((row, i) => {
    const prefix = prefixes[i] ?? ''
    const here = byRow.get(i) ?? []
    const gutterAnts = here.filter(a => a.task === 'walking' || a.task === 'returning')
    const standingAnts = here.filter(a => a.task === 'working' || a.task === 'building')

    const line: Line = [{ text: indent + prefix, dim: true }]
    for (const a of gutterAnts) line.push({ text: antGlyph(a.breed, a.task, a.frame) + ' ', color: a.color })

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

  // -- viewport: fit mound + legend + tree into height --
  const reserved = mound.length + legend.length
  const room = Math.max(0, height - reserved)

  if (treeLines.length > room) {
    // keep the lowest ant on the tree visible (the mound and its trail always show); else show from the top
    let lowest = -1
    for (const rowIdx of byRow.keys()) lowest = Math.max(lowest, rowIdx)

    const windowFor = (visible: number) => {
      let s = lowest >= 0 ? Math.max(0, lowest - visible + 1) : 0
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
    return [...mound, ...out, ...legend].map(l => clipLine(l, width)).slice(0, height)
  }

  return [...mound, ...treeLines, ...legend].map(l => clipLine(l, width)).slice(0, height)
}
