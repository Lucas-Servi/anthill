import type { Ant, Breed, Dug, Job, Row } from '../types'
import { HOME, PEEKS, SUMMIT, TUNNEL_SEATS } from './mound'
import { BUILD_STEPS, indexOf } from './tree'

export { HOME, TRAIL_STEPS } from './mound'

/** How many ticks a working ant lingers after arriving to a job already finished. */
const WORK_BURST = 6

/**
 * A walking ant leaves the hole only when no other ant is on the first GATE
 * trail points, so ants sent out on the same tick crawl out in a queue instead
 * of on top of one another.
 */
const GATE = 3

export function breedOf(model: string | undefined): Breed {
  if (!model) return 'other'
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('opus')) return 'opus'
  if (m.includes('fable')) return 'fable'
  return 'other'
}

export const PALETTE: string[] = [
  '#ff5f5f', // red (main ant)
  '#5fff5f', // green
  '#ffff5f', // yellow
  '#5f87ff', // blue
  '#ff5fff', // magenta
  '#5fffff', // cyan
  '#ff8700', // orange
  '#ff87af', // pink
]

export function colorFor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]!
}

export function newAnt(id: string, label: string, breed: Breed, color: string): Ant {
  return { id, label, breed, color, at: HOME, task: 'home', queue: [], doneIds: [], frame: 0 }
}

/** Drops `leaving`: a retired ant given new work is staying after all. */
function unretire(ant: Ant): Ant {
  if (!ant.leaving) return ant
  const { leaving, ...rest } = ant
  return rest
}

export function assign(ant: Ant, job: Job): Ant {
  // A home or busy ant sets out from the hole at once (a file job always beats the
  // generic busy-dot; this also fixes ants saved with an older home `at`); a returning
  // one turns around wherever it is. Either way, a resumed subagent's ant (retired,
  // then given more work before the tick that would have removed it) stays for good.
  if (ant.task === 'home' || ant.task === 'busy') {
    const { busySeat, ...rest } = unretire(ant)
    return { ...rest, at: HOME, job, task: 'walking' }
  }
  if (ant.task === 'returning') return { ...unretire(ant), job, task: 'walking' }
  return { ...ant, queue: [...ant.queue, job] }
}

/** Whether `a`'s dot digs the mound body: busy, with no file job to point to. */
export const isBusy = (a: Ant): boolean => a.task === 'busy'

/** Marks a home ant busy (its loop is doing something with no file to point to); a no-op otherwise. */
export function markBusy(ant: Ant): Ant {
  return ant.task === 'home' ? unretire({ ...ant, task: 'busy' }) : ant
}

/** Reverts a busy ant to resting at home, dropping its tunnel seat; a no-op otherwise. */
export function clearBusy(ant: Ant): Ant {
  if (ant.task !== 'busy') return ant
  const { busySeat, ...rest } = ant
  return { ...rest, task: 'home' }
}

/** How far along the length-`length` tunnel a step count has traveled, bouncing at both ends. */
function bounceAt(pos: number, length: number): number {
  if (length <= 1) return 0
  const period = 2 * (length - 1)
  const m = ((pos % period) + period) % period
  return m <= length - 1 ? m : period - m
}

/**
 * The index into TUNNEL/H_TUNNEL (both `length` cells) a busy ant's dot currently sits
 * on: its seat starts spaced evenly along the route, even seats heading one way and odd
 * seats the other, odd seats at full speed and even at half, each bouncing at the ends
 * rather than looping — a more varied crawl than a simple shared loop, and (seatOrbits
 * below keeping each seat held) never two dots on the same cell apart from a bounce.
 */
export function tunnelIndex(ant: Ant, length: number): number | undefined {
  if (ant.busySeat === undefined || length <= 0) return undefined
  const spacing = Math.floor(length / TUNNEL_SEATS)
  const start = ant.busySeat * spacing
  const forward = ant.busySeat % 2 === 0
  const steps = forward ? Math.floor(ant.frame / 2) : ant.frame
  return bounceAt(start + (forward ? steps : -steps), length)
}

/**
 * Seats busy ants on the tunnel exactly as seatPeeks seats home ants on PEEKS: a seat
 * held for as long as the ant stays busy, so one leaving never makes another's dot jump.
 */
export function seatOrbits(ants: Ant[]): Ant[] {
  const held = new Set<number>()
  const kept = ants.map((a): Ant => {
    if (a.busySeat === undefined) return a
    if (isBusy(a) && a.busySeat < TUNNEL_SEATS && !held.has(a.busySeat)) {
      held.add(a.busySeat)
      return a
    }
    const { busySeat, ...rest } = a
    return rest
  })
  return kept.map((a): Ant => {
    if (a.busySeat !== undefined || !isBusy(a)) return a
    for (let seat = 0; seat < TUNNEL_SEATS; seat++) {
      if (held.has(seat)) continue
      held.add(seat)
      return { ...a, busySeat: seat }
    }
    return a // more busy ants than seats (TUNNEL_SEATS): stays undotted rather than overlapping
  })
}

/**
 * Every tunnel cell a busy ant currently sits on, added to `dug` at tick `tick` (sorted by
 * index; a cell dug before keeps the tick it was first dug at, so what grows there ages).
 */
export function dig(dug: Dug[], ants: Ant[], length: number, tick: number): Dug[] {
  const byIndex = new Map(dug.map(d => [d.i, d] as const))
  for (const a of ants) {
    const i = tunnelIndex(a, length)
    if (i !== undefined && !byIndex.has(i)) byIndex.set(i, { i, at: tick })
  }
  if (byIndex.size === dug.length) return dug
  return [...byIndex.values()].sort((x, y) => x.i - y.i)
}

/** Clears `climbDepth` outright: the ant is standing on its row, not transiting. */
function clearClimb(ant: Ant): Ant {
  if (ant.climbDepth === undefined) return ant
  const { climbDepth, ...rest } = ant
  return rest
}

/**
 * Shows a walking ant climbing down the branch for the one tick it steps into a more
 * deeply nested row: its glyph is drawn at the shallower depth it came from (an
 * ancestor's trunk column) instead of its new row's own column, landing there the very
 * next tick (no added delay — `at` has already moved; this only lags the drawing by
 * one frame). Only meaningful going deeper: a sideways or shallower move has no
 * further-out ancestor column to lag at, so it clears instead. Purely a rendering
 * side-channel for render.ts — never consulted by `at`/`task` logic.
 */
function climbInto(ant: Ant, fromDepth: number, toDepth: number): Ant {
  return fromDepth < toDepth ? { ...ant, climbDepth: fromDepth } : clearClimb(ant)
}

/** Pulls the next queued job into `job`, or heads the ant home. */
function advanceToNext(ant: Ant): Ant {
  const [next, ...rest] = ant.queue
  if (next) return { ...ant, job: next, queue: rest, task: 'walking' }
  return { ...ant, job: undefined, task: 'returning' }
}

/** Remembers that a job's tool call is over, so the ant moves on as soon as it is done there. */
function markDone(ant: Ant, jobId: string): Ant {
  if (ant.doneIds.includes(jobId)) return ant
  return { ...ant, doneIds: [...ant.doneIds, jobId] }
}

export function finish(ant: Ant, jobId: string): Ant {
  if (ant.job?.id !== jobId) {
    // Not the current job. A queued branch is still built (the new file is on the tree,
    // waiting for it), then the ant moves on at once; other queued work that's over is dropped.
    if (ant.queue.some((j) => j.id === jobId && j.kind === 'build')) return markDone(ant, jobId)
    return { ...ant, queue: ant.queue.filter((j) => j.id !== jobId) }
  }
  if (ant.task === 'working') return advanceToNext(ant)
  // building or still walking: can't leave yet, just remember it's done
  return markDone(ant, jobId)
}

export function retire(ant: Ant): Ant {
  return { ...ant, leaving: true }
}

function setBuilt(rows: Row[], index: number, built: number): Row[] {
  return rows.map((r, i) => (i === index ? { ...r, built } : r))
}

/** The row with its branch complete. */
function completed(row: Row): Row {
  const { built, ...rest } = row
  return rest
}

function clearBuilt(rows: Row[], index: number): Row[] {
  return rows.map((r, i) => (i === index ? completed(r) : r))
}

/** Whether `at` is a point of the trail down the anthill (not the hole, not the tree). */
const onTrail = (at: number): boolean => at > HOME && at < 0

// Ants can't pass each other on the SUMMIT points (see mound.ts), so the summit is
// one way at a time: ants going out wait in the hole while one climbs home over it, and
// ants climbing home wait right below it while one comes down. They pass on the flank.

/** Whether `at` is one of the SUMMIT points, the well and the summit line. */
const onSummit = (at: number): boolean => at > HOME && at <= HOME + SUMMIT

/** Whether `at` is on the summit line: the SUMMIT points but the well. */
const onSummitLine = (at: number): boolean => at > HOME + 1 && at <= HOME + SUMMIT

/** `Ant.at` of the flank point right below the summit. */
const BELOW_SUMMIT = HOME + SUMMIT + 1

/**
 * Whether an ant going out may leave the hole: at most one leaves per tick, onto a
 * clear trail, and not while an ant climbing home is on the summit or about to be.
 */
const gateOpen = (ants: Ant[]): boolean =>
  !ants.some(
    (a) => (a.at > HOME && a.at <= HOME + GATE) || (a.task === 'returning' && a.at > HOME && a.at <= BELOW_SUMMIT),
  )

/**
 * Whether an ant going out at `at`, on the summit, turns back into the hole: it was sent
 * out again right in front of an ant climbing home there, which has to get in first.
 */
const turnsBack = (ants: Ant[], at: number): boolean =>
  onSummit(at) && ants.some((a) => a.task === 'returning' && a.at > at && onSummit(a.at))

/**
 * Whether an ant climbing home from `at` waits a tick: right below the summit while an
 * ant comes down over it, and on the summit line while another ant climbing is less than
 * two points ahead (glyphs on neighbouring points there would overlap). It never blocks
 * one coming down right in front of it, though: the two pass, and any ant behind that
 * one turns back.
 */
function holdsBack(ants: Ant[], at: number): boolean {
  const next = at - 1
  if (!onSummit(next) || ants.some((a) => a.task === 'walking' && a.at === next)) return false
  if (at === BELOW_SUMMIT && ants.some((a) => a.task === 'walking' && a.at > HOME && a.at < next)) return true
  // an ant now at `next` only gets as far as next - 1, right beside it
  return (
    onSummitLine(next) &&
    onSummitLine(next - 1) &&
    ants.some((a) => a.task === 'returning' && (a.at === next || a.at === next - 1))
  )
}

export function step(given: Ant[], rows: Row[]): { ants: Ant[]; rows: Row[] } {
  // seat ants still in the hole (or orbiting it) before any leaves, so the rest keep the seats they're drawn in
  const ants = seatOrbits(seatPeeks(given))
  let nextRows = rows
  const nextAnts: Ant[] = []
  /** Where each of nextAnts stood before this tick. */
  const from: number[] = []
  let canLeave = gateOpen(ants)

  for (const prev of ants) {
    let ant: Ant = { ...prev, frame: prev.frame + 1 }
    if (ant.at >= nextRows.length) ant.at = nextRows.length - 1
    if (ant.at < HOME) ant.at = HOME
    const start = ant.at
    const keep = (a: Ant) => {
      nextAnts.push(a)
      from.push(start)
    }

    if (ant.task === 'home') {
      if (ant.leaving) continue // removed
      keep(ant)
      continue
    }

    if (ant.task === 'busy') {
      // orbiting the mound body, not on the trail or the tree: nothing to move,
      // just keep it (its dot's position is derived from `frame`, already advanced above)
      keep(ant)
      continue
    }

    if (ant.task === 'walking') {
      if (!ant.job) {
        keep({ ...ant, task: 'returning' })
        continue
      }
      const target = indexOf(nextRows, ant.job.path)
      if (target === -1) {
        keep({ ...ant, task: 'returning', job: undefined })
        continue
      }
      if (ant.at === target) {
        if (ant.job.kind === 'build') {
          ant = { ...ant, task: 'building', frame: 0 }
          if (nextRows[target]!.built === undefined) nextRows = setBuilt(nextRows, target, 0)
        } else {
          ant = { ...ant, task: 'working', frame: 0 }
        }
        // arrived: standing on the row now, not transiting between depths
        ant = clearClimb(ant)
      } else if (ant.at === HOME && !canLeave) {
        // wait in the hole until the way is clear
      } else if (turnsBack(ants, ant.at)) {
        ant = { ...ant, at: ant.at - 1 }
      } else {
        if (ant.at === HOME) canLeave = false
        const fromDepth = ant.at >= 0 ? nextRows[ant.at]!.depth : undefined
        const dir = target > ant.at ? 1 : -1
        ant = { ...ant, at: ant.at + dir }
        ant = ant.at >= 0 && fromDepth !== undefined ? climbInto(ant, fromDepth, nextRows[ant.at]!.depth) : clearClimb(ant)
      }
      keep(ant)
      continue
    }

    if (ant.task === 'working') {
      if (ant.job && ant.doneIds.includes(ant.job.id) && ant.frame >= WORK_BURST) {
        ant = advanceToNext(ant)
      }
      keep(ant)
      continue
    }

    if (ant.task === 'building') {
      if (!ant.job) {
        keep({ ...ant, task: 'returning' })
        continue
      }
      const target = indexOf(nextRows, ant.job.path)
      if (target === -1) {
        keep({ ...ant, task: 'returning', job: undefined })
        continue
      }
      if (target !== ant.at) {
        // rows opened above moved the branch: walk to it and carry on building
        keep({ ...ant, task: 'walking' })
        continue
      }
      const built = (nextRows[target]!.built ?? 0) + 1
      if (built >= BUILD_STEPS) {
        nextRows = clearBuilt(nextRows, target)
        ant = ant.doneIds.includes(ant.job.id) ? advanceToNext(ant) : { ...ant, task: 'working', frame: 0 }
      } else {
        nextRows = setBuilt(nextRows, target, built)
      }
      keep(ant)
      continue
    }

    // returning: back up the tree, up the trail and into the hole
    if (holdsBack(ants, ant.at)) {
      keep(ant)
      continue
    }
    const at = Math.max(HOME, ant.at - 1)
    ant = at === HOME ? { ...ant, at, task: 'home' } : { ...ant, at }
    // heading up/out: no further-out ancestor column to lag at, so no climb visual here
    ant = clearClimb(ant)
    keep(ant)
  }

  const settled = keepApart(nextAnts, from)
  const seated = seatOrbits(seatPeeks(settled))
  return { ants: seated, rows: dropOrphanBuilds(nextRows, seated) }
}

/**
 * Two ants never end a tick on the same trail point, where one would be drawn beside
 * the other, inside the mound or over the hole. Where they would, one waits a tick
 * where it stood. The point goes to an ant that didn't move; else to one trading
 * places with the ant that stood there (two ants meeting head on pass each other,
 * fine as neighbouring points of the flank are on different lines), so the ants
 * following either of them wait; else to one setting out, else to the first in line.
 */
function keepApart(ants: Ant[], from: number[]): Ant[] {
  const out = [...ants]
  const moved = (i: number) => out[i]!.at !== from[i]
  const traded = (i: number) => out.some((b, j) => j !== i && from[j] === out[i]!.at && b.at === from[i])
  for (let again = true; again; ) {
    again = false
    const byPoint = new Map<number, number[]>()
    out.forEach((a, i) => {
      if (onTrail(a.at)) byPoint.set(a.at, [...(byPoint.get(a.at) ?? []), i])
    })
    for (const here of byPoint.values()) {
      const movers = here.filter(moved)
      if (here.length < 2 || movers.length === 0) continue
      const first =
        here.find((i) => !moved(i)) ??
        movers.find(traded) ??
        movers.find((i) => out[i]!.task !== 'returning') ??
        movers[0]!
      for (const i of movers) {
        if (i === first) continue
        out[i] = { ...out[i]!, at: from[i]! }
        again = true
      }
    }
  }
  return out
}

/**
 * A branch no ant is going to build any more (it lost its job) is shown complete,
 * so it can't stay half built, and keep the clock ticking, forever.
 */
function dropOrphanBuilds(rows: Row[], ants: Ant[]): Row[] {
  if (!rows.some((r) => r.built !== undefined)) return rows
  const wanted = new Set<string>()
  for (const a of ants) for (const j of [a.job, ...a.queue]) if (j?.kind === 'build') wanted.add(j.path)
  return rows.map((r) => (r.built === undefined || wanted.has(r.path) ? r : completed(r)))
}

/** Moves ants on tree rows at or after `index` down by `count` rows that were put in above them. */
export function shiftForInsert(ants: Ant[], index: number, count = 1): Ant[] {
  if (count <= 0) return ants
  return ants.map((a) => (a.at >= index ? { ...a, at: a.at + count } : a))
}

/**
 * Whether an ant is inside the hole: at home, or sent out but not yet climbing.
 * A busy ant sits at HOME too, but orbits the mound body instead — never the hole.
 */
export function inHole(a: Ant): boolean {
  return a.task !== 'busy' && (a.task === 'home' || a.at <= HOME)
}

/**
 * Seats the ants in the hole at its peek slots. An ant keeps its seat for as long as
 * it stays in the hole, so one leaving or being removed never makes another's antennae
 * jump; a newcomer takes the lowest free seat, and ants beyond the seats stay hidden.
 */
export function seatPeeks(ants: Ant[]): Ant[] {
  const held = new Set<number>()
  const kept = ants.map((a): Ant => {
    if (a.peek === undefined) return a
    if (inHole(a) && a.peek < PEEKS.length && !held.has(a.peek)) {
      held.add(a.peek)
      return a
    }
    const { peek, ...rest } = a
    return rest
  })
  return kept.map((a): Ant => {
    if (a.peek !== undefined || !inHole(a)) return a
    for (let seat = 0; seat < PEEKS.length; seat++) {
      if (held.has(seat)) continue
      held.add(seat)
      return { ...a, peek: seat }
    }
    return a
  })
}
