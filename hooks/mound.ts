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
 * A small loop inside the mound's shaded body, where a busy ant's dot orbits
 * while it has no file to point to: clear of the trail, the peek slots, the
 * hole and the sparkle line (verified against MOUND/MOUND_MASK directly).
 */
export const ORBIT: { line: number; col: number }[] = [
  { line: 3, col: 7 },
  { line: 3, col: 8 },
  { line: 3, col: 9 },
  { line: 3, col: 10 },
  { line: 3, col: 11 },
  { line: 3, col: 12 },
  { line: 4, col: 12 },
  { line: 4, col: 11 },
  { line: 4, col: 10 },
  { line: 4, col: 9 },
  { line: 4, col: 8 },
  { line: 4, col: 7 },
]

/** How many busy ants can orbit at once, evenly spaced so their dots never coincide. */
export const ORBIT_SEATS = 6

/** The trail point index for an `Ant.at`, or undefined when the ant is in the hole or on the tree. */
export const trailIndex = (at: number): number | undefined =>
  at > HOME && at < 0 ? at + TRAIL_STEPS : undefined

/** First column of a glyph `width` cells wide standing on trail point `p`. */
export const glyphStart = (p: TrailPoint, width: number): number =>
  Math.max(0, p.align === 'left' ? p.col : p.col - Math.floor(width / 2))

// ---- horizontal mound: a shorter, wider redraw for a short-and-wide pane -----------
//
// Same picture, laid on its side: the hole and its one-at-a-time squeeze sit near the
// left, the shaded body widens rightward, and the trail ends beside the trunk at the
// right instead of below it, so ants crawl left-to-right instead of top-to-bottom. Kept
// to the same TRAIL_STEPS/SUMMIT/PEEKS.length/ORBIT_SEATS as the vertical mound (see
// MOUND is a small block / mound.ts tests), so ants.ts's gating logic needs no changes
// at all for this orientation — only its geometry (line/col) differs.

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

/** Clear of H_TRAIL/H_PEEKS/H_HOLE/the sparkle line, on the shaded body's two middle lines. */
export const H_ORBIT: { line: number; col: number }[] = [
  { line: 2, col: 14 },
  { line: 2, col: 15 },
  { line: 2, col: 16 },
  { line: 2, col: 17 },
  { line: 2, col: 18 },
  { line: 2, col: 19 },
  { line: 3, col: 19 },
  { line: 3, col: 18 },
  { line: 3, col: 17 },
  { line: 3, col: 16 },
  { line: 3, col: 15 },
  { line: 3, col: 14 },
]

export const H_ORBIT_SEATS = ORBIT_SEATS

/** Which mound a pane draws: the usual tall one, or the short, wide one. */
export type Orientation = 'vertical' | 'horizontal'

/** Everything render.ts needs to draw one mound, gathered so it doesn't branch on orientation itself. */
export type MoundShape = {
  mound: string[]
  mask: string[]
  sparkleLine: number
  trail: TrailPoint[]
  trailSteps: number
  summit: number
  home: number
  hole: { line: number; start: number; end: number }
  peeks: { line: number; col: number }[]
  orbit: { line: number; col: number }[]
  orbitSeats: number
}

export const SHAPES: Record<Orientation, MoundShape> = {
  vertical: {
    mound: MOUND,
    mask: MOUND_MASK,
    sparkleLine: SPARKLE_LINE,
    trail: TRAIL,
    trailSteps: TRAIL_STEPS,
    summit: SUMMIT,
    home: HOME,
    hole: HOLE,
    peeks: PEEKS,
    orbit: ORBIT,
    orbitSeats: ORBIT_SEATS,
  },
  horizontal: {
    mound: H_MOUND,
    mask: H_MOUND_MASK,
    sparkleLine: H_SPARKLE_LINE,
    trail: H_TRAIL,
    trailSteps: H_TRAIL_STEPS,
    summit: H_SUMMIT,
    home: H_HOME,
    hole: H_HOLE,
    peeks: H_PEEKS,
    orbit: H_ORBIT,
    orbitSeats: H_ORBIT_SEATS,
  },
}

/** trailIndex(at), generalized to either shape. */
export const trailIndexFor = (shape: MoundShape, at: number): number | undefined =>
  at > shape.home && at < 0 ? at + shape.trailSteps : undefined
