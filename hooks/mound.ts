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
 * goes (render.ts paints every cell the route has visited as dug tunnel, and the dot
 * itself on top): clear of the trail, the peek slots, the hole and the sparkle line
 * (verified against MOUND/MOUND_MASK directly, and that consecutive points are always
 * adjacent). Kept the same length as H_TUNNEL so a seat's position along either means
 * the same thing in both orientations.
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
export const TUNNEL_SEATS = 6

/** The trail point index for an `Ant.at`, or undefined when the ant is in the hole or on the tree. */
export const trailIndex = (at: number): number | undefined =>
  at > HOME && at < 0 ? at + TRAIL_STEPS : undefined

/** First column of a glyph `width` cells wide standing on trail point `p`. */
export const glyphStart = (p: TrailPoint, width: number): number =>
  Math.max(0, p.align === 'left' ? p.col : p.col - Math.floor(width / 2))

/**
 * How the mound grows as the context window fills, each stage a strict extension of the
 * last: every stage's lines only ever gain characters appended past the previous stage's
 * (never rewriting a cell), so the trail, peeks, hole and tunnel — all addressed by fixed
 * `line`/`col` coordinates against stage 0 — stay valid at every stage without having to
 * repeat them per stage. Stage 0 is MOUND/MOUND_MASK themselves, kept as the first entry
 * so `shape.stages[shape.stages.length - 1]` and `shape.stages[0]` both always exist.
 */
export const GROWTH: { mound: string[]; mask: string[] }[] = [
  { mound: MOUND, mask: MOUND_MASK },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssds',
      '   pssddoHHoddssdss',
      '  psdoolllllloodsds',
      ' psdollllllllllodsds',
      ' gTTTTTTTTTTTTTTTTgTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdds',
      '   pssddoHHoddssddss',
      '  psdoolllllloodsdds',
      ' psdollllllllllodsdds',
      ' gTTTTTTTTTTTTTTTTgTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddds',
      '   pssddoHHoddssdddss',
      '  psdoolllllloodsddds',
      ' psdollllllllllodsddds',
      ' gTTTTTTTTTTTTTTTTgTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddds',
      '   pssddoHHoddssddddss',
      '  psdoolllllloodsdddds',
      ' psdollllllllllodsdddds',
      ' gTTTTTTTTTTTTTTTTgTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddds',
      '   pssddoHHoddssdddddss',
      '  psdoolllllloodsddddds',
      ' psdollllllllllodsddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddds',
      '   pssddoHHoddssddddddss',
      '  psdoolllllloodsdddddds',
      ' psdollllllllllodsdddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddds',
      '   pssddoHHoddssdddddddss',
      '  psdoolllllloodsddddddds',
      ' psdollllllllllodsddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddds',
      '   pssddoHHoddssddddddddss',
      '  psdoolllllloodsdddddddds',
      ' psdollllllllllodsdddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddddds',
      '   pssddoHHoddssdddddddddss',
      '  psdoolllllloodsddddddddds',
      ' psdollllllllllodsddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddddds',
      '   pssddoHHoddssddddddddddss',
      '  psdoolllllloodsdddddddddds',
      ' psdollllllllllodsdddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddddddds',
      '   pssddoHHoddssdddddddddddss',
      '  psdoolllllloodsddddddddddds',
      ' psdollllllllllodsddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddddddds',
      '   pssddoHHoddssddddddddddddss',
      '  psdoolllllloodsdddddddddddds',
      ' psdollllllllllodsdddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddddddddds',
      '   pssddoHHoddssdddddddddddddss',
      '  psdoolllllloodsddddddddddddds',
      ' psdollllllllllodsddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddddddddds',
      '   pssddoHHoddssddddddddddddddss',
      '  psdoolllllloodsdddddddddddddds',
      ' psdollllllllllodsdddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddddddddddds',
      '   pssddoHHoddssdddddddddddddddss',
      '  psdoolllllloodsddddddddddddddds',
      ' psdollllllllllodsddddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddddddddddds',
      '   pssddoHHoddssddddddddddddddddss',
      '  psdoolllllloodsdddddddddddddddds',
      ' psdollllllllllodsdddddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddddddddddddds',
      '   pssddoHHoddssdddddddddddddddddss',
      '  psdoolllllloodsddddddddddddddddds',
      ' psdollllllllllodsddddddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddddddddddddds',
      '   pssddoHHoddssddddddddddddddddddss',
      '  psdoolllllloodsdddddddddddddddddds',
      ' psdollllllllllodsdddddddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssddddddddddddddddddds',
      '   pssddoHHoddssdddddddddddddddddddss',
      '  psdoolllllloodsddddddddddddddddddds',
      ' psdollllllllllodsddddddddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
  {
    mound: [
      '      . *  * .',
      '     .▗▄▟▄▄▙▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '   .▗▟▓▓▒██▒▓▓▙▖▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '  .▟▓▒▒░░░░░░▒▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙ .:',
      ' .▟▓▒░░░░░░░░░░▒▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ' ,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀,▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
      '  │',
    ],
    mask: [
      '      w k  k w',
      '     psssHHsssdddddddddddddddddddds',
      '   pssddoHHoddssddddddddddddddddddddss',
      '  psdoolllllloodsdddddddddddddddddddds wk',
      ' psdollllllllllodsdddddddddddddddddddds',
      ' gTTTTTTTTTTTTTTTTgTTTTTTTTTTTTTTTTTTTTTTT',
      '  t',
    ],
  },
]

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
 * Clear of H_TRAIL/H_PEEKS/H_HOLE/the sparkle line, winding through the shaded body's
 * three lines. Same length as TUNNEL (see above).
 */
export const H_TUNNEL: { line: number; col: number }[] = [
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
  { line: 3, col: 8 },
  { line: 3, col: 9 },
  { line: 3, col: 10 },
  { line: 3, col: 11 },
  { line: 2, col: 11 },
  { line: 1, col: 11 },
  { line: 1, col: 10 },
  { line: 2, col: 10 },
  { line: 2, col: 9 },
  { line: 2, col: 8 },
  { line: 2, col: 7 },
  { line: 1, col: 7 },
  { line: 1, col: 8 },
]

export const H_TUNNEL_SEATS = TUNNEL_SEATS

/** TUNNEL and H_TUNNEL are kept the same length, so a dug index means the same thing in either. */
export const TUNNEL_LENGTH = TUNNEL.length

/** H_MOUND/H_MOUND_MASK's growth stages — see GROWTH's own doc comment. */
export const H_GROWTH: { mound: string[]; mask: string[] }[] = [
  { mound: H_MOUND, mask: H_MOUND_MASK },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosds',
      'sddddHHooooolllllllldsdss',
      'sddddooooooolllllllldsds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdds',
      'sddddHHooooolllllllldsddss',
      'sddddooooooolllllllldsdds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddds',
      'sddddHHooooolllllllldsdddss',
      'sddddooooooolllllllldsddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddds',
      'sddddHHooooolllllllldsddddss',
      'sddddooooooolllllllldsdddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddds',
      'sddddHHooooolllllllldsdddddss',
      'sddddooooooolllllllldsddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddds',
      'sddddHHooooolllllllldsddddddss',
      'sddddooooooolllllllldsdddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddds',
      'sddddHHooooolllllllldsdddddddss',
      'sddddooooooolllllllldsddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddds',
      'sddddHHooooolllllllldsddddddddss',
      'sddddooooooolllllllldsdddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddddds',
      'sddddHHooooolllllllldsdddddddddss',
      'sddddooooooolllllllldsddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddddds',
      'sddddHHooooolllllllldsddddddddddss',
      'sddddooooooolllllllldsdddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddddddds',
      'sddddHHooooolllllllldsdddddddddddss',
      'sddddooooooolllllllldsddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddddddds',
      'sddddHHooooolllllllldsddddddddddddss',
      'sddddooooooolllllllldsdddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddddddddds',
      'sddddHHooooolllllllldsdddddddddddddss',
      'sddddooooooolllllllldsddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddddddddds',
      'sddddHHooooolllllllldsddddddddddddddss',
      'sddddooooooolllllllldsdddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddddddddddds',
      'sddddHHooooolllllllldsdddddddddddddddss',
      'sddddooooooolllllllldsddddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddddddddddds',
      'sddddHHooooolllllllldsddddddddddddddddss',
      'sddddooooooolllllllldsdddddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddddddddddddds',
      'sddddHHooooolllllllldsdddddddddddddddddss',
      'sddddooooooolllllllldsddddddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddddddddddddds',
      'sddddHHooooolllllllldsddddddddddddddddddss',
      'sddddooooooolllllllldsdddddddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosddddddddddddddddddds',
      'sddddHHooooolllllllldsdddddddddddddddddddss',
      'sddddooooooolllllllldsddddddddddddddddddds',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
  {
    mound: [
      '  . *  * .',
      '▗▒▒▒▒▄▄▒▒▒▒▒▒▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖',
      '▟▓▓▓▓▄▄▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙▖',
      '▟▓▓▓▓▒▒▒▒▒▒▒░░░░░░░░▓▙▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▙ .:',
      ',▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀│,',
    ],
    mask: [
      '  w k  k w',
      'sooooHHdddddosdddddddddddddddddddds',
      'sddddHHooooolllllllldsddddddddddddddddddddss',
      'sddddooooooolllllllldsdddddddddddddddddddds wk',
      'gTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTtg',
    ],
  },
]

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

/** Which mound a pane draws: the usual tall one, or the short, wide one. */
export type Orientation = 'vertical' | 'horizontal'

/** Everything render.ts needs to draw one mound, gathered so it doesn't branch on orientation itself. */
export type MoundShape = {
  mound: string[]
  mask: string[]
  /** mound/mask as they grow with the context window; stages[0] is mound/mask themselves. */
  stages: { mound: string[]; mask: string[] }[]
  sparkleLine: number
  trail: TrailPoint[]
  trailSteps: number
  summit: number
  home: number
  hole: { line: number; start: number; end: number }
  peeks: { line: number; col: number }[]
  tunnel: { line: number; col: number }[]
  tunnelSeats: number
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
  },
}

/** trailIndex(at), generalized to either shape. */
export const trailIndexFor = (shape: MoundShape, at: number): number | undefined =>
  at > shape.home && at < 0 ? at + shape.trailSteps : undefined
