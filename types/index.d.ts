/** Which ant body an agent gets, from the model it runs on. */
export type Breed = 'haiku' | 'sonnet' | 'opus' | 'fable' | 'other'

/** One visible line of the file tree, in display order (pre-order, dirs first). */
export type Row = {
  /** Path relative to the session's cwd, `/`-separated, no leading `./`. */
  path: string
  name: string
  /** 0 for entries directly under the cwd. */
  depth: number
  isDir: boolean
  /** Whether this dir's children have been listed into `rows`. */
  isOpen?: boolean
  /**
   * For a file an ant is creating: how much of its branch is built, 0..BUILD_STEPS.
   * Absent once complete (or for rows that already existed).
   */
  built?: number
}

export type Task = 'home' | 'walking' | 'working' | 'building' | 'returning' | 'busy'

/** One piece of work: a tool call on a path. */
export type Job = {
  /** The tool_use_id. */
  id: string
  path: string
  kind: 'work' | 'build'
}

export type Ant = {
  /** Agent id; `main` for the main loop. */
  id: string
  /** Shown in the legend: `main`, or the subagent's type/description. */
  label: string
  breed: Breed
  color: string
  /**
   * Where the ant is (see hooks/mound.ts). `>= 0`: the tree row it stands on.
   * `-TRAIL_STEPS .. -1`: on the trail down the anthill, trail point `at + TRAIL_STEPS`
   * (`-TRAIL_STEPS` just out of the summit hole, `-1` just above tree row 0).
   * `HOME` (`-(TRAIL_STEPS + 1)`): inside the hole.
   */
  at: number
  task: Task
  /** The job being walked to / worked on. */
  job?: Job
  /** Jobs waiting behind `job`. */
  queue: Job[]
  /** Ids of jobs whose tool call has already finished. */
  doneIds: string[]
  /** Animation frame counter, increments every step. */
  frame: number
  /** Which of the hole's peek slots (mound.ts PEEKS) its antennae hold while it is in the hole. */
  peek?: number
  /** Which of the mound's tunnel seats (mound.ts TUNNEL) its dot holds while `task` is `'busy'`. */
  busySeat?: number
  /**
   * While walking/returning between tree rows of different `depth`: how deep (in
   * ancestor-depth units) its glyph is currently drawn, easing by at most one level a
   * tick toward the row it is actually at. Absent once it catches up (the common
   * case) or while off the tree — purely a rendering offset, never read by step()'s
   * own at/task logic.
   */
  climbDepth?: number
  /** Remove the ant once it is back home (its subagent finished). */
  leaving?: boolean
}

/**
 * One conversation being compacted, shown as the tree folding instead of its
 * real rows for as long as it runs; `rows` itself is never touched by this.
 */
export type Fold = {
  /** Whose conversation: an ant id, `main` included. */
  id: string
  /** The ant's label when compaction began, shown in the fold's header. */
  label: string
  /** Message count before compaction. */
  before: number
  /** Message count after; absent while compaction still runs. */
  after?: number
  /** Animation frame, advanced by the same tick loop that steps the ants. */
  frame: number
  /** Ticks left to show the "(summarized ... )" row before it disappears. */
  settle?: number
}

/**
 * A tunnel cell some busy ant's dot has dug through: its index along the route
 * (mound.ts TUNNEL/H_TUNNEL, or a grown stage's longer route), and the tick it was dug at,
 * so what grows there (a fungus, say) can age.
 */
export type Dug = { i: number; at: number }

/** Where the anthill is drawn: the usual docked/inline pane, or the strip above the prompt. */
export type Layout = 'side' | 'strip'

declare module 'claude-code' {
  interface PluginState {
    anthill: {
      rows: Row[]
      ants: Ant[]
      /** Global animation tick. */
      tick: number
      folds: Fold[]
      /** Which layout the person last chose; restored to $.store too, so it outlives the session. */
      layout: Layout
      /** The mound's growth stage: how full the context window was, last measured. */
      growth: number
      /** Tunnel cells some busy ant has already dug through. */
      dug: Dug[]
    }
  }
}
