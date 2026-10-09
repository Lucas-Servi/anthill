import { mock, expect, test, type TestBody } from 'claude-code/testing'
import { HOME } from './mound'

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
  saved: { rows?: { path: string; built?: number }[]; ants?: { id: string; at: number; task: string }[] }[] = [],
) => {
  const clock = mock.clock(on)
  const latest = { rows: [] as { path: string; built?: number }[], ants: [] as { id: string; at: number; task: string }[], tick: 0, ticks: 0 }
  on('state.get', ($, e, next) => {
    const key = (e as { key?: string }).key as 'rows' | 'ants' | undefined
    const value = key && saved[0]?.[key]
    if (value) {
      delete saved[0]![key]
      return { value: { value, version: 1 } } as never
    }
    return next(e)
  })
  on('state.set', ($, e, next) => {
    const set = e as { key?: string; value?: unknown }
    if (set.key === 'rows') latest.rows = set.value as typeof latest.rows
    if (set.key === 'ants') latest.ants = set.value as typeof latest.ants
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
  on('tool.call', () => ({ result: 'ok' }) as never)
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
