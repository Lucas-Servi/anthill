import { mock, expect, test, type TestBody } from 'claude-code/testing'
import { GROWTH_STAGES, HOME, stageFor } from './mound'

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
    rows?: { path: string; built?: number }[]
    ants?: { id: string; at: number; task: string }[]
    folds?: { id: string; before: number; after?: number; settle?: number }[]
    layout?: 'side' | 'strip'
    growth?: number
    dug?: number[]
  }[] = [],
  /** Overrides the default instant-'ok' tool.call response, e.g. to park an ant mid-job. */
  toolCall: () => unknown = () => ({ result: 'ok' }),
) => {
  const clock = mock.clock(on)
  const latest = {
    rows: [] as { path: string; built?: number }[],
    ants: [] as { id: string; at: number; task: string }[],
    folds: [] as { id: string; before: number; after?: number; settle?: number }[],
    layout: 'side' as 'side' | 'strip',
    growth: 0,
    dug: [] as number[],
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
    if (set.key === 'dug') latest.dug = set.value as number[]
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
