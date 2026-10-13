import { mock, expect, test, type TestBody } from 'claude-code/testing'
import { GROWTH, GROWTH_STAGES, HOME, TUNNEL, stageFor } from './mound'
import { STALE_TICKS } from './ants'

const CWD = '/proj'
const DIRS: Record<string, { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }[]> = {
  [CWD]: [
    { name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: 'README.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false },
    { name: 'node_modules', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
  ],
  [`${CWD}/src`]: [{ name: 'main.ts', kind: 'file', size: 1, mtimeMs: 0, isLink: false }],
}

const PANE_PROPS = {
  title: 'Anthill',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

test('ants follow tool calls and build new files', async ($, on) => {
  const clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.list', ($, e) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.exists', ($, e) => ({ value: e.path !== `${CWD}/src/new.ts` }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)

  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: false })
  const pane = await $.ui.mount({
    plugin: 'anthill',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'anthill',
    props: PANE_PROPS as never,
  })

  // Top level listed, ignored dirs left out, the opus ant in the legend.
  expect(await pane.find({ text: 'README.md' })).toBeDefined()
  expect(await pane.find({ text: 'node_modules' })).toBeUndefined()
  expect(await pane.find({ text: /main \(opus\)/ })).toBeDefined()

  // Reading a nested file opens its directory.
  await $.tool.call({ tool: 'Read', file_path: `${CWD}/src/main.ts` } as never)
  await clock.advance(120 * 30)
  expect(await pane.find({ text: 'main.ts' })).toBeDefined()

  // Writing a new file builds its branch, then the ant goes home.
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/src/new.ts`, content: '' } as never)
  await clock.advance(120 * 40)
  expect(await pane.find({ text: 'new.ts' })).toBeDefined()
})

test('ants saved by an older version are moved into the summit hole', async ($, on) => {
  mock.clock(on)
  // an ant saved when "home" was at -1, before the trail down the anthill existed
  const old = { id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: -1, task: 'home', queue: [], doneIds: [], frame: 3 }
  let served = false
  let saved: Record<string, unknown>[] | undefined
  on('state.get', ($, e, next) => {
    if (!served && (e as { key?: string }).key === 'ants') {
      served = true
      return { value: { value: [old], version: 1 } } as never
    }
    return next(e)
  })
  on('state.set', ($, e, next) => {
    const set = e as { key?: string; value?: unknown }
    if (set.key === 'ants') saved = set.value as typeof saved
    return next(e)
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.list', ($, e) => ({ value: DIRS[e.path] ?? [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('store.get', () => ({ value: undefined }) as never)

  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: false })
  expect(served).toBe(true)
  expect(saved?.length).toBe(1)
  expect(saved?.[0]).toMatchObject({ id: 'main', frame: 3, at: HOME, task: 'home' })
})

/** Runs a session in `dirs`, with `missing` files not on disk yet; tracks what the plugin saves. */
const session = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  dirs: typeof DIRS,
  missing: string[],
  saved: {
    rows?: { path: string; built?: number; flash?: { kind: 'error' | 'denied'; ticks: number } }[]
    ants?: { id: string; at: number; task: string; mishap?: { kind: 'error' | 'denied'; ticks: number } }[]
    folds?: { id: string; before: number; after?: number; settle?: number }[]
    layout?: 'side' | 'strip'
    growth?: number
    dug?: unknown[]
    tick?: number
  }[] = [],
  /** Overrides the default instant-'ok' tool.call response, e.g. to park an ant mid-job, or to deny/error it. */
  toolCall: () => unknown = () => ({ result: 'ok' }),
) => {
  const clock = mock.clock(on)
  const latest = {
    rows: [] as { path: string; built?: number; flash?: { kind: 'error' | 'denied'; ticks: number } }[],
    ants: [] as { id: string; at: number; task: string; mishap?: { kind: 'error' | 'denied'; ticks: number } }[],
    folds: [] as { id: string; before: number; after?: number; settle?: number }[],
    layout: 'side' as 'side' | 'strip',
    growth: 0,
    dug: [] as { i: number; at: number }[],
    tick: 0,
    ticks: 0,
  }
  on('state.get', ($, e, next) => {
    const key = (e as { key?: string }).key as keyof (typeof saved)[number] | undefined
    if (key !== undefined && saved[0]?.[key] !== undefined) {
      const value = saved[0]![key]
      delete saved[0]![key]
      return { value: { value, version: 1 } } as never
    }
    return next(e)
  })
  on('state.set', ($, e, next) => {
    const set = e as { key?: string; value?: unknown }
    if (set.key === 'rows') latest.rows = set.value as typeof latest.rows
    if (set.key === 'ants') latest.ants = set.value as typeof latest.ants
    if (set.key === 'folds') latest.folds = set.value as typeof latest.folds
    if (set.key === 'layout') latest.layout = set.value as typeof latest.layout
    if (set.key === 'growth') latest.growth = set.value as number
    if (set.key === 'dug') latest.dug = set.value as typeof latest.dug
    if (set.key === 'tick') {
      latest.tick = set.value as number
      latest.ticks++
    }
    return next(e)
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.list', ($, e) => ({ value: dirs[e.path] ?? [] }))
  on('fs.exists', ($, e) => ({ value: !missing.includes(e.path) }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('tool.call', () => toolCall() as never)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: false })
  const pane = await $.ui.mount({ plugin: 'anthill', surface: 'terminal', component: 'Pane', requestId: 'anthill', props: PANE_PROPS as never })
  /** Whether the clock has stopped: no tick published over `ms`. */
  const idles = async (ms = 120 * 50) => {
    const before = latest.ticks
    await clock.advance(ms)
    return latest.ticks === before
  }
  return { clock, latest, pane, idles }
}

test('a Write sent while the ant is still out on a Read builds its branch, then the clock idles', async ($, on) => {
  const { clock, latest, pane, idles } = await session($, on, DIRS, [`${CWD}/src/new.ts`])
  await $.tool.call({ tool: 'Read', file_path: `${CWD}/src/main.ts`, tool_use_id: 'r1' } as never)
  await clock.advance(120 * 5) // still crawling down the anthill
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/src/new.ts`, content: '', tool_use_id: 'w1' } as never)
  await clock.advance(120 * 200)
  expect(await pane.find({ text: 'new.ts' })).toBeDefined()
  expect(latest.rows.some(r => r.path === 'src/new.ts')).toBe(true)
  for (const r of latest.rows) expect(r.built).toBeUndefined()
  expect(latest.ants.every(a => a.task === 'home')).toBe(true)
  expect(await idles()).toBe(true)
})

test('a directory opened above a branch being built moves its ant down with it', async ($, on) => {
  const f = (name: string, kind: 'file' | 'dir' = 'file') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })
  const dirs = { [CWD]: [f('lib', 'dir'), f('src', 'dir')], [`${CWD}/lib`]: [f('a.ts'), f('b.ts')] }
  const { clock, latest, pane, idles } = await session($, on, dirs as never, [`${CWD}/NOTES.md`])
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/NOTES.md`, content: '', tool_use_id: 'w1' } as never)
  await clock.advance(120 * 15) // building NOTES.md, below lib/ and src/
  const main = () => latest.ants.find(a => a.id === 'main')!
  expect(main().task).toBe('building')
  expect(latest.rows[main().at]!.path).toBe('NOTES.md')
  // a subagent's Read opens lib/ above it
  await $.tool.call({ tool: 'Read', file_path: `${CWD}/lib/a.ts`, tool_use_id: 'r1', agentId: 'sub1' } as never)
  expect(latest.rows.map(r => r.path)).toEqual(['lib', 'lib/a.ts', 'lib/b.ts', 'src', 'NOTES.md'])
  expect(latest.rows[main().at]!.path).toBe('NOTES.md')
  await clock.advance(120 * 200)
  expect(await pane.find({ text: 'NOTES.md' })).toBeDefined()
  for (const r of latest.rows) expect(r.built).toBeUndefined()
  expect(await idles()).toBe(true)
})

test('a half-built branch saved with no ant left to build it is shown complete', async ($, on) => {
  const rows = [
    { path: 'src', name: 'src', depth: 0, isDir: true, isOpen: false },
    { path: 'NEW.md', name: 'NEW.md', depth: 0, isDir: false, built: 0 },
    { path: 'README.md', name: 'README.md', depth: 0, isDir: false },
  ]
  const ants = [{ id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: HOME, task: 'home', queue: [], doneIds: [], frame: 0 }]
  const { latest, pane, idles } = await session($, on, DIRS, [], [{ rows, ants } as never])
  await idles(120 * 5)
  expect(latest.rows.map(r => r.path)).toEqual(['src', 'NEW.md', 'README.md'])
  for (const r of latest.rows) expect(r.built).toBeUndefined()
  expect(await pane.find({ text: 'NEW.md' })).toBeDefined()
  expect(await idles()).toBe(true)
})

test('resting ants wiggle their antennae while idle, without advancing the simulation tick', async ($, on) => {
  const { latest, pane, idles } = await session($, on, DIRS, [])
  const frameOf = () => (latest.ants[0] as unknown as { frame: number }).frame
  const before = frameOf()
  expect(await idles(120 * 20)).toBe(true) // nothing to crawl to: the tick itself never moves
  expect(frameOf()).toBeGreaterThan(before) // but the ant resting in the hole still looks busy
  expect(await pane.find({ text: 'README.md' })).toBeDefined()
})

test('a Bash call shows the ant busy, not idle, for its duration, and home again once its turn completes', async ($, on) => {
  on('turn.complete', () => ({ text: '' }) as never)
  const { latest, idles } = await session($, on, DIRS, [])

  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'b1' } as never)
  // Bash has no file path, so no job: the ant is busy, not home, and the call alone
  // doesn't clear it either — it stays busy until the turn itself ends.
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('busy')

  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
  expect(await idles()).toBe(true)
})

test('a subagent killed without a turn.complete has its ant leave once a reconcile sweep sees it on agent.list', async ($, on) => {
  on('agent.list', () => ({ value: [{ id: 'sub1', description: 'x', type: 'general-purpose', status: 'killed' }] }) as never)
  const { clock, latest, idles } = await session($, on, DIRS, [])

  await $.tool.call({ tool: 'Bash', command: 'sleep 9', tool_use_id: 'b1', agentId: 'sub1' } as never)
  // Bash has no file path: busy, with nothing to otherwise clear it (no turn.complete
  // ever comes for this id, the bug a stopped/failed/killed subagent used to hit).
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('busy')

  await clock.advance(120 * 40) // past a reconcile sweep (every 25 ticks) and the tick that removes it home
  expect(latest.ants.some(a => a.id === 'sub1')).toBe(false)
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
  expect(await idles()).toBe(true)
})

test('a running subagent\'s ant stays busy across a reconcile sweep', async ($, on) => {
  on('agent.list', () => ({ value: [{ id: 'sub1', description: 'x', type: 'general-purpose', status: 'running' }] }) as never)
  const { clock, latest } = await session($, on, DIRS, [])

  await $.tool.call({ tool: 'Bash', command: 'sleep 9', tool_use_id: 'b1', agentId: 'sub1' } as never)
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('busy')

  await clock.advance(120 * 40) // well past several reconcile sweeps
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('busy')
})

test('an ant idled (not retired) by one reconcile sweep still leaves once a later sweep finds its agent ended, even though the colony went idle in between (regression)', async ($, on) => {
  let status: 'idle' | 'killed' = 'idle'
  on('agent.list', () => ({ value: [{ id: 'sub1', description: 'x', type: 'general-purpose', status }] }) as never)
  const { clock, latest, idles } = await session($, on, DIRS, [])

  await $.tool.call({ tool: 'Bash', command: 'sleep 9', tool_use_id: 'b1', agentId: 'sub1' } as never)
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('busy')

  await clock.advance(120 * 30) // past the first reconcile sweep: idled, not retired, still present
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('home')
  expect(await idles()).toBe(true) // the colony really did go idle in between

  // the agent later really ends, with nothing else around to make the colony busy
  // again on its own and resume the periodic sweep
  status = 'killed'
  await clock.advance(120 * 1000)
  expect(latest.ants.some(a => a.id === 'sub1')).toBe(false)
})

test('an ant saved before `seenAt` existed, busy, with the session\'s own persisted tick already past STALE_TICKS, isn\'t retired as silent-since-tick-0 on the very first reconcile sweep after loading (regression)', async ($, on) => {
  on('agent.list', () => ({ value: [] }) as never) // never listed at all, e.g. a Workflow's agent, even while it's running
  const bigTick = STALE_TICKS + 500
  const ants = [
    { id: 'main', label: 'main', breed: 'opus', color: '#ff5f5f', at: HOME, task: 'home', queue: [], doneIds: [], frame: 0 },
    { id: 'sub1', label: 'agent', breed: 'other', color: '#5fff5f', at: HOME, task: 'busy', queue: [], doneIds: [], frame: 0 }, // predates `seenAt`
  ]
  const { clock, latest } = await session($, on, DIRS, [], [{ ants, tick: bigTick } as never])

  await clock.advance(120 * 30) // past the first reconcile sweep after loading
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('busy') // still here, not wrongly retired as stale
})

test('turn.step marks the loop busy and passes its chunks through unmodified; turn.complete clears it', async ($, on) => {
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'hello' } as never
    return { turnId: e.turnId, index: e.index, answer: 'hello', toolUses: [] } as never
  })
  const { latest } = await session($, on, DIRS, [])

  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)
  const chunks: unknown[] = []
  for await (const c of stream) chunks.push(c)
  await stream.result
  expect(chunks).toEqual([{ kind: 'text', index: 0, text: 'hello' }])
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('busy')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
})

test('a file tool call during an otherwise-busy turn takes over: busy becomes walking', async ($, on) => {
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  const { clock, latest, pane } = await session($, on, DIRS, [])

  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)) void _
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('busy')

  await $.tool.call({ tool: 'Read', file_path: `${CWD}/src/main.ts`, tool_use_id: 'r1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('walking')
  await clock.advance(120 * 30)
  expect(await pane.find({ text: 'main.ts' })).toBeDefined()
})

test('a Read the permission prompt denies flashes that file\'s row and gives the ant a mishap; both fade, and the ant still heads home', async ($, on) => {
  const { clock, latest, idles } = await session($, on, DIRS, [], [], () => ({ deny: 'no' }))

  await $.tool.call({ tool: 'Read', file_path: `${CWD}/src/main.ts`, tool_use_id: 'r1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toMatchObject({ kind: 'denied' })
  expect(latest.rows.find(r => r.path === 'src/main.ts')?.flash).toMatchObject({ kind: 'denied' })

  await clock.advance(120 * 15) // past MISHAP_TICKS: both fade away on their own
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toBeUndefined()
  expect(latest.rows.find(r => r.path === 'src/main.ts')?.flash).toBeUndefined()

  await clock.advance(120 * 150) // generous: the ant still drops the job and walks all the way home
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
  expect(await idles()).toBe(true)
})

test('a Bash call whose tool errored gives the ant an \'error\' mishap, with no row to flash (no file path); it fades once the turn ends, and the clock idles', async ($, on) => {
  on('turn.complete', () => ({ text: '' }) as never)
  const { clock, latest, idles } = await session($, on, DIRS, [], [], () => ({ isError: true, result: 'boom', text: 'boom' }))

  await $.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'b1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toMatchObject({ kind: 'error' })
  expect(latest.rows.every(r => r.flash === undefined)).toBe(true)

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  // home, but the mishap keeps the clock ticking (not idle) until it fades
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toBeDefined()

  await clock.advance(120 * 15)
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toBeUndefined()
  expect(await idles()).toBe(true)
})

test('a rejected tool.call also gives the ant an \'error\' mishap, and still rethrows', async ($, on) => {
  const { latest } = await session($, on, DIRS, [], [], () => {
    throw new Error('boom')
  })

  await expect($.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'b1' } as never)).rejects.toThrow()
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toMatchObject({ kind: 'error' })
})

test('a successful call sets neither a mishap nor a flash', async ($, on) => {
  const { latest } = await session($, on, DIRS, [])

  await $.tool.call({ tool: 'Read', file_path: `${CWD}/src/main.ts`, tool_use_id: 'r1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toBeUndefined()
  expect(latest.rows.every(r => r.flash === undefined)).toBe(true)
})

test('a subagent\'s fresh mishap survives its turn ending right after (retire), fading over MISHAP_TICKS instead of vanishing on the very next tick (regression)', async ($, on) => {
  on('turn.complete', () => ({ text: '' }) as never)
  const { clock, latest, idles } = await session($, on, DIRS, [], [], () => ({ isError: true, result: 'boom', text: 'boom' }))

  await $.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'b1', agentId: 'sub1' } as never)
  expect(latest.ants.find(a => a.id === 'sub1')?.mishap).toMatchObject({ kind: 'error' })

  // the agent's turn ends right after its failing call, the common case: register.tsx
  // runs retire(clearBusy(ant)), which must not wipe the mishap out along with it
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', agentId: 'sub1' } as never)
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('home')
  expect(latest.ants.find(a => a.id === 'sub1')).toBeDefined()

  await clock.advance(120) // one more tick: still there, the mishap only just fading
  expect(latest.ants.find(a => a.id === 'sub1')).toBeDefined()

  await clock.advance(120 * 15) // well past MISHAP_TICKS: now it's gone for good
  expect(latest.ants.find(a => a.id === 'sub1')).toBeUndefined()
  expect(await idles()).toBe(true)
})

test('a mishap from a queued (non-current) tool call doesn\'t paint onto the ant while its own, unrelated job is still live (regression)', async ($, on) => {
  let calls = 0
  let resolveA: (() => void) | undefined
  const toolCall = () => {
    calls++
    if (calls === 1) return new Promise(resolve => { resolveA = () => resolve({ result: 'ok' }) })
    return { deny: 'no' }
  }
  const { clock, latest } = await session($, on, DIRS, [], [], toolCall)

  const callA = $.tool.call({ tool: 'Read', file_path: `${CWD}/README.md`, tool_use_id: 'rA' } as never)
  await clock.advance(0) // let the hook's own pre-amble (assign, publish) land before A's call holds
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('walking') // took A over at once

  await $.tool.call({ tool: 'Read', file_path: `${CWD}/src/main.ts`, tool_use_id: 'rB' } as never)
  // B queues behind A (the ant is already walking) and is denied: its own row flashes,
  // but the ant - still visibly on A, which never failed - isn't painted with B's mishap
  expect(latest.rows.find(r => r.path === 'src/main.ts')?.flash).toMatchObject({ kind: 'denied' })
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toBeUndefined()
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('walking')

  resolveA?.()
  await callA
})

test('a mishap from a no-job call doesn\'t paint onto the ant while a separate file job of its own is still live (regression)', async ($, on) => {
  let calls = 0
  let resolveRead: (() => void) | undefined
  const toolCall = () => {
    calls++
    if (calls === 1) return new Promise(resolve => { resolveRead = () => resolve({ result: 'ok' }) })
    return { isError: true, result: 'boom', text: 'boom' }
  }
  const { clock, latest } = await session($, on, DIRS, [], [], toolCall)

  const callRead = $.tool.call({ tool: 'Read', file_path: `${CWD}/README.md`, tool_use_id: 'r1' } as never)
  await clock.advance(0)
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('walking')

  // a concurrent, no-file-path Bash call fails while the Read above is still in flight
  await $.tool.call({ tool: 'Bash', command: 'false', tool_use_id: 'b1' } as never)
  expect(latest.ants.find(a => a.id === 'main')?.mishap).toBeUndefined()
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('walking') // still visibly on the Read

  resolveRead?.()
  await callRead
})

test('agent.spawn marks the spawning ant busy', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'sub1' }) as never)
  const { latest } = await session($, on, DIRS, [])

  await $.agent.spawn({ prompt: 'look around' } as never)
  // the call's own loop (main, with no parentAgentId context from a flat test call) is busy
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('busy')
  expect(latest.ants.find(a => a.id === 'sub1')).toBeDefined()
  // the newly spawned ant is busy from frame one, not idle at home waiting for its
  // first tool.call/turn.step — it may run in the background for minutes before either
  expect(latest.ants.find(a => a.id === 'sub1')?.task).toBe('busy')
})

test('mainRow keeps the main ant\'s row visible over a farther, still-walking subagent, when both can\'t fit', async ($, on) => {
  const f = (name: string) => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })
  const names = Array.from({ length: 60 }, (_, i) => `f${String(i).padStart(2, '0')}.ts`)
  const dirs = { [CWD]: names.map(f) }
  // next(e) never resolves: finish() (in the hook's finally) never runs, so once an ant
  // arrives it parks in 'working' for good — a stable snapshot with both ants on the
  // tree at once, far apart, instead of chasing their exact race-y hole-gate timing.
  const { clock, latest, pane } = await session($, on, dirs as never, [], [], () => new Promise(() => {}))

  void $.tool.call({ tool: 'Read', file_path: `${CWD}/f02.ts`, tool_use_id: 'r1' } as never)
  void $.tool.call({ tool: 'Read', file_path: `${CWD}/f55.ts`, tool_use_id: 'r2', agentId: 'sub1' } as never)
  await clock.advance(120 * 90) // generous: both well past arrival, both parked indefinitely

  const main = latest.ants.find(a => a.id === 'main')!
  const sub = latest.ants.find(a => a.id === 'sub1')!
  expect(main.at).toBe(2)
  expect(sub.at).toBe(55)
  expect(main.task).toBe('working')
  expect(sub.task).toBe('working')

  // main's row stays visible even though the subagent, far below, would have been the
  // "lowest" (and so, under the old behavior, the one scrolled to) instead
  expect(await pane.find({ text: 'f02.ts' })).toBeDefined()
  expect(await pane.find({ text: 'f55.ts' })).toBeUndefined()
})

test('session.compact shows a fold for the compacting id, animates while next(e) is pending, then clears a few ticks after it resolves', async ($, on) => {
  let resolveCompact: (() => void) | undefined
  const gate = new Promise<void>(resolve => (resolveCompact = resolve))
  on('session.compact', async ($, e) => {
    await gate
    return { messages: e.messages.slice(3) }
  })
  const { clock, latest, idles } = await session($, on, DIRS, [])

  const messages = Array.from({ length: 12 }, () => ({ role: 'user', text: 'x', toolUses: [] })) as never
  const result = $.session.compact({ trigger: 'manual', messages } as never)
  await clock.advance(0) // let the hook's own pre-amble (markBusy, publish) land before the gate holds it
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('busy')
  expect(latest.folds).toEqual([expect.objectContaining({ id: 'main', before: 12 })])

  resolveCompact!()
  await result
  await clock.advance(0) // let the finally's publish land
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
  expect(latest.folds).toEqual([expect.objectContaining({ id: 'main', before: 12, after: 9 })])

  // the settled row holds for a few ticks, then disappears, and the clock goes idle again
  await clock.advance(120 * 10)
  expect(latest.folds).toEqual([])
  expect(await idles()).toBe(true)
})

test('a compaction the engine skipped clears the fold and the busy ant at once, with no settled row ever shown', async ($, on) => {
  on('session.compact', () => ({ skip: 'nothing worth compacting' }) as never)
  const { latest } = await session($, on, DIRS, [])

  const messages = Array.from({ length: 5 }, () => ({ role: 'user', text: 'x', toolUses: [] })) as never
  await $.session.compact({ trigger: 'manual', messages } as never)
  expect(latest.ants.find(a => a.id === 'main')?.task).toBe('home')
  expect(latest.folds.every(f => f.after === f.before)).toBe(true)
})

test('the clock ticks at full rate while only a busy (no-job) ant exists, not the slow idle wiggle', async ($, on) => {
  const { clock, latest } = await session($, on, DIRS, [])
  const before = latest.tick

  const call = $.tool.call({ tool: 'Bash', command: 'sleep 1', tool_use_id: 'b1' } as never)
  await clock.advance(120 * 5)
  expect(latest.tick).toBe(before + 5) // step() ran every tick, not the 4-tick idle wiggle
  await call
})

/** A full CommandRunInput for `/anthill <args>`: command.run's other fields are pinned/required. */
const anthillCommand = (args: string) => ({
  command: 'anthill',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
})

test('/anthill strip switches the layout to strip; /anthill with no args switches back to side', async ($, on) => {
  on('command.run', () => ({ text: 'ok' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  const { latest } = await session($, on, DIRS, [])

  const r1 = await $.command.run(anthillCommand('strip') as never)
  expect(latest.layout).toBe('strip')
  expect(r1.text?.toLowerCase()).toContain('strip')

  const r2 = await $.command.run(anthillCommand('') as never)
  expect(latest.layout).toBe('side')
  expect(r2.text?.toLowerCase()).toContain('open')
})

test('the strip above the prompt only draws once the layout is "strip", and yields while a survey holds the band', async ($, on) => {
  // our own AbovePrompt hook yields with next(e) whenever it has nothing to draw (not
  // "strip", or a survey holds the band); something has to be the bottom of that chain.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({ children: [] }) as never
  })
  on('ui.close', () => ({ value: undefined }) as never)
  const { latest } = await session($, on, DIRS, [])
  const stripProps = (hasSurvey: boolean) => ({
    hasSurvey,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  })

  const whileSide = await $.ui.mount({ plugin: 'anthill', surface: 'terminal', component: 'AbovePrompt', props: stripProps(false) as never })
  expect(await whileSide.find({ text: 'README.md' })).toBeUndefined() // layout is still 'side': draws nothing of ours

  await $.command.run(anthillCommand('strip') as never)
  expect(latest.layout).toBe('strip')
  const whileStrip = await $.ui.mount({ plugin: 'anthill', surface: 'terminal', component: 'AbovePrompt', props: stripProps(false) as never })
  expect(await whileStrip.find({ text: 'README.md' })).toBeDefined()

  const surveyed = await $.ui.mount({ plugin: 'anthill', surface: 'terminal', component: 'AbovePrompt', props: stripProps(true) as never })
  expect(await surveyed.find({ text: 'README.md' })).toBeUndefined()
})

test('session.measure sets the mound\'s growth stage from the context fill, against the threshold read at session.start', async ($, on) => {
  on('session.usage', () => ({ value: { context: { window: 1000, breakdown: { autoCompactThreshold: 800 } }, rateLimits: [] } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  const { latest } = await session($, on, DIRS, [])

  await $.session.measure({ context: { window: 1000, tokens: 400 }, rateLimits: [], changed: ['context'] } as never)
  expect(latest.growth).toBe(stageFor(400 / 800, GROWTH_STAGES))

  // a measurement that didn't move the context fill is ignored
  const before = latest.growth
  await $.session.measure({ context: { window: 1000, tokens: 400 }, rateLimits: [], changed: ['rateLimits'] } as never)
  expect(latest.growth).toBe(before)
})

test('a resolved main compaction resets the mound\'s growth and dug tunnels; a subagent\'s or a precompute does not', async ($, on) => {
  on('session.usage', () => ({ value: { context: { window: 1000, breakdown: { autoCompactThreshold: 800 } }, rateLimits: [] } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('session.compact', ($, e) => ({ messages: e.messages.slice(1) }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  const { clock, latest } = await session($, on, DIRS, [])

  await $.session.measure({ context: { window: 1000, tokens: 400 }, rateLimits: [], changed: ['context'] } as never)
  expect(latest.growth).toBeGreaterThan(0)
  // dig a cell in, so there's something to see reset alongside growth
  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'b1' } as never)
  await clock.advance(120 * 3)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  expect(latest.dug.length).toBeGreaterThan(0)

  const msgs = (n: number) => Array.from({ length: n }, () => ({ role: 'user', text: 'x', toolUses: [] }))

  // a subagent's own compaction never touches the mound
  await $.session.compact({ trigger: 'manual', agentId: 'sub1', messages: msgs(4) } as never)
  expect(latest.growth).toBeGreaterThan(0)
  expect(latest.dug.length).toBeGreaterThan(0)

  // a precompute never replaces the conversation; the mound stays as it is too
  await $.session.compact({ trigger: 'precompute', messages: msgs(4) } as never)
  expect(latest.growth).toBeGreaterThan(0)
  expect(latest.dug.length).toBeGreaterThan(0)

  // main's own resolved compaction: the mound goes back to its own starting shape
  await $.session.compact({ trigger: 'manual', messages: msgs(4) } as never)
  expect(latest.growth).toBe(0)
  expect(latest.dug).toEqual([])
})

test('a compaction the engine skipped leaves the mound\'s growth and dug tunnels as they were', async ($, on) => {
  on('session.usage', () => ({ value: { context: { window: 1000, breakdown: { autoCompactThreshold: 800 } }, rateLimits: [] } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('session.compact', () => ({ skip: 'nothing worth it' }) as never)
  const { latest } = await session($, on, DIRS, [])

  await $.session.measure({ context: { window: 1000, tokens: 400 }, rateLimits: [], changed: ['context'] } as never)
  expect(latest.growth).toBeGreaterThan(0)

  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'x', toolUses: [] }] } as never)
  expect(latest.growth).toBeGreaterThan(0)
})

test('a /clear resets the mound\'s growth and dug tunnels; another reason for the session ending does not', async ($, on) => {
  on('session.usage', () => ({ value: { context: { window: 1000, breakdown: { autoCompactThreshold: 800 } }, rateLimits: [] } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('session.end', ($, e) => ({ sessionId: (e as { sessionId?: string }).sessionId ?? 's1' }) as never)
  const { latest } = await session($, on, DIRS, [])

  await $.session.measure({ context: { window: 1000, tokens: 400 }, rateLimits: [], changed: ['context'] } as never)
  const before = latest.growth
  expect(before).toBeGreaterThan(0)

  await $.session.end({ reason: 'exit' } as never)
  expect(latest.growth).toBe(before)

  await $.session.end({ reason: 'clear' } as never)
  expect(latest.growth).toBe(0)
  expect(latest.dug).toEqual([])
})

test('a busy ant ticking digs tunnel cells into state, which stay put while it keeps going', async ($, on) => {
  on('turn.complete', () => ({ text: '' }) as never)
  const { clock, latest } = await session($, on, DIRS, [])

  await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'b1' } as never)
  await clock.advance(120 * 5)
  expect(latest.dug.length).toBeGreaterThan(0)
})

test('layout is restored from $.store at session.start, taking priority over the state atom', async ($, on) => {
  on('store.get', ($, e) => ({ value: (e as { key?: string }).key === 'layout' ? 'strip' : undefined }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.list', ($, e) => ({ value: DIRS[e.path] ?? [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({ children: [] }) as never
  })

  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: false })
  const strip = await $.ui.mount({
    plugin: 'anthill',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} } as never,
  })
  // layout came back as 'strip' from $.store, not the 'side' default
  expect(await strip.find({ text: 'README.md' })).toBeDefined()
})

test('pressing the pane\'s "▬ strip" button switches the layout to the strip and closes the pane', async ($, on) => {
  const closed: string[] = []
  on('ui.close', ($, e) => {
    closed.push((e as { id: string }).id)
    return { value: undefined } as never
  })
  const { latest, pane } = await session($, on, DIRS, [])

  await pane.press({ key: 'to-strip' })
  expect(latest.layout).toBe('strip')
  expect(closed).toEqual(['anthill'])
})

test('the strip draws the legend beside its "▮ side" button, so it never costs the mound or tree a row', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({ children: [] }) as never
  })
  on('ui.close', () => ({ value: undefined }) as never)
  const { latest } = await session($, on, DIRS, [])
  await $.command.run({ command: 'anthill', args: 'strip', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  expect(latest.layout).toBe('strip')

  const strip = await $.ui.mount({
    plugin: 'anthill',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 90, scroll: { offset: 0, bodyRows: 5 }, view: {} } as never,
  })
  expect(await strip.find({ text: /main \(opus\)/ })).toBeDefined()
  expect(await strip.find({ text: 'README.md' })).toBeDefined()
})

test('tunnel cells 0.3.0 saved as bare indices come back as dug cells, dug at the current tick', async ($, on) => {
  const { latest } = await session($, on, DIRS, [], [{ dug: [3, 5] }])
  expect(latest.dug).toEqual([
    { i: 3, at: expect.any(Number) },
    { i: 5, at: expect.any(Number) },
  ])
})

test('once the mound has grown, a busy ant digs on past the base tunnel, into the hump', async ($, on) => {
  on('session.usage', () => ({ value: { context: { window: 1000, breakdown: { autoCompactThreshold: 800 } }, rateLimits: [] } }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  const { clock, latest } = await session($, on, DIRS, [])

  await $.session.measure({ context: { window: 1000, tokens: 800 }, rateLimits: [], changed: ['context'] } as never)
  expect(latest.growth).toBe(GROWTH_STAGES - 1)
  expect(GROWTH.at(-1)!.tunnel.length).toBeGreaterThan(TUNNEL.length)

  void $.tool.call({ tool: 'Bash', command: 'sleep 9', tool_use_id: 'b1' } as never)
  await clock.advance(120 * 90) // long enough for the first seat to walk the whole grown route
  expect(Math.max(...latest.dug.map(d => d.i))).toBeGreaterThanOrEqual(TUNNEL.length)
})
