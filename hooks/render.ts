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

// ---- mishaps ---------------------------------------------------------------

/** The color a mishap or flash shows: a failed call reads redder than a denied one. */
export const MISHAP_COLORS: Record<'error' | 'denied', string> = { error: '#ff4d4d', denied: '#ffb000' }

/** The trailing marker a mishap or flash shows: 'x' for an error, '!' for a denial. */
export const MISHAP_MARK: Record<'error' | 'denied', string> = { error: 'x', denied: '!' }

/**
 * The color an ant is drawn in on this frame: its own, unless it has a mishap, in
 * which case it blinks every other frame between that and the mishap's own color —
 * on the trail, on tree rows and in the hole alike, so the stumble reads as a change
 * to the ant itself rather than a steady recolor.
 */
const antColor = (a: Ant): string => (a.mishap && a.frame % 2 === 1 ? MISHAP_COLORS[a.mishap.kind] : a.color)

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

/**
 * The legend: each ant's glyph, label and model, wrapped into lines `width` wide. One
 * with a mishap gets a trailing ' x' (error) or ' !' (denied), in the mishap's own
 * color, after its own (unblinking here) label text.
 */
export const legendLines = (ants: Ant[], width: number, tick: number): Line[] => {
  const items = ants.map(a => {
    const mark = a.mishap ? ' ' + MISHAP_MARK[a.mishap.kind] : ''
    return {
      text: antGlyph(a.breed, a.task, tick) + ' ' + a.label + ' (' + a.breed + ')' + mark,
      color: a.color,
      mark,
      markColor: a.mishap ? MISHAP_COLORS[a.mishap.kind] : undefined,
    }
  })
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
    if (item.mark) {
      cur.push({ text: item.text.slice(0, item.text.length - item.mark.length), color: item.color })
      cur.push({ text: item.mark, color: item.markColor })
    } else {
      cur.push({ text: item.text, color: item.color })
    }
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
const moundLines = (ants: Ant[], tick: number, shape: MoundShape, stage: number, dug: Dug[], refactor?: Refactor): Line[] => {
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

  // The ants refactoring the anthill (main compacting): its loose light-shade cells and
  // the tunnels dug through it filled in and packed tight, from the bottom up, the
  // `refactor.packed` fraction of them so far (drawn over the tunnels: they're being filled).
  if (refactor && refactor.packed > 0) {
    const mask = stageOf(shape, stage).mask
    const seen = new Set<string>()
    const loose: { line: number; col: number }[] = []
    const add = (p: { line: number; col: number }) => {
      const key = `${p.line},${p.col}`
      if (!seen.has(key)) {
        seen.add(key)
        loose.push(p)
      }
    }
    mask.forEach((keys, line) => Array.from(keys).forEach((k, col) => k === 'l' && add({ line, col })))
    for (const d of dug) if (route[d.i]) add(route[d.i]!)
    loose.sort((a, b) => b.line - a.line || a.col - b.col)
    for (const p of loose.slice(0, Math.floor(refactor.packed * loose.length))) {
      const row = cells[p.line]
      if (row) row[p.col] = { ch: PACKED_CHAR, color: MOUND_PALETTE.o }
    }
  }
  // the refactoring workers, hauling clods up from the hump side toward the hole and going
  // back empty: each bounces along shape.haul, offset from the others
  if (refactor?.workers) {
    const path = shape.haul
    const period = Math.max(1, 2 * (path.length - 1))
    for (let k = 0; k < WORKERS; k++) {
      const m = (Math.floor(refactor.workers.frame / WORKER_TICKS) + Math.floor((k * period) / WORKERS)) % period
      const carrying = m < path.length - 1
      const p = path[carrying ? m : period - m]
      const row = p && cells[p.line]
      if (!p || !row) continue
      if (carrying) paint(row, p.col, CLOD, MOUND_PALETTE.T!)
      paint(row, p.col + 1, WORKER, refactor.workers.color)
    }
  }

  // busy ants (no file to point to), as a dot digging through the mound body. seatOrbits
  // already keeps their seats spaced apart, so unlike the trail no two can ever land
  // on the same cell here (apart from a bounce at the tunnel's ends, briefly hiding one).
  // One with a mishap digs its marker instead of the plain dot, in the mishap's own color.
  for (const a of ants) {
    const cell = tunnelCellFor(a, route)
    const row = cell && cells[cell.line]
    if (!cell || !row) continue
    if (a.mishap) paint(row, cell.col, MISHAP_MARK[a.mishap.kind], MISHAP_COLORS[a.mishap.kind])
    else paint(row, cell.col, BUSY_DOT, a.color)
  }

  let inMouth = false
  for (const a of seatPeeks(ants)) {
    const at = a.peek === undefined ? undefined : shape.peeks[a.peek]
    const row = at && cells[at.line]
    if (!at || !row) continue
    paint(row, at.col, peekGlyph(a.frame), antColor(a), true)
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
      paint(row, start, glyph, antColor(a))
      spans.push({ start, end: start + width })
      want = start + width
    }
  })

  return cells.map(toLine)
}

/** A busy ant's dot, digging through the mound body while it has no file to point to. */
const BUSY_DOT = '•'

/** A mound cell the refactoring ants have packed tight. */
const PACKED_CHAR = '▒'
/** A refactoring worker, and the clod of dirt it hauls. */
const WORKER = 'o'
const CLOD = '▪'
/** How many workers haul while main compacts, and how many ticks each takes a step. */
const WORKERS = 3
const WORKER_TICKS = 2

/**
 * The ants refactoring the anthill while main's conversation is compacted: the growth stage
 * the mound is drawn at (the hump coming down), what fraction (0..1) of its loose cells are
 * packed tight and of the tree's fold steps are taken, and the workers hauling (while at it).
 */
type Refactor = { stage: number; packed: number; folded: number; workers?: { frame: number; color: string } }

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

/** Top-level rows a fully folded tree still shows. */
const FOLDED_KEEP = 3

// ---- how long main's compaction is expected to take, and the refactoring paced to it ----

/** A compaction's fixed overhead, and what each token of context it folds adds, in ms. */
export const COMPACT_BASE_MS = 5000
export const COMPACT_MS_PER_TOKEN = 0.4
/** The per-token cost learnRate() will ever settle on, whatever one odd compaction measured. */
const MIN_MS_PER_TOKEN = 0.02
const MAX_MS_PER_TOKEN = 5

/** How long folding `tokens` of context should take, in ms, at `msPerToken` (learned, or the default). */
export const compactMs = (tokens: number, msPerToken = COMPACT_MS_PER_TOKEN): number =>
  COMPACT_BASE_MS + Math.max(0, tokens || 0) * msPerToken

/**
 * The per-token cost after one more compaction that folded `tokens` of context in `ms`:
 * halfway from the last estimate (`rate`, absent before the first) to what this one took,
 * so a single odd compaction can't throw the next one's pacing far off.
 */
export const learnRate = (rate: number | undefined, tokens: number, ms: number): number | undefined => {
  if (!(tokens > 0) || !(ms > 0)) return rate
  const seen = Math.min(MAX_MS_PER_TOKEN, Math.max(MIN_MS_PER_TOKEN, Math.max(0, ms - COMPACT_BASE_MS) / tokens))
  return rate === undefined || !(rate > 0) ? seen : (rate + seen) / 2
}

/** `Fold.eta` for a fold that has none (saved before it existed): about 30s at 120ms a tick. */
const DEFAULT_ETA_TICKS = 250

/** How far through its expected run (`frame / eta`) the refactoring keeps a steady pace. */
const STEADY_UNTIL = 0.75
/** After that it slows, so an overdue compaction still shows progress: its time scale, in etas. */
const OVERDUE_EASE = 0.6

/**
 * How far main's compaction has refactored the anthill after `frame` ticks of an expected
 * `eta`, 0..1: steadily up to STEADY_UNTIL of the way through its eta, then ever slower,
 * never quite done until it resolves — however long past its estimate that takes.
 */
export const foldProgress = (frame: number, eta = DEFAULT_ETA_TICKS): number => {
  const x = Math.max(0, frame) / Math.max(1, eta)
  if (x <= STEADY_UNTIL) return x
  return STEADY_UNTIL + (1 - STEADY_UNTIL) * (1 - Math.exp(-(x - STEADY_UNTIL) / OVERDUE_EASE))
}

/** The part of the refactoring spent hauling the hump away (if there is one); packing gets the rest. */
const HAUL_SHARE = 0.5
/** How far through the refactoring the tree is fully folded. */
const TREE_SHARE = 0.9

/**
 * How many ticks a resolved compaction's "memory folded" header stays: about 5s at 120ms
 * a tick. Over its first SETTLE_FINISH ticks the ants finish whatever refactoring was left
 * (a compaction quicker than its estimate), it holds fully folded until SETTLE_HOLD, so the
 * header reads against the folded tree, then the tree unfolds evenly over the rest.
 */
export const SETTLE_TICKS = 40
const SETTLE_FINISH = 6
const SETTLE_HOLD = 14

/**
 * How main's compaction refactors the anthill at this moment. `live` is the growth stage
 * the mound would be drawn at without it. Progress `p` (foldProgress) spends HAUL_SHARE
 * hauling the hump away, a stage at a time, then packs the mound tighter, cell by cell,
 * while the tree folds over TREE_SHARE of it. Once resolved the ants finish the job, it
 * holds, then the packing and the tree ease back together. A skipped one changes nothing.
 */
const refactorOf = (f: Fold, live: number, color: string): Refactor => {
  const from = f.grown ?? live
  const haul = from > 0 ? HAUL_SHARE : 0
  const at = (p: number) => ({
    stage: haul > 0 ? Math.round(from * (1 - Math.min(1, p / haul))) : from,
    packed: Math.min(1, Math.max(0, (p - haul) / (1 - haul))),
    folded: Math.min(1, p / TREE_SHARE),
  })
  if (f.after === undefined) return { ...at(foldProgress(f.frame, f.eta)), workers: { frame: f.frame, color } }
  if (f.after === f.before) return { stage: live, packed: 0, folded: 0 }
  const elapsed = SETTLE_TICKS - (f.settle ?? 0)
  if (elapsed < SETTLE_FINISH) {
    const reached = foldProgress(f.peak ?? f.frame, f.eta)
    return { ...at(reached + ((1 - reached) * (elapsed + 1)) / SETTLE_FINISH), workers: { frame: f.frame + elapsed, color } }
  }
  const left = elapsed < SETTLE_HOLD ? 1 : Math.max(0, 1 - (elapsed - SETTLE_HOLD) / (SETTLE_TICKS - SETTLE_HOLD))
  return { stage: live, packed: left, folded: left }
}

/** The spinner a running compaction's header turns. */
const FOLD_SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

/** How many fold steps fold the whole tree: each depth level, then the top-level rows down to FOLDED_KEEP. */
const foldTotal = (rows: Row[]): number => {
  const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0)
  const top = rows.filter(r => r.depth === 0).length
  return maxDepth + Math.max(0, top - FOLDED_KEEP)
}

/**
 * The tree folded `steps` steps: its deepest level tucks away into its folders first, then
 * the next, until only top-level rows are left; those then fold away from the bottom until
 * FOLDED_KEEP remain. A `pinned` row (an ant stands on it), and the folders above it, never
 * fold away. Says, for each row, whether it shows and how many rows are tucked away right
 * beneath it, and how many top-level rows (subtrees and all) folded away below the rest.
 */
export function foldTree(rows: Row[], steps: number, pinned: Set<number>): { shown: boolean[]; tucked: number[]; folded: number } {
  const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0)
  const cut = maxDepth - Math.min(Math.max(0, steps), maxDepth)
  const tops = rows.flatMap((r, i) => (r.depth === 0 ? [i] : []))
  const topHide = Math.min(Math.max(0, steps - maxDepth), Math.max(0, tops.length - FOLDED_KEEP))
  const firstHiddenTop = topHide > 0 ? tops[tops.length - topHide]! : rows.length

  // a pinned row's folders, all the way up, stay too
  const keep = new Set<number>()
  for (const i of pinned) {
    let depth = rows[i]?.depth ?? -1
    keep.add(i)
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      if (rows[j]!.depth < depth) {
        keep.add(j)
        depth = rows[j]!.depth
      }
    }
  }

  const shown = rows.map((r, i) => keep.has(i) || (r.depth <= cut && i < firstHiddenTop))
  const tucked = rows.map(() => 0)
  let folded = 0
  const chain: number[] = [] // chain[d]: the latest row seen at depth d, the folders above the current row
  rows.forEach((r, i) => {
    if (!shown[i]) {
      let owner = -1
      for (let d = r.depth - 1; d >= 0; d--) {
        if (chain[d] !== undefined && shown[chain[d]!]) {
          owner = chain[d]!
          break
        }
      }
      if (owner >= 0) tucked[owner]!++
      else folded++
    }
    chain[r.depth] = i
    chain.length = r.depth + 1
  })
  return { shown, tucked, folded }
}

/**
 * One compaction's header line, in its ant's color: while it runs, "<label> folding its
 * memory" with a spinner turning; once resolved, how many messages it folded into how
 * many, until it leaves. Never anything of the messages themselves: that's private.
 */
const foldHeader = (f: Fold, indent: string, color: string | undefined): Line => {
  if (f.after === undefined) {
    return [{ text: `${indent}${f.label} folding its memory `, color, dim: !color }, { text: FOLD_SPIN[f.frame % FOLD_SPIN.length]!, color, bold: true }]
  }
  if (f.after === f.before) return [{ text: `${indent}${f.label}: nothing to fold`, dim: true }]
  return [{ text: `${indent}${f.label}'s memory folded: ${f.before} → ${f.after} messages`, color, bold: true, dim: !color }]
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
  // While main compacts, the ants refactor the mound (the conversation it measures is
  // being folded away), paced to how long it should take; once resolved, growth itself is 0.
  const mainFold = folds.find(f => f.isMain)
  const clamp = (n: number) => shape.stages.indexOf(stageOf(shape, n))
  const live = clamp(opts.growth ?? 0)

  // -- mound block --
  const mainColor = ants.find(a => a.id === mainFold?.id)?.color ?? MOUND_PALETTE.t!
  const refactor = mainFold ? refactorOf({ ...mainFold, grown: clamp(mainFold.grown ?? live) }, live, mainColor) : undefined
  const stage = refactor?.stage ?? live
  const mound = moundLines(ants, opts.tick, shape, stage, opts.dug ?? [], refactor)
  const indent = ' '.repeat(TREE_INDENT)
  const foldBlock: Line[] = folds.map(f => foldHeader(f, indent, ants.find(a => a.id === f.id)?.color))

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

    // A walking/returning (or working/building) ant with a mishap trails a marker right
    // after its own glyph, for as long as the mishap lasts.
    const mishapMark = (a: Ant): string => (a.mishap ? MISHAP_MARK[a.mishap.kind] : '')

    // A gutter ant still easing toward this row's depth is drawn climbing down the
    // shallower ancestor's trunk column instead of after the row's own full prefix.
    // Its mishap mark still trails right after its glyph here too, same as everywhere
    // else an ant with a mishap appears on a tree row.
    const climbing = gutterAnts.filter(a => a.climbDepth !== undefined && a.climbDepth < row.depth)
    const walking = gutterAnts.filter(a => !climbing.includes(a))
    const baseText = indent + steps.join('')
    const overlays = climbing.map(a => ({
      col: indent.length + steps.slice(0, a.climbDepth!).join('').length,
      glyph: antGlyph(a.breed, a.task, a.frame) + mishapMark(a),
      color: antColor(a),
    }))

    const line: Line = overlays.length > 0 ? overlayLine(baseText, overlays) : [{ text: baseText, dim: true }]
    for (const a of walking) {
      line.push({ text: antGlyph(a.breed, a.task, a.frame) + mishapMark(a) + ' ', color: antColor(a) })
    }

    if (isBuilt(row)) {
      const name = row.isDir ? row.name + '/' : row.name
      if (row.flash) {
        line.push({ text: name + ' ' + MISHAP_MARK[row.flash.kind], color: MISHAP_COLORS[row.flash.kind], bold: true })
      } else {
        const highlighted = standingAnts[0]
        line.push(
          highlighted
            ? { text: name, color: antColor(highlighted), bold: true }
            : { text: name, bold: row.isDir },
        )
      }
    }

    for (const a of standingAnts) {
      line.push({ text: ' ' + antGlyph(a.breed, a.task, a.frame) + mishapMark(a), color: antColor(a) })
      const fx = workFx(a.task, a.frame)
      if (fx) line.push({ text: fx, color: antColor(a), dim: true })
    }

    return line
  })

  // follow the main ant when it's on the tree (the camera's own ask); otherwise keep
  // the lowest ant on the tree visible, as before, so a lone busy subagent (main idle
  // at home) still stays in view. The mound and its trail always show regardless.
  let lowest = -1
  for (const rowIdx of byRow.keys()) lowest = Math.max(lowest, rowIdx)
  const rowAnchor = opts.mainRow !== undefined && opts.mainRow >= 0 ? opts.mainRow : lowest

  // -- the tree folding up while main compacts (and unfolding after) --
  const steps = Math.floor((refactor?.folded ?? 0) * foldTotal(rows))
  let visible = treeLines
  let anchor = rowAnchor
  if (steps > 0) {
    const { shown, tucked, folded } = foldTree(rows, steps, new Set(byRow.keys()))
    visible = []
    treeLines.forEach((line, i) => {
      if (i === rowAnchor) anchor = visible.length
      if (!shown[i]) return
      visible.push(tucked[i]! > 0 ? [...line, { text: ` +${tucked[i]}`, dim: true }] : line)
    })
    if (folded > 0) visible.push([{ text: `${indent}… ${folded} folded away`, dim: true }])
  }

  return orientation === 'horizontal'
    ? composeHorizontal(mound, foldBlock, legend, visible, indent, anchor, width, height, stageOf(shape, stage).mound)
    : composeVertical(mound, foldBlock, legend, visible, indent, anchor, width, height)
}
