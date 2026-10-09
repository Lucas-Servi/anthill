import { test, expect } from 'claude-code/testing'
import type { Ant, Row } from '../types'
import { IGNORED, childRows, indexOf, openDir, insertRow, parentOf, ancestors, branchPrefixes, isBuilt, relativize, BUILD_STEPS } from './tree'
import {
  breedOf,
  newAnt,
  assign,
  finish,
  retire,
  step,
  shiftForInsert,
  colorFor,
  PALETTE,
  HOME,
  TRAIL_STEPS,
  seatPeeks,
  isBusy,
  markBusy,
  clearBusy,
  orbitCell,
  seatOrbits,
  inHole,
} from './ants'
import { SUMMIT, TRAIL, ORBIT, ORBIT_SEATS } from './mound'

/** Runs one tick on a single ant, unwrapping the (always non-empty) result. */
function tick(ant: Ant, rows: Row[]): [Ant, Row[]] {
  const result = step([ant], rows)
  return [result.ants[0]!, result.rows]
}

/** Steps a walking ant out of the hole and down the whole trail, checking each trail point. */
function climbDown(ant: Ant, rows: Row[]): [Ant, Row[]] {
  expect(ant.at).toBe(HOME)
  for (let k = 0; k < TRAIL_STEPS; k++) {
    ;[ant, rows] = tick(ant, rows)
    expect(ant.at).toBe(k - TRAIL_STEPS)
    expect(ant.task).toBe('walking')
  }
  return [ant, rows]
}

/** Steps until `done` holds (at most `limit` ticks); returns the ant and how many ticks it took. */
function runUntil(ant: Ant, rows: Row[], done: (a: Ant) => boolean, limit = 100): [Ant, number] {
  let n = 0
  while (!done(ant) && n < limit) {
    ;[ant, rows] = tick(ant, rows)
    n++
  }
  return [ant, n]
}

test('childRows ignores noise and sorts dirs first, alpha within group', () => {
  const rows = childRows('', 0, [
    { name: 'zeta.ts', kind: 'file' },
    { name: 'node_modules', kind: 'dir' },
    { name: 'Beta', kind: 'dir' },
    { name: 'alpha', kind: 'dir' },
    { name: 'README.md', kind: 'file' },
    { name: 'app.ts', kind: 'file' },
    { name: '.git', kind: 'dir' },
    { name: 'socket', kind: 'other' },
  ])
  expect(rows.map((r) => r.name)).toEqual(['alpha', 'Beta', 'app.ts', 'README.md', 'zeta.ts'])
  expect(rows[0]).toMatchObject({ path: 'alpha', depth: 0, isDir: true, isOpen: false })
  expect(rows[2]).toMatchObject({ path: 'app.ts', depth: 0, isDir: false })
  expect(IGNORED.has('.git')).toBe(true)
})

test('childRows nests under a parent path', () => {
  const rows = childRows('src', 1, [{ name: 'main.ts', kind: 'file' }])
  expect(rows[0]!.path).toBe('src/main.ts')
  expect(rows[0]!.depth).toBe(1)
})

test('indexOf finds and misses', () => {
  const rows = childRows('', 0, [{ name: 'a.ts', kind: 'file' }])
  expect(indexOf(rows, 'a.ts')).toBe(0)
  expect(indexOf(rows, 'missing')).toBe(-1)
})

test('openDir inserts children after the dir row and marks it open', () => {
  let rows = childRows('', 0, [
    { name: 'src', kind: 'dir' },
    { name: 'readme.md', kind: 'file' },
  ])
  const children = childRows('src', 1, [{ name: 'index.ts', kind: 'file' }])
  rows = openDir(rows, 'src', children)
  expect(rows.map((r) => r.path)).toEqual(['src', 'src/index.ts', 'readme.md'])
  expect(rows[0]!.isOpen).toBe(true)

  // already open: unchanged
  const again = openDir(rows, 'src', children)
  expect(again).toBe(rows)
})

test('openDir at top level appends into empty rows', () => {
  const children = childRows('', 0, [{ name: 'a.ts', kind: 'file' }])
  const rows = openDir([], '', children)
  expect(rows).toEqual(children)
})

test('insertRow places a file alphabetically among existing siblings', () => {
  let rows = childRows('', 0, [
    { name: 'alpha.ts', kind: 'file' },
    { name: 'zeta.ts', kind: 'file' },
  ])
  const { rows: next, index } = insertRow(rows, { path: 'mid.ts', name: 'mid.ts', depth: 0, isDir: false })
  expect(index).toBe(1)
  expect(next.map((r) => r.path)).toEqual(['alpha.ts', 'mid.ts', 'zeta.ts'])
})

test('insertRow places after a preceding sibling dir\'s full open subtree', () => {
  let rows = childRows('', 0, [
    { name: 'alpha', kind: 'dir' },
    { name: 'zeta.ts', kind: 'file' },
  ])
  rows = openDir(rows, 'alpha', childRows('alpha', 1, [{ name: 'inner.ts', kind: 'file' }]))
  // new top-level dir sorting after 'alpha' but before 'zeta.ts' (dirs still before files)
  const { rows: next, index } = insertRow(rows, { path: 'beta', name: 'beta', depth: 0, isDir: true })
  expect(index).toBe(2) // after alpha's subtree (alpha, alpha/inner.ts), before zeta.ts
  expect(next.map((r) => r.path)).toEqual(['alpha', 'alpha/inner.ts', 'beta', 'zeta.ts'])
})

test('insertRow is a no-op when the path already exists', () => {
  const rows = childRows('', 0, [{ name: 'a.ts', kind: 'file' }])
  const result = insertRow(rows, { path: 'a.ts', name: 'a.ts', depth: 0, isDir: false })
  expect(result.rows).toBe(rows)
  expect(result.index).toBe(0)
})

test('parentOf and ancestors', () => {
  expect(parentOf('a/b/c.ts')).toBe('a/b')
  expect(parentOf('a.ts')).toBe('')
  expect(ancestors('a/b/c.ts')).toEqual(['a', 'a/b'])
  expect(ancestors('a.ts')).toEqual([])
})

test('branchPrefixes draws tree connectors with last-sibling corners', () => {
  const rows: Row[] = [
    { path: 'alpha', name: 'alpha', depth: 0, isDir: true, isOpen: true },
    { path: 'alpha/inner.ts', name: 'inner.ts', depth: 1, isDir: false },
    { path: 'zeta.ts', name: 'zeta.ts', depth: 0, isDir: false },
  ]
  const prefixes = branchPrefixes(rows)
  expect(prefixes[0]).toBe('├── ') // alpha isn't last (zeta.ts follows)
  expect(prefixes[1]).toBe('│   └── ') // under a non-last ancestor: a pipe, not a blank
  expect(prefixes[2]).toBe('└── ')
})

test('branchPrefixes draws a non-last ancestor with a pipe', () => {
  const rows: Row[] = [
    { path: 'alpha', name: 'alpha', depth: 0, isDir: true, isOpen: true },
    { path: 'alpha/a.ts', name: 'a.ts', depth: 1, isDir: false },
    { path: 'alpha/b.ts', name: 'b.ts', depth: 1, isDir: false },
    { path: 'zeta.ts', name: 'zeta.ts', depth: 0, isDir: false },
  ]
  const prefixes = branchPrefixes(rows)
  expect(prefixes[1]).toBe('│   ├── ')
  expect(prefixes[2]).toBe('│   └── ')
})

test('branchPrefixes shows progressive build connectors, name only at full progress', () => {
  const building: Row = { path: 'new.ts', name: 'new.ts', depth: 0, isDir: false, built: 0 }
  const rows0: Row[] = [building]
  expect(branchPrefixes(rows0)[0]).toBe('')
  expect(isBuilt(building)).toBe(false)

  const steps = [1, 2, 3].map((built) => branchPrefixes([{ ...building, built }])[0])
  expect(steps).toEqual(['└', '└─', '└──'])

  const full: Row = { ...building, built: BUILD_STEPS }
  expect(branchPrefixes([full])[0]).toBe('└── ')
  expect(isBuilt(full)).toBe(true)
  expect(isBuilt({ ...building, built: undefined })).toBe(true)
})

test('relativize handles absolute, relative and outside-cwd paths', () => {
  expect(relativize('/home/me/proj', '/home/me/proj/src/a.ts')).toBe('src/a.ts')
  expect(relativize('/home/me/proj/', '/home/me/proj/a.ts')).toBe('a.ts')
  expect(relativize('/home/me/proj', '/home/me/proj')).toBe('')
  expect(relativize('/home/me/proj', '/elsewhere/a.ts')).toBe(null)
  expect(relativize('/home/me/proj', './a.ts')).toBe('a.ts')
  expect(relativize('/home/me/proj', 'a/b.ts')).toBe('a/b.ts')
})

test('breedOf matches case-insensitively', () => {
  expect(breedOf('claude-haiku-5-5')).toBe('haiku')
  expect(breedOf('SONNET')).toBe('sonnet')
  expect(breedOf('us.anthropic.claude-opus-5-5')).toBe('opus')
  expect(breedOf('claude-fable-5-1')).toBe('fable')
  expect(breedOf('gpt-4')).toBe('other')
  expect(breedOf(undefined)).toBe('other')
})

test('colorFor cycles the palette', () => {
  expect(colorFor(0)).toBe(PALETTE[0])
  expect(colorFor(PALETTE.length)).toBe(PALETTE[0])
  expect(colorFor(PALETTE.length + 2)).toBe(PALETTE[2])
})

test('home is inside the hole, one step before the first trail point', () => {
  expect(TRAIL_STEPS).toBe(TRAIL.length)
  expect(HOME).toBe(-(TRAIL.length + 1))
  expect(newAnt('1', 'main', 'other', '#fff').at).toBe(HOME)
})

test('ant lifecycle: assign, climb out, walk, work, finish, return home', () => {
  const rows: Row[] = [
    { path: 'a.ts', name: 'a.ts', depth: 0, isDir: false },
    { path: 'b.ts', name: 'b.ts', depth: 0, isDir: false },
  ]
  let ant = newAnt('1', 'main', 'other', '#fff')
  ant = assign(ant, { id: 'job1', path: 'b.ts', kind: 'work' })
  expect(ant.task).toBe('walking')

  // out of the hole and down the trail, then rows 0 and 1, then a tick to arrive
  let rowsNow = rows
  ;[ant, rowsNow] = climbDown(ant, rowsNow)
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(ant.at).toBe(0)
  expect(ant.task).toBe('walking')
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(ant.at).toBe(1)
  expect(ant.task).toBe('walking')
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(ant.at).toBe(1)
  expect(ant.task).toBe('working')

  ant = finish(ant, 'job1')
  expect(ant.task).toBe('returning')
  expect(ant.job).toBeUndefined()

  // up the tree, then back up the trail point by point, then into the hole
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(ant.at).toBe(0)
  for (let k = TRAIL_STEPS - 1; k >= 0; k--) {
    ;[ant, rowsNow] = tick(ant, rowsNow)
    expect(ant.at).toBe(k - TRAIL_STEPS)
    expect(ant.task).toBe('returning')
  }
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(ant.at).toBe(HOME)
  expect(ant.task).toBe('home')
})

test('a full trip to row r and back takes the trail both ways', () => {
  const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.ts`, name: `f${i}.ts`, depth: 0, isDir: false }))
  for (const r of [0, 3]) {
    let ant = assign(newAnt('1', 'main', 'opus', '#fff'), { id: 'j', path: `f${r}.ts`, kind: 'work' })
    let ticks: number
    // TRAIL_STEPS trail points + (r + 1) rows to reach row r, + 1 tick to start working
    ;[ant, ticks] = runUntil(ant, rows, (a) => a.task === 'working')
    expect(ticks).toBe(TRAIL_STEPS + r + 2)
    expect(ant.at).toBe(r)
    ant = finish(ant, 'j')
    // r rows up, TRAIL_STEPS trail points, + 1 into the hole
    ;[ant, ticks] = runUntil(ant, rows, (a) => a.task === 'home')
    expect(ticks).toBe(r + TRAIL_STEPS + 1)
    expect(ant.at).toBe(HOME)
  }
})

test('ant lifecycle: build job progressively fills in the row', () => {
  const rows: Row[] = [{ path: 'new.ts', name: 'new.ts', depth: 0, isDir: false }]
  let ant = newAnt('1', 'main', 'other', '#fff')
  ant = assign(ant, { id: 'job1', path: 'new.ts', kind: 'build' })

  let rowsNow = rows
  ;[ant, rowsNow] = climbDown(ant, rowsNow)
  ;[ant, rowsNow] = tick(ant, rowsNow) // steps onto the row
  expect(ant.task).toBe('walking')
  ;[ant, rowsNow] = tick(ant, rowsNow) // arrives, starts building
  expect(ant.task).toBe('building')
  expect(rowsNow[0]!.built).toBe(0)

  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(rowsNow[0]!.built).toBe(1)
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(rowsNow[0]!.built).toBe(2)
  ;[ant, rowsNow] = tick(ant, rowsNow)
  // one more tick reaches BUILD_STEPS (4): row complete, ant waits as 'working'
  ;[ant, rowsNow] = tick(ant, rowsNow)
  expect(rowsNow[0]!.built).toBeUndefined()
  expect(ant.task).toBe('working')

  ant = finish(ant, 'job1')
  expect(ant.task).toBe('returning')
})

test('queued jobs run in order once the current job finishes', () => {
  const rows: Row[] = [
    { path: 'a.ts', name: 'a.ts', depth: 0, isDir: false },
    { path: 'b.ts', name: 'b.ts', depth: 0, isDir: false },
  ]
  let ant = newAnt('1', 'main', 'other', '#fff')
  ant = assign(ant, { id: 'job1', path: 'a.ts', kind: 'work' })
  ant = assign(ant, { id: 'job2', path: 'b.ts', kind: 'work' })
  expect(ant.queue.map((j) => j.id)).toEqual(['job2'])

  let rowsNow = rows
  ;[ant, rowsNow] = climbDown(ant, rowsNow)
  ;[ant, rowsNow] = tick(ant, rowsNow) // steps onto a.ts
  expect(ant.task).toBe('walking')
  ;[ant, rowsNow] = tick(ant, rowsNow) // arrives at a.ts
  expect(ant.task).toBe('working')

  ant = finish(ant, 'job1')
  expect(ant.task).toBe('walking')
  expect(ant.job?.id).toBe('job2')
  expect(ant.queue).toEqual([])
})

test('an ant sent out again while returning on the trail turns around where it is', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false }]
  let ant: Ant = { ...newAnt('1', 'main', 'other', '#fff'), at: -3, task: 'returning' }
  ;[ant] = tick(ant, rows)
  expect(ant.at).toBe(-4)
  ant = assign(ant, { id: 'j', path: 'a.ts', kind: 'work' })
  expect(ant.task).toBe('walking')
  expect(ant.at).toBe(-4)
  ;[ant] = tick(ant, rows)
  expect(ant.at).toBe(-3)
})

test('a walking ant whose row disappeared heads back up the trail', () => {
  let ant: Ant = { ...newAnt('1', 'main', 'other', '#fff'), at: -5, task: 'walking', job: { id: 'j', path: 'gone.ts', kind: 'work' } }
  ;[ant] = tick(ant, [])
  expect(ant.task).toBe('returning')
  expect(ant.at).toBe(-5)
  ;[ant] = tick(ant, [])
  expect(ant.at).toBe(-6)
})

test('ants sent out on the same tick leave the hole one after another', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false }]
  const job = (id: string) => ({ id, path: 'a.ts', kind: 'work' as const })
  let ants: Ant[] = ['1', '2', '3'].map((id) => assign(newAnt(id, id, 'opus', '#fff'), job(id)))
  const seen: number[][] = []
  for (let t = 0; t < 12; t++) {
    ;({ ants } = step(ants, rows))
    seen.push(ants.map((a) => a.at))
    // never two ants on the same trail point
    const onTrail = ants.map((a) => a.at).filter((at) => at > HOME && at < 0)
    expect(new Set(onTrail).size).toBe(onTrail.length)
  }
  // the first leaves at once, the others wait in the hole until the trail ahead is clear
  expect(seen[0]).toEqual([HOME + 1, HOME, HOME])
  const leftAt = ants.map((_, i) => seen.findIndex((s) => s[i]! > HOME))
  expect(leftAt[0]).toBe(0)
  expect(leftAt[1]! > leftAt[0]!).toBe(true)
  expect(leftAt[2]! > leftAt[1]!).toBe(true)
  // and they keep their distance down the trail
  expect(leftAt[1]! - leftAt[0]! >= 3).toBe(true)
  expect(leftAt[2]! - leftAt[1]! >= 3).toBe(true)
})

test('ants saved with an older home position start from the hole', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false }]
  const old: Ant = { ...newAnt('1', 'main', 'other', '#fff'), at: -1 } // the old "inside the anthill"
  const sent = assign(old, { id: 'j', path: 'a.ts', kind: 'work' })
  expect(sent.at).toBe(HOME)
  // and an ant somehow below HOME is clamped into the hole
  const [lost] = tick({ ...old, at: HOME - 4, task: 'returning' }, rows)
  expect(lost.at).toBe(HOME)
  expect(lost.task).toBe('home')
})

test('retire removes a home ant on the next step', () => {
  let ant = newAnt('1', 'main', 'other', '#fff')
  ant = retire(ant)
  const { ants } = step([ant], [])
  expect(ants).toEqual([])
})

test('shiftForInsert moves ants down by the number of rows put in above them', () => {
  const ants = [
    { ...newAnt('1', 'a', 'other', '#fff'), at: 1 },
    { ...newAnt('2', 'b', 'other', '#fff'), at: 2 },
    { ...newAnt('3', 'c', 'other', '#fff'), at: 5 },
    { ...newAnt('4', 'd', 'other', '#fff'), at: -2 },
  ]
  expect(shiftForInsert(ants, 2, 3).map((a) => a.at)).toEqual([1, 5, 8, -2])
  expect(shiftForInsert(ants, 2, 0)).toBe(ants)
})

test('shiftForInsert bumps ants at or after the inserted index', () => {
  const ants = [
    { ...newAnt('1', 'a', 'other', '#fff'), at: 0 },
    { ...newAnt('2', 'b', 'other', '#fff'), at: 2 },
    { ...newAnt('3', 'c', 'other', '#fff'), at: -1 },
    newAnt('4', 'd', 'other', '#fff'),
  ]
  const shifted = shiftForInsert(ants, 1)
  // trail and home ants are on the mound, not the tree: untouched
  expect(shifted.map((a) => a.at)).toEqual([0, 3, -1, HOME])
})

// ---- queued builds, half-built rows ------------------------------------------

const file = (path: string, over: Partial<Row> = {}): Row => ({ path, name: path.split('/').at(-1)!, depth: path.split('/').length - 1, isDir: false, ...over })

/** Steps all ants `n` times (or until `done`), returning the final world and every tick's ants. */
function runAll(ants: Ant[], rows: Row[], n: number, done?: (ants: Ant[], rows: Row[]) => boolean) {
  const seen: Ant[][] = []
  for (let t = 0; t < n && !(done && done(ants, rows)); t++) {
    ;({ ants, rows } = step(ants, rows))
    seen.push(ants)
  }
  return { ants, rows, seen }
}

test('a new file queued behind a job is still built when its tool call ends first', () => {
  let rows: Row[] = [file('src', { isDir: true, isOpen: true }), file('src/a.ts'), file('README.md')]
  // Read src/a.ts (over at once), then a few ticks later Write the new src/new.ts
  let ant = finish(assign(newAnt('main', 'main', 'opus', '#fff'), { id: 'r1', path: 'src/a.ts', kind: 'work' }), 'r1')
  let ants: Ant[] = [ant]
  ;({ ants, rows } = runAll(ants, rows, 5))
  const placed = insertRow(rows, file('src/new.ts', { built: 0 }))
  rows = placed.rows
  ants = shiftForInsert(ants, placed.index)
  ant = assign(ants[0]!, { id: 'w1', path: 'src/new.ts', kind: 'build' })
  expect(ant.queue.map((j) => j.id)).toEqual(['w1'])
  // the Write is over long before the ant gets there: it stays queued, marked done
  ant = finish(ant, 'w1')
  expect(ant.queue.map((j) => j.id)).toEqual(['w1'])
  expect(ant.doneIds.includes('w1')).toBe(true)

  const run = runAll([ant], rows, 200, (a) => a[0]!.task === 'home')
  const at = indexOf(run.rows, 'src/new.ts')
  expect(run.seen.some((a) => a[0]!.task === 'building' && a[0]!.at === at)).toBe(true)
  expect(run.ants[0]!.task).toBe('home')
  for (const r of run.rows) expect(r.built).toBeUndefined()
  // and it left the branch at once, without lingering as for unfinished work
  const started = run.seen.findIndex((a) => a[0]!.task === 'building')
  expect(run.seen[started + BUILD_STEPS]![0]!.task).toBe('returning')
})

test('finishing a queued job that is not a build still drops it', () => {
  let ant = assign(newAnt('1', 'main', 'other', '#fff'), { id: 'a', path: 'a.ts', kind: 'work' })
  ant = assign(ant, { id: 'b', path: 'b.ts', kind: 'work' })
  ant = finish(ant, 'b')
  expect(ant.queue).toEqual([])
  expect(ant.doneIds.includes('b')).toBe(false)
})

test('a half-built branch no ant is going to build is shown complete', () => {
  const rows: Row[] = [file('a.ts', { built: 2 }), file('b.ts', { built: 0 }), file('c.ts', { built: 1 })]
  // b.ts is still some ant's job, c.ts waits in a queue; nobody holds a.ts any more
  const ants: Ant[] = [
    { ...newAnt('1', 'x', 'other', '#fff'), at: HOME + 2, task: 'walking', job: { id: 'j', path: 'b.ts', kind: 'build' } },
    { ...newAnt('2', 'y', 'other', '#fff'), at: 0, task: 'working', job: { id: 'k', path: 'a.ts', kind: 'work' }, queue: [{ id: 'l', path: 'c.ts', kind: 'build' }] },
    newAnt('3', 'z', 'other', '#fff'),
  ]
  const next = step(ants, rows).rows
  expect(next.map((r) => r.built)).toEqual([undefined, 0, 1])
  // and with nothing to build, everything settles: rows complete, every ant home
  const idle = step([newAnt('3', 'z', 'other', '#fff')], rows)
  for (const r of idle.rows) expect(r.built).toBeUndefined()
})

test('a building ant whose branch moved down walks to it and carries on building', () => {
  // NOTES.md half built at row 2; then lib/ above it opens without the ant being moved
  let rows: Row[] = [file('lib', { isDir: true }), file('src', { isDir: true }), file('NOTES.md', { built: 1 })]
  const ant: Ant = { ...newAnt('1', 'main', 'opus', '#fff'), at: 2, task: 'building', job: { id: 'w', path: 'NOTES.md', kind: 'build' }, doneIds: ['w'] }
  rows = openDir(rows, 'lib', childRows('lib', 1, [{ name: 'a.ts', kind: 'file' }, { name: 'b.ts', kind: 'file' }]))
  let [a, r] = tick(ant, rows)
  expect(a.task).toBe('walking')
  expect(a.job?.id).toBe('w')
  ;[a, r] = tick(a, r)
  ;[a, r] = tick(a, r)
  expect(a.at).toBe(4)
  // building again from where it was, not from scratch
  const builtSeen: (number | undefined)[] = []
  for (let t = 0; t < 10 && a.task !== 'returning'; t++) {
    ;[a, r] = tick(a, r)
    builtSeen.push(r[4]!.built)
  }
  expect(builtSeen[0]).toBe(1)
  expect(builtSeen.includes(0)).toBe(false)
  expect(r[4]!.built).toBeUndefined()
  expect(a.task).toBe('returning')
})

// ---- traffic on the trail ------------------------------------------------------

const onTrail = (a: Ant) => a.at > HOME && a.at < 0
const summitLine = (at: number) => at > HOME + 1 && at <= HOME + SUMMIT
const rowsN = (n: number): Row[] => Array.from({ length: n }, (_, i) => file(`f${i}.ts`))
const walker = (id: string, at: number, path = 'f3.ts'): Ant => ({ ...newAnt(id, id, 'opus', '#fff'), at, task: 'walking', job: { id: 'j' + id, path, kind: 'work' } })
const climber = (id: string, at: number): Ant => ({ ...newAnt(id, id, 'opus', '#fff'), at, task: 'returning' })

test('the summit points share one line; the flank below has a line per point', () => {
  const line = TRAIL[1]!.line
  for (let k = 1; k < SUMMIT; k++) expect(TRAIL[k]!.line).toBe(line)
  for (let k = SUMMIT; k < TRAIL.length; k++) {
    expect(TRAIL[k]!.line === line).toBe(false)
    if (k > SUMMIT) expect(TRAIL[k]!.line === TRAIL[k - 1]!.line).toBe(false)
  }
})

test('an ant sent out waits in the hole while one climbing home is on or near the summit', () => {
  const rows = rowsN(4)
  for (let k = 0; k <= SUMMIT; k++) {
    const run = runAll([climber('home', k - TRAIL_STEPS), assign(newAnt('out', 'out', 'fable', '#fff'), { id: 'j', path: 'f0.ts', kind: 'work' })], rows, 30)
    const came = run.seen.findIndex((a) => a[0]!.task === 'home')
    const left = run.seen.findIndex((a) => a[1]!.at > HOME)
    expect(came >= 0 && left > came).toBe(true)
  }
})

test('one coming down over the summit makes the one climbing wait below it; they pass on the flank', () => {
  const rows = rowsN(4)
  // the climber reaches the point below the summit while the other is still up there
  const run = runAll([walker('down', HOME + 1), climber('up', HOME + SUMMIT + 2)], rows, 40)
  expect(run.seen[0]![1]!.at).toBe(HOME + SUMMIT + 1)
  expect(run.seen[1]![1]!.at).toBe(HOME + SUMMIT + 1)
  let passed = false
  for (const [d, u] of run.seen.map((a) => [a[0]!, a[1]!] as const)) {
    // never both on the summit line
    expect(summitLine(d.at) && summitLine(u.at) && u.task === 'returning').toBe(false)
    if (onTrail(d) && onTrail(u)) expect(d.at === u.at).toBe(false)
    if (u.task === 'returning' && d.at > u.at) passed = true
  }
  expect(passed).toBe(true)
  expect(run.ants[1]!.task).toBe('home')
  expect(run.ants[0]!.task).toBe('working')
})

test('an ant sent out again on the summit, right in front of one climbing, turns back in first', () => {
  const rows = rowsN(4)
  // both climbing home over the summit, then the one ahead gets a new job
  let ants = [climber('a', HOME + 2), climber('b', HOME + SUMMIT)]
  ants[0] = assign(ants[0]!, { id: 'j', path: 'f0.ts', kind: 'work' })
  expect(ants[0]!.task).toBe('walking')
  const run = runAll(ants, rows, 40)
  // it goes back down the hole, lets the other in, then sets out again
  expect(run.seen[0]![0]!.at).toBe(HOME + 1)
  const bHome = run.seen.findIndex((a) => a[1]!.task === 'home')
  const aOut = run.seen.findIndex((a, t) => t > 0 && a[0]!.at > HOME && run.seen[t - 1]![0]!.at === HOME)
  expect(bHome >= 0 && aOut > bHome).toBe(true)
  for (const [a, b] of run.seen.map((x) => [x[0]!, x[1]!] as const)) {
    if (b.task === 'returning') expect(summitLine(a.at) && summitLine(b.at) && a.at < b.at).toBe(false)
  }
  expect(run.ants[0]!.task).toBe('working')
})

test('ants climbing home in a row keep a point free between them on the summit line', () => {
  const rows = rowsN(4)
  const ants = [0, 1, 2].map((i) => ({ ...climber('c' + i, 0), frame: i }))
  const run = runAll(ants, rows, 60)
  for (const tickAnts of run.seen) {
    const onLine = tickAnts.filter((a) => summitLine(a.at)).map((a) => a.at)
    for (const x of onLine) for (const y of onLine) if (x !== y) expect(Math.abs(x - y) >= 2).toBe(true)
  }
  for (const a of run.ants) expect(a.task).toBe('home')
})

test('two ants meeting head on never share a trail point: one waits a tick and they pass', () => {
  const rows = rowsN(4)
  for (const gap of [2, 3, 4]) {
    // on the flank, below the summit
    const d = walker('d', HOME + SUMMIT + 1)
    const u = climber('u', HOME + SUMMIT + 1 + gap)
    const run = runAll([d, u], rows, 30)
    let prev = [d, u]
    for (const [a, b] of run.seen.map((x) => [x[0]!, x[1]!] as const)) {
      if (onTrail(a) && onTrail(b)) expect(a.at === b.at).toBe(false)
      // nobody steps more than one point a tick
      expect(Math.abs(a.at - prev[0]!.at) <= 1 && Math.abs(b.at - prev[1]!.at) <= 1).toBe(true)
      prev = [a, b]
    }
    expect(run.seen.some((x) => x[0]!.at > x[1]!.at && x[1]!.task === 'returning')).toBe(true)
  }
})

test('two ants going home from the same row climb the trail one behind the other', () => {
  const rows = rowsN(4)
  const run = runAll([climber('a', 0), climber('b', 0)], rows, 40)
  for (const [a, b] of run.seen.map((x) => [x[0]!, x[1]!] as const)) {
    if (onTrail(a) && onTrail(b)) expect(a.at === b.at).toBe(false)
  }
  for (const a of run.ants) expect(a.task).toBe('home')
})

test('busy colonies never jam, share a trail point or skip one, and always settle', () => {
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let s = 0; s < 120; s++) {
    let rows = rowsN(5)
    let ants: Ant[] = Array.from({ length: 2 + (s % 6) }, (_, i) => newAnt('a' + i, 'a' + i, 'opus', colorFor(i)))
    const pending: { ant: string; job: string; at: number }[] = []
    let jobs = 0
    for (let t = 0; t < 400; t++) {
      if (t < 200 && rnd() < 0.15) {
        const who = ants[Math.floor(rnd() * ants.length)]!.id
        let path = rows[Math.floor(rnd() * rows.length)]!.path
        let kind: 'work' | 'build' = 'work'
        if (rnd() < 0.2) {
          const placed = insertRow(rows, file(`n${jobs}.ts`, { built: 0 }))
          rows = placed.rows
          ants = shiftForInsert(ants, placed.index)
          path = `n${jobs}.ts`
          kind = 'build'
        }
        const id = 'j' + jobs++
        ants = ants.map((a) => (a.id === who ? assign(a, { id, path, kind }) : a))
        pending.push({ ant: who, job: id, at: t + Math.floor(rnd() * rnd() * 40) })
      }
      for (const p of pending.filter((p) => p.at <= t)) {
        ants = ants.map((a) => (a.id === p.ant ? finish(a, p.job) : a))
        pending.splice(pending.indexOf(p), 1)
      }
      const before = new Map(ants.map((a) => [a.id, a.at]))
      ;({ ants, rows } = step(ants, rows))
      const trail = ants.filter(onTrail).map((a) => a.at)
      expect(new Set(trail).size).toBe(trail.length)
      for (const a of ants) expect(Math.abs(a.at - before.get(a.id)!) <= 1).toBe(true)
    }
    for (const a of ants) expect(a.task).toBe('home')
    for (const r of rows) expect(r.built).toBeUndefined()
  }
})

test('step keeps every home ant on its peek seat when an earlier ant is removed or sets out', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false }]
  let ants = seatPeeks(['main', 'explore', 'plan', 'review'].map((id, i) => newAnt(id, id, 'sonnet', colorFor(i))))
  expect(ants.map(a => a.peek)).toEqual([0, 1, 2, undefined])

  // explore retires and is removed; main sets out for a.ts: plan stays put, review takes a freed seat
  ants = ants.map(a => (a.id === 'explore' ? retire(a) : a.id === 'main' ? assign(a, { id: 't', path: 'a.ts', kind: 'work' }) : a))
  for (let i = 0; i < 3; i++) ({ ants } = step(ants, rows))
  const seat = (id: string) => ants.find(a => a.id === id)?.peek
  expect(ants.some(a => a.id === 'explore')).toBe(false)
  expect(seat('plan')).toBe(2)
  expect(seat('main')).toBeUndefined()
  expect([0, 1]).toContain(seat('review'))
})

test('markBusy sets a home ant busy; is a no-op on every other task', () => {
  const home = newAnt('1', 'main', 'other', '#fff')
  const busy = markBusy(home)
  expect(busy.task).toBe('busy')
  expect(isBusy(busy)).toBe(true)
  expect(isBusy(home)).toBe(false)

  for (const task of ['walking', 'working', 'building', 'returning', 'busy'] as const) {
    const ant = { ...home, task }
    expect(markBusy(ant)).toBe(ant) // same reference: a true no-op
  }
})

test('clearBusy reverts a busy ant to home and drops its busySeat; is a no-op otherwise', () => {
  const busy = { ...markBusy(newAnt('1', 'main', 'other', '#fff')), busySeat: 2 }
  const cleared = clearBusy(busy)
  expect(cleared.task).toBe('home')
  expect(cleared.busySeat).toBeUndefined()

  for (const task of ['home', 'walking', 'working', 'building', 'returning'] as const) {
    const ant = { ...busy, task }
    expect(clearBusy(ant)).toBe(ant)
  }
})

test('assign on a busy ant starts it walking at once, dropping its busySeat', () => {
  const busy = { ...markBusy(newAnt('1', 'main', 'other', '#fff')), busySeat: 1 }
  const ant = assign(busy, { id: 'j', path: 'a.ts', kind: 'work' })
  expect(ant.task).toBe('walking')
  expect(ant.at).toBe(HOME)
  expect(ant.busySeat).toBeUndefined()
  expect(ant.job?.path).toBe('a.ts')
})

test('step keeps a busy ant busy across ticks (it never falls through to the returning branch)', () => {
  const rows: Row[] = []
  let ant = markBusy(newAnt('1', 'main', 'other', '#fff'))
  for (let i = 0; i < 10; i++) {
    ;[ant, ] = tick(ant, rows)
    expect(ant.task).toBe('busy')
    expect(ant.at).toBe(HOME)
  }
})

test('inHole excludes a busy ant even though its at is HOME', () => {
  const home = newAnt('1', 'main', 'other', '#fff')
  expect(inHole(home)).toBe(true)
  expect(inHole(markBusy(home))).toBe(false)
})

test('orbitCell cycles through all of ORBIT over ORBIT.length ticks, offset by busySeat', () => {
  const ant = { ...markBusy(newAnt('1', 'main', 'other', '#fff')), busySeat: 0 }
  const seen = new Set<string>()
  for (let f = 0; f < ORBIT.length; f++) {
    const cell = orbitCell({ ...ant, frame: f })
    expect(cell).toBeDefined()
    seen.add(`${cell!.line},${cell!.col}`)
  }
  expect(seen.size).toBe(ORBIT.length)
  expect(orbitCell(newAnt('1', 'main', 'other', '#fff'))).toBeUndefined() // no busySeat: no dot
})

test('two busy ants on any pair of seats never share an ORBIT cell, at any frame', () => {
  for (let s1 = 0; s1 < ORBIT_SEATS; s1++) {
    for (let s2 = 0; s2 < ORBIT_SEATS; s2++) {
      if (s1 === s2) continue
      for (let f = 0; f < ORBIT.length; f++) {
        const a = orbitCell({ ...markBusy(newAnt('a', 'a', 'other', '#fff')), busySeat: s1, frame: f })!
        const b = orbitCell({ ...markBusy(newAnt('b', 'b', 'other', '#fff')), busySeat: s2, frame: f })!
        expect(a.line === b.line && a.col === b.col).toBe(false)
      }
    }
  }
})

test('seatOrbits seats busy ants on ORBIT like seatPeeks seats home ants on PEEKS: stable, no overlap, freed on release', () => {
  let ants = seatOrbits(['a', 'b', 'c'].map((id, i) => markBusy(newAnt(id, id, 'other', colorFor(i)))))
  expect(ants.map(a => a.busySeat)).toEqual([0, 1, 2])

  // 'a' stops being busy and is dropped from the list: 'b' keeps its seat, no jump
  ants = seatOrbits(ants.filter(a => a.id !== 'a'))
  expect(ants.find(a => a.id === 'b')!.busySeat).toBe(1)
  expect(ants.find(a => a.id === 'c')!.busySeat).toBe(2)

  // a newcomer takes the freed seat 0
  ants = seatOrbits([...ants, markBusy(newAnt('d', 'd', 'other', colorFor(3)))])
  expect(ants.find(a => a.id === 'd')!.busySeat).toBe(0)
})
