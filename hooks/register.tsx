import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ant, Job, Row } from '../types'
import { HOME, assign, breedOf, colorFor, finish, newAnt, retire, seatPeeks, shiftForInsert, step } from './ants'
import { compose } from './render'
import { ancestors, childRows, indexOf, insertRow, openDir, relativize } from './tree'

const PANE = 'anthill'
const TICK_MS = 120
const MAIN = 'main'
// How many idle timer firings between antennae wiggles, while every ant is home and
// there's nothing to crawl to: a slow idle animation, not the full simulation tick.
const IDLE_WIGGLE_EVERY = 4

const rowsAtom = atom({ plugin: 'anthill', key: 'rows' } as const, [] as Row[])
const antsAtom = atom({ plugin: 'anthill', key: 'ants' } as const, [] as Ant[])
const tickAtom = atom({ plugin: 'anthill', key: 'tick' } as const, 0)

// The module's own copy of the world; hooks change it synchronously so
// interleaved events never race, then publish() hands it to the drawing.
let rows: Row[] = []
let ants: Ant[] = []
let tick = 0
let cwd = ''
let spawned = 0

const publish = async ($: EngineInterface) => {
  ants = seatPeeks(ants)
  await update($, rowsAtom, () => rows)
  await update($, antsAtom, () => ants)
  await update($, tickAtom, () => tick)
}

const antFor = (id: string, label = 'agent', model?: string): Ant => {
  let ant = ants.find(a => a.id === id)
  if (!ant) {
    ant = newAnt(id, label, breedOf(model), colorFor(id === MAIN ? 0 : ++spawned))
    ants = [...ants, ant]
  }
  return ant
}

const setAnt = (ant: Ant) => {
  ants = ants.map(a => (a.id === ant.id ? ant : a))
}

const listInto = async ($: EngineInterface, dir: string, depth: number) => {
  const entries = await $.fs.list(dir === '' ? cwd : `${cwd}/${dir}`)
  // the dir's children go in right below it: ants further down move down with their rows
  const at = indexOf(rows, dir)
  const before = rows.length
  rows = openDir(rows, dir, childRows(dir, depth, entries))
  if (at !== -1) ants = shiftForInsert(ants, at + 1, rows.length - before)
}

/** Opens every directory above `path`, so its row can be shown. */
const reveal = async ($: EngineInterface, path: string) => {
  for (const dir of ancestors(path)) {
    const row = rows[indexOf(rows, dir)]
    if (!row) return false
    if (!row.isOpen) await listInto($, dir, row.depth + 1)
  }
  return true
}

/** Puts `path` on the tree; a file not yet on disk becomes a branch to build. */
const place = async ($: EngineInterface, path: string, isDir: boolean, isNew: boolean) => {
  if (!(await reveal($, path))) return false
  if (indexOf(rows, path) !== -1) return true
  const row: Row = {
    path,
    name: path.split('/').at(-1) ?? path,
    depth: path.split('/').length - 1,
    isDir,
    ...(isNew ? { built: 0 } : {}),
  }
  const placed = insertRow(rows, row)
  rows = placed.rows
  ants = shiftForInsert(ants, placed.index)
  return true
}

/** What a tool call means for its ant: a path to visit, and whether to build it. */
const jobOf = async ($: EngineInterface, e: Record<string, unknown>) => {
  const tool = String(e.tool)
  const raw =
    tool === 'Glob' || tool === 'Grep'
      ? (e.path as string | undefined) ?? cwd
      : ((e.file_path ?? e.notebook_path) as string | undefined)
  if (!raw) return undefined
  const path = relativize(cwd, raw)
  if (path === null || path === '') return undefined
  const isDir = tool === 'Glob' || tool === 'Grep'
  const isNew = tool === 'Write' && !(await $.fs.exists(raw))
  if (!(await place($, path, isDir, isNew))) return undefined
  const job: Job = { id: String(e.tool_use_id), path, kind: isNew ? 'build' : 'work' }
  return job
}

const TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    cwd = e.cwd.replace(/\/+$/, '')
    rows = await read($, rowsAtom)
    // Ants saved by older versions sat at -1 for home; home is now inside the summit hole.
    ants = (await read($, antsAtom)).map(a => (a.task === 'home' || a.at < HOME ? { ...a, at: HOME } : a))
    tick = await read($, tickAtom)
    spawned = Math.max(0, ants.length - 1)
    if (rows.length === 0) await listInto($, '', 0)
    if (!ants.some(a => a.id === MAIN)) antFor(MAIN, 'main', await $.session.model())
    await publish($)

    await $.command.register({ name: 'anthill', description: 'Show the ant colony crawling your file tree' })
    if (e.isInteractive) void $.ui.open({ id: PANE, title: 'Anthill' })

    let idleTicks = 0
    $.clock.every(TICK_MS, () => {
      const busy = ants.some(a => a.task !== 'home' || a.leaving) || rows.some(r => r.built !== undefined)
      if (!busy) {
        // Nothing to crawl to: the ants resting in the hole still look busy down
        // there, with a slow antennae wiggle. The simulation tick itself (and
        // anything that depends on it, like the mound's sparkle) stays put, so an
        // idle session doesn't keep ticking it.
        idleTicks++
        if (idleTicks % IDLE_WIGGLE_EVERY === 0 && ants.some(a => a.task === 'home')) {
          ants = ants.map(a => (a.task === 'home' ? { ...a, frame: a.frame + 1 } : a))
          void update($, antsAtom, () => ants)
        }
        return
      }
      idleTicks = 0
      tick++
      ;({ ants, rows } = step(ants, rows))
      void publish($)
    })

    return ran
  })

  on('command.run', { command: 'anthill' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Anthill' })
    return { text: 'The anthill is open.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      const ant = antFor(started.agentId, e.subagentType || 'agent', started.model)
      setAnt({ ...ant, label: e.subagentType || ant.label, breed: breedOf(started.model) })
      await publish($)
    }
    return started
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (!TOOLS.has(String(e.tool)) || cwd === '') return next(e)
    const job = await jobOf($, e as unknown as Record<string, unknown>)
    if (!job) return next(e)
    const id = e.agentId ?? MAIN
    setAnt(assign(antFor(id, id === MAIN ? 'main' : 'agent'), job))
    await publish($)
    try {
      return await next(e)
    } finally {
      const ant = ants.find(a => a.id === id)
      if (ant) setAnt(finish(ant, job.id))
      await publish($)
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId) {
      const ant = ants.find(a => a.id === e.agentId)
      if (ant) setAnt(retire(ant))
    } else {
      // The person may have switched models with /model.
      const ant = ants.find(a => a.id === MAIN)
      if (ant) setAnt({ ...ant, breed: breedOf(await $.session.model()) })
    }
    await publish($)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lines = compose(await read($, rowsAtom), await read($, antsAtom), {
      width: Math.max(10, e.props.bodyColumns || 40),
      height: Math.max(8, e.props.scroll.bodyRows || 30),
      tick: await read($, tickAtom),
    })

    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text wrap="truncate-end">
            {line.map(seg => (
              <Text color={seg.color} backgroundColor={seg.bg} dimColor={seg.dim} bold={seg.bold}>
                {seg.text}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}
