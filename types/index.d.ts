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

export type Task = 'home' | 'walking' | 'working' | 'building' | 'returning'

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
  /** Remove the ant once it is back home (its subagent finished). */
  leaving?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    anthill: {
      rows: Row[]
      ants: Ant[]
      /** Global animation tick. */
      tick: number
    }
  }
}
