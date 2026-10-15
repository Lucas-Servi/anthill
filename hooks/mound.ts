/**
 * The anthill: a mound of shaded blocks with a hole in its summit. Ants rise
 * out of the hole, crawl down the left flank along a dusty path and step down
 * beside the trunk onto the file tree; going home, they climb the same path
 * back up and drop into the hole.
 *
 * Pure data shared by ants.ts (how far the trail is) and render.ts (where it is).
 */

/** The mound, one string per pane line. Each cell is colored by the same cell of MOUND_MASK. */
export const MOUND: string[] = [
  '      . *  * .',
  '     .▗▄▟▄▄▙▄▖',
  '   .▗▟▓▓▒██▒▓▓▙▖',
  '  .▟▓▒▒░░░░░░▒▒▓▙',
  ' .▟▓▒░░░░░░░░░░▒▓▙',
  ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,',
  '  │',
]

/** One palette key per MOUND cell (same code-point positions; spaces stay uncolored). */
export const MOUND_MASK: string[] = [
  '      w k  k w',
  '     psssHHsss',
  '   pssddoHHoddss',
  '  psdoolllllloods',
  ' psdollllllllllods',
  ' gTTTTTTTTTTTTTTTTg',
  '  t',
]

// Claude's terracotta, from the sunlit top down to the soil.
export const MOUND_PALETTE: Record<string, string> = {
  w: '#f0eee6', // sparkle '.'
  k: '#f5c87a', // sparkle '*' and "'"
  l: '#eba98a', // light shade ░
  o: '#d97757', // Claude orange ▒
  d: '#c15f3c', // dark terracotta ▓
  s: '#a9523a', // shell, outline and the crater's raised rims
  H: '#2a1810', // the summit hole: its mouth ▄▄ and the dark well ██ below it
  T: '#6b3a2a', // soil
  g: '#7fb069', // grass tufts
  t: '#8a5a44', // trunk, right above the tree's root connectors
  p: '#8a5a44', // dust dots marking the ants' path down the flank
}

/** The line whose sparkles twinkle; it is colored by the sparkle shown, not by the mask. */
export const SPARKLE_LINE = 0

/** Columns of the tree's root connectors; the trunk '│' stands on this column. */
export const TREE_INDENT = 2

export type TrailPoint = {
  /** Mound line. */
  line: number
  /** The glyph's center column, or its left edge when `align` is 'left'. */
  col: number
  align?: 'left'
}

/** The ants' path from the bottom of the hole to just above tree row 0, in walking order. */
export const TRAIL: TrailPoint[] = [
  { line: 2, col: 10 }, // down in the dark well
  { line: 1, col: 10 }, // the hole's mouth
  { line: 1, col: 8 }, // over the left rim
  { line: 1, col: 6 }, // the summit's left shoulder
  { line: 2, col: 4 }, // down the left flank, on the outline
  { line: 3, col: 3 },
  { line: 4, col: 2 },
  { line: 5, col: 2 }, // the grass and soil corner
  { line: 6, col: TREE_INDENT + 1, align: 'left' }, // beside the trunk, above tree row 0
]

export const TRAIL_STEPS = TRAIL.length

/**
 * The first SUMMIT trail points, from the well over the summit line. Ants can't pass
 * each other there: the summit's points share one line, closer together than an ant is
 * wide. Further down each point has a line of its own.
 */
export const SUMMIT = 4

/**
 * `Ant.at` of an ant inside the hole. Trail point k is at `k - TRAIL_STEPS`
 * (-TRAIL_STEPS in the well ... -1 beside the trunk), and tree rows start at 0,
 * so walking is always +1 per tick and going home always -1.
 */
export const HOME = -(TRAIL_STEPS + 1)

/** The hole's mouth: the dark cells of the summit line. */
export const HOLE = { line: 1, start: 9, end: 10 }

/**
 * Where home ants' antennae peek out: both mouth cells, then one cell of the
 * well. The other well cell always stays dark so the hole reads as a hole.
 */
export const PEEKS: { line: number; col: number }[] = [
  { line: 1, col: 9 },
  { line: 1, col: 10 },
  { line: 2, col: 9 },
]

/**
 * A winding route through the mound's shaded body, where a busy ant's dot digs as it
 * goes (render.ts draws every cell the route has visited as dug: a passage, a chamber,
 * a root or a fungus, and the dot itself on top): clear of the trail, the peek slots, the
 * hole and the sparkle line, every step touching the last (render.test.ts checks both).
 * It ends at the body's bottom right, where a grown mound's route goes on into the hump.
 */
export const TUNNEL: { line: number; col: number }[] = [
  { line: 4, col: 3 },
  { line: 4, col: 4 },
  { line: 3, col: 4 },
  { line: 3, col: 5 },
  { line: 4, col: 5 },
  { line: 4, col: 6 },
  { line: 4, col: 7 },
  { line: 3, col: 7 },
  { line: 3, col: 6 },
  { line: 2, col: 6 },
  { line: 2, col: 7 },
  { line: 2, col: 8 },
  { line: 3, col: 8 },
  { line: 4, col: 8 },
  { line: 4, col: 9 },
  { line: 3, col: 9 },
  { line: 3, col: 10 },
  { line: 4, col: 10 },
  { line: 4, col: 11 },
  { line: 4, col: 12 },
  { line: 3, col: 12 },
  { line: 3, col: 11 },
  { line: 2, col: 11 },
  { line: 2, col: 12 },
  { line: 2, col: 13 },
  { line: 3, col: 13 },
  { line: 4, col: 13 },
  { line: 4, col: 14 },
]

/** How many busy ants can dig at once, evenly spaced so their dots never coincide. */
export const TUNNEL_SEATS = 9

/** The trail point index for an `Ant.at`, or undefined when the ant is in the hole or on the tree. */
export const trailIndex = (at: number): number | undefined =>
  at > HOME && at < 0 ? at + TRAIL_STEPS : undefined

/** First column of a glyph `width` cells wide standing on trail point `p`. */
export const glyphStart = (p: TrailPoint, width: number): number =>
  Math.max(0, p.align === 'left' ? p.col : p.col - Math.floor(width / 2))

// ---- growth: a second hump that rises beside the mound as the context window fills ----
//
// A stage only ever adds cells to the right of the base picture (plus the baseline's grass
// tuft moving out to stay at its end), so every cell the trail, peeks, hole and base tunnel
// use is the same at every stage: their fixed coordinates stay valid without repeating them
// per stage. Each stage also carries its tunnel: the base route, then (once the hump has an
// inside) a run that digs through the mound's right wall into the hump. That run only grows
// at its far end as the hump does, so a tunnel index dug at one stage means the same cell at
// every later one.

/** One cell of the mound picture. */
export type Cell = { line: number; col: number }

/** One growth stage of a mound: its picture, palette keys, and the route busy ants dig along. */
export type Stage = { mound: string[]; mask: string[]; tunnel: Cell[] }

/**
 * How far the hump reaches at one stage, all inclusive end columns (0: not there yet):
 * its foot (the bottom line, against the mound's base), its body (the line above), its
 * crown (`[from, to]` on the line above that), and dirt spilled past the foot at the end.
 */
type Hump = [foot: number, body: number, crown: [number, number] | 0, spill: string]

/** The text and palette keys of one hump line `width` cells wide. */
function humpSegment(part: 'foot' | 'body' | 'crown', width: number): [string, string] {
  if (width <= 0) return ['', '']
  if (part === 'foot') return width === 1 ? ['▖', 's'] : ['▓'.repeat(width - 1) + '▙', 'd'.repeat(width - 1) + 's']
  if (part === 'body') return width === 1 ? ['▗', 's'] : ['▟' + '▓'.repeat(width - 2) + '▙', 's' + 'd'.repeat(width - 2) + 's']
  return width < 2 ? ['', ''] : ['▗' + '▄'.repeat(width - 2) + '▖', 's'.repeat(width)]
}

/** Spilled dirt's palette keys: dust dots and clods of soil. */
const spillKeys = (spill: string): string => Array.from(spill, ch => (ch === ' ' ? ' ' : ch === '.' ? 'p' : 'T')).join('')

/** Writes `[text, keys]` onto line `i` of a stage's picture starting at `start`, padding with blanks. */
function put(mound: string[], mask: string[], i: number, start: number, [text, keys]: [string, string]) {
  const pad = Math.max(0, start - Array.from(mound[i]!).length)
  mound[i] = mound[i]! + ' '.repeat(pad) + text
  mask[i] = mask[i]! + ' '.repeat(pad) + keys
}

/** A run of tunnel cells along `line`, from column `from` to `to` inclusive (none if `to < from`). */
const run = (line: number, from: number, to: number): Cell[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => ({ line, col: from + k }))

/**
 * The vertical mound's hump, stage by stage: one step every 5% of the context window,
 * the foot first, then the body, then a crown, then dirt spilling over near the top.
 * Its foot sits on line 4 from column 18, its body on line 3 from 17, its crown on line 2.
 */
const V_HUMP: Hump[] = [
  [0, 0, 0, ''],
  [18, 0, 0, ''],
  [19, 0, 0, ''],
  [20, 0, 0, ''],
  [20, 17, 0, ''],
  [21, 17, 0, ''],
  [21, 18, 0, ''],
  [22, 18, 0, ''],
  [22, 19, 0, ''],
  [23, 19, 0, ''],
  [23, 20, 0, ''],
  [23, 20, [18, 19], ''],
  [24, 20, [18, 19], ''],
  [24, 21, [18, 19], ''],
  [24, 21, [18, 20], ''],
  [25, 21, [18, 20], ''],
  [25, 22, [18, 20], ''],
  [25, 22, [18, 21], ''],
  [25, 23, [18, 21], ''],
  [25, 23, [18, 21], ' .'],
  [25, 23, [18, 21], ' .:'],
]

function verticalStage([foot, body, crown, spill]: Hump): Stage {
  const mound = [...MOUND]
  const mask = [...MOUND_MASK]
  if (crown) put(mound, mask, 2, crown[0], humpSegment('crown', crown[1] - crown[0] + 1))
  if (body) put(mound, mask, 3, 17, humpSegment('body', body - 16))
  if (foot) put(mound, mask, 4, 18, humpSegment('foot', foot - 17))
  if (spill) put(mound, mask, 4, foot + 1, [spill, spillKeys(spill)])
  // the baseline runs on under the hump, its grass tuft moving out to stay at the end
  const end = Math.max(18, foot + 1)
  mound[5] = ' ,' + '▀'.repeat(end - 2) + ','
  mask[5] = ' g' + 'T'.repeat(end - 2) + 'g'
  // through the mound's right wall (column 17) into the hump's foot, once it has an inside
  const tunnel = foot >= 19 ? [...TUNNEL, ...run(4, 15, foot - 1)] : TUNNEL
  return { mound, mask, tunnel }
}

/** The vertical mound at every growth stage; GROWTH[0] is MOUND itself. */
export const GROWTH: Stage[] = V_HUMP.map(verticalStage)

/** How many growth stages there are (the same for both orientations). */
export const GROWTH_STAGES = GROWTH.length

/**
 * Which growth stage a context-fill fraction (0..1, or beyond — `$.session.usage()`'s
 * `percent` can exceed 100) selects, spread evenly across `stages` so each one covers
 * about a `1/stages`-sized slice of the fill. `fill` not a usable number (unmeasured yet,
 * NaN, negative) reads as stage 0 — a fresh or just-compacted session, nothing grown.
 */
export function stageFor(fill: number | undefined, stages: number): number {
  if (!(fill! > 0)) return 0
  return Math.round(Math.min(1, fill!) * (stages - 1))
}

// ---- horizontal mound: a shorter, wider redraw for a short-and-wide pane -----------
//
// Same picture, laid on its side: the hole and its one-at-a-time squeeze sit near the
// left, the shaded body widens rightward, and the trail ends beside the trunk at the
// right instead of below it, so ants crawl left-to-right instead of top-to-bottom. Kept
// to the same TRAIL_STEPS/SUMMIT/PEEKS.length/TUNNEL_SEATS as the vertical mound (see
// the "horizontal trail keeps the same shape" test in render.test.ts), so ants.ts's
// gating logic needs no changes at all for this orientation — only its geometry differs.

export const H_MOUND: string[] = [
  '  . *  * .',
  '▗▒▒▒▒▄▄▒▒▒▒▒▒▖',
  '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙',
  '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙',
  ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
]

export const H_MOUND_MASK: string[] = [
  '  w k  k w',
  'sooooHHdddddos',
  'sddddHHooooollllllllds',
  'sddddooooooollllllllds',
  'gTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
]

export const H_SPARKLE_LINE = 0

/** The ants' path from the well to beside the trunk, left to right, same shape as TRAIL. */
export const H_TRAIL: TrailPoint[] = [
  { line: 2, col: 6 }, // down in the well
  { line: 1, col: 6 }, // the hole's mouth
  { line: 1, col: 9 }, // over the rim
  { line: 1, col: 12 }, // the shoulder
  { line: 2, col: 12 }, // down onto the shaded body
  { line: 3, col: 12 },
  { line: 4, col: 16 }, // the baseline
  { line: 4, col: 21 },
  { line: 4, col: 26, align: 'left' }, // beside the trunk, right of tree row 0
]

export const H_TRAIL_STEPS = H_TRAIL.length

/** Same squeeze rule as SUMMIT, over the well/mouth/rim/shoulder instead. */
export const H_SUMMIT = SUMMIT

export const H_HOME = -(H_TRAIL_STEPS + 1)

export const H_HOLE = { line: 1, start: 5, end: 6 }

export const H_PEEKS: { line: number; col: number }[] = [
  { line: 1, col: 5 },
  { line: 1, col: 6 },
  { line: 2, col: 5 },
]

/**
 * A winding route through the left of the shaded body (the trail cuts the body in two at
 * column 12), clear of H_TRAIL/H_PEEKS/H_HOLE/the sparkle line, ending beside the trail at
 * line 3, column 11: where a grown mound's tunnel crosses it into the right half and the hump.
 */
export const H_TUNNEL: Cell[] = [
  { line: 1, col: 1 },
  { line: 1, col: 2 },
  { line: 1, col: 3 },
  { line: 1, col: 4 },
  { line: 2, col: 4 },
  { line: 2, col: 3 },
  { line: 2, col: 2 },
  { line: 2, col: 1 },
  { line: 3, col: 1 },
  { line: 3, col: 2 },
  { line: 3, col: 3 },
  { line: 3, col: 4 },
  { line: 3, col: 5 },
  { line: 3, col: 6 },
  { line: 3, col: 7 },
  { line: 2, col: 7 },
  { line: 1, col: 7 },
  { line: 1, col: 8 },
  { line: 2, col: 8 },
  { line: 2, col: 9 },
  { line: 3, col: 9 },
  { line: 3, col: 10 },
  { line: 2, col: 10 },
  { line: 1, col: 10 },
  { line: 1, col: 11 },
  { line: 2, col: 11 },
  { line: 3, col: 11 },
]

export const H_TUNNEL_SEATS = TUNNEL_SEATS

/**
 * The horizontal mound's hump, stage by stage, as V_HUMP: its foot on line 3 and its body
 * on line 2, both from column 22, its crown on line 1; it stays above the baseline (which
 * ends at column 28), so only the spilled dirt ever reaches past the base picture.
 */
const H_HUMP: Hump[] = [
  [0, 0, 0, ''],
  [22, 0, 0, ''],
  [23, 0, 0, ''],
  [24, 0, 0, ''],
  [24, 22, 0, ''],
  [25, 22, 0, ''],
  [25, 23, 0, ''],
  [26, 23, 0, ''],
  [26, 24, 0, ''],
  [27, 24, 0, ''],
  [27, 25, 0, ''],
  [27, 25, [23, 24], ''],
  [28, 25, [23, 24], ''],
  [28, 26, [23, 24], ''],
  [28, 26, [23, 25], ''],
  [28, 27, [23, 25], ''],
  [28, 27, [24, 26], ''],
  [28, 27, [24, 26], ' .'],
  [28, 27, [24, 26], ' .:'],
  [28, 27, [24, 26], ' .:.'],
  [28, 27, [24, 26], ' .:.:'],
]

function horizontalStage([foot, body, crown, spill]: Hump): Stage {
  const mound = [...H_MOUND]
  const mask = [...H_MOUND_MASK]
  if (crown) put(mound, mask, 1, crown[0], humpSegment('crown', crown[1] - crown[0] + 1))
  if (body) put(mound, mask, 2, 22, humpSegment('body', body - 21))
  if (foot) put(mound, mask, 3, 22, humpSegment('foot', foot - 21))
  if (spill) put(mound, mask, 3, foot + 1, [spill, spillKeys(spill)])
  // across the trail (line 3, column 12) and the body's right half, through its right wall
  // (column 21) into the hump's foot, once it has an inside
  const tunnel = foot >= 23 ? [...H_TUNNEL, ...run(3, 12, foot - 1)] : H_TUNNEL
  return { mound, mask, tunnel }
}

/** The horizontal mound at every growth stage; H_GROWTH[0] is H_MOUND itself. */
export const H_GROWTH: Stage[] = H_HUMP.map(horizontalStage)

/**
 * Where the colony's workers haul dirt while main's conversation is compacted (the ants
 * refactor the anthill: the hump comes down, the mound is packed tighter): from the hump's
 * side up toward the hole, as the left column of a worker drawn two cells wide ('▪o', a
 * clod carried ahead of its ant). Clear of the hole and its peek slots.
 */
export const HAUL: Cell[] = [
  { line: 4, col: 16 },
  { line: 3, col: 15 },
  { line: 2, col: 14 },
  { line: 1, col: 12 },
  { line: 1, col: 11 },
]

/** HAUL for the horizontal mound: along the body's right half, then over the shoulder to the hole. */
export const H_HAUL: Cell[] = [
  { line: 2, col: 19 },
  { line: 2, col: 18 },
  { line: 2, col: 17 },
  { line: 2, col: 16 },
  { line: 2, col: 15 },
  { line: 2, col: 14 },
  { line: 2, col: 13 },
  { line: 1, col: 11 },
  { line: 1, col: 10 },
  { line: 1, col: 8 },
  { line: 1, col: 7 },
]

/** Which mound a pane draws: the usual tall one, or the short, wide one. */
export type Orientation = 'vertical' | 'horizontal'

/** Everything render.ts needs to draw one mound, gathered so it doesn't branch on orientation itself. */
export type MoundShape = {
  mound: string[]
  mask: string[]
  /** The mound as it grows with the context window; stages[0] is mound/mask and the base tunnel. */
  stages: Stage[]
  sparkleLine: number
  trail: TrailPoint[]
  trailSteps: number
  summit: number
  home: number
  hole: { line: number; start: number; end: number }
  peeks: { line: number; col: number }[]
  /** The base tunnel route; a grown stage's own route (stages[n].tunnel) extends it. */
  tunnel: Cell[]
  tunnelSeats: number
  /** Where workers haul the hump away while main compacts (see HAUL). */
  haul: Cell[]
}

export const SHAPES: Record<Orientation, MoundShape> = {
  vertical: {
    mound: MOUND,
    mask: MOUND_MASK,
    stages: GROWTH,
    sparkleLine: SPARKLE_LINE,
    trail: TRAIL,
    trailSteps: TRAIL_STEPS,
    summit: SUMMIT,
    home: HOME,
    hole: HOLE,
    peeks: PEEKS,
    tunnel: TUNNEL,
    tunnelSeats: TUNNEL_SEATS,
    haul: HAUL,
  },
  horizontal: {
    mound: H_MOUND,
    mask: H_MOUND_MASK,
    stages: H_GROWTH,
    sparkleLine: H_SPARKLE_LINE,
    trail: H_TRAIL,
    trailSteps: H_TRAIL_STEPS,
    summit: H_SUMMIT,
    home: H_HOME,
    hole: H_HOLE,
    peeks: H_PEEKS,
    tunnel: H_TUNNEL,
    tunnelSeats: H_TUNNEL_SEATS,
    haul: H_HAUL,
  },
}

/** `shape` at growth stage `stage`, clamped into range (a bad stage reads as the nearest real one). */
export const stageOf = (shape: MoundShape, stage: number): Stage =>
  shape.stages[Math.max(0, Math.min(shape.stages.length - 1, Math.round(stage) || 0))]!

/** trailIndex(at), generalized to either shape. */
export const trailIndexFor = (shape: MoundShape, at: number): number | undefined =>
  at > shape.home && at < 0 ? at + shape.trailSteps : undefined
