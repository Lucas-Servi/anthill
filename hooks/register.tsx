import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Ant, Dug, Fold, Job, Layout, Mishap, Motion, Poke, Row } from '../types'
import {
  DANCE_CLICKS,
  DANCE_TICKS,
  HOME,
  MISHAP_TICKS,
  NOTICE_TICKS,
  POKE_TICKS,
  QUIET_MISHAP_TICKS,
  QUIET_NOTICE_TICKS,
  QUIET_POKE_TICKS,
  addPoke,
  assign,
  breedOf,
  clearBusy,
  colorFor,
  dig,
  drop,
  dropRows,
  fadePokes,
  finish,
  markBusy,
  newAnt,
  reconcile,
  retire,
  seatOrbits,
  seatPeeks,
  shiftForInsert,
  step,
  tallyClick,
} from './ants'
import { GROWTH_STAGES, SHAPES, stageFor, stageOf } from './mound'
import {
  QUIET_MAX_ETA_TICKS,
  QUIET_SETTLE_TICKS,
  SETTLE_TICKS,
  compactMs,
  compose,
  learnRate,
  legendLines,
  type Hit,
  type Line,
} from './render'
import type { MoundClientProps } from './mound-client'
import { ancestors, childRows, indexOf, insertRow, openDir, relativize } from './tree'

const PANE = 'anthill'
const TICK_MS = 120
const MAIN = 'main'
// How many idle timer firings between antennae wiggles, while every ant is home and
// there's nothing to crawl to: a slow idle animation, not the full simulation tick.
const IDLE_WIGGLE_EVERY = 4
// How often (in ticks) the tick loop sweeps $.agent.list() to retire ants whose subagent
// stopped without a turn.complete: about 3s at TICK_MS.
const RECONCILE_EVERY = 25
// How many rows the strip above the prompt may use at most, mound+tree+button together.
const STRIP_MAX_ROWS = 6
// How long after a click lands (on an ant or the mound alike) further clicks are ignored,
// so a burst of them can't stack toasts or pile up flinches. Wall-clock, not ticks: the
// simulation tick stands still while the colony is idle, but a click's cooldown shouldn't.
const CLICK_COOLDOWN_MS = 3000

const rowsAtom = atom({ plugin: 'anthill', key: 'rows' } as const, [] as Row[])
const antsAtom = atom({ plugin: 'anthill', key: 'ants' } as const, [] as Ant[])
const tickAtom = atom({ plugin: 'anthill', key: 'tick' } as const, 0)
const foldsAtom = atom({ plugin: 'anthill', key: 'folds' } as const, [] as Fold[])
const layoutAtom = atom({ plugin: 'anthill', key: 'layout' } as const, 'side' as Layout)
const growthAtom = atom({ plugin: 'anthill', key: 'growth' } as const, 0)
const dugAtom = atom({ plugin: 'anthill', key: 'dug' } as const, [] as Dug[])
const motionAtom = atom({ plugin: 'anthill', key: 'motion' } as const, 'full' as Motion)
const contextPercentAtom = atom({ plugin: 'anthill', key: 'contextPercent' } as const, 0)
const pokeAtom = atom({ plugin: 'anthill', key: 'poke' } as const, [] as Poke[])
const danceAtom = atom({ plugin: 'anthill', key: 'dance' } as const, 0)

// The module's own copy of the world; hooks change it synchronously so
// interleaved events never race, then publish() hands it to the drawing.
let rows: Row[] = []
let ants: Ant[] = []
let tick = 0
let folds: Fold[] = []
let cwd = ''
let spawned = 0
let layout: Layout = 'side'
/** The kill switch/reduced-motion mode: the usual colony, a calmer one, or none at all. */
let motion: Motion = 'full'
/** How full the mound is drawn: a growth stage, 0..GROWTH_STAGES - 1. */
let growth = 0
/** How full the context window is against the auto-compact threshold, as a round percent; 0 until measured. */
let contextPercent = 0
/** Tunnel cells some busy ant's dot has already dug through. */
let dug: Dug[] = []
/** Mound cells poked recently, each still flinching. */
let poke: Poke[] = []
/** Ticks left of the colony's dance; 0 when it isn't dancing. */
let dance = 0
/** Context tokens at which the mound reaches its last stage; read once at session.start. */
let growthThreshold = Infinity
/**
 * How many ms main's compactions have been taking per token of context (render.ts
 * learnRate), kept in $.store so the next session's are paced right from the first.
 */
let compactRate: number | undefined
const COMPACT_RATE_KEY = 'compactMsPerToken'
/** When the last click that did something landed ($.clock.now()), for CLICK_COOLDOWN_MS. */
let lastClickAt: number | undefined
/** When the mound clicks still counting toward a dance landed (ants.ts tallyClick), and when the last dance began. */
let moundClicks: number[] = []
let lastDanceAt: number | undefined

const publish = async ($: EngineInterface) => {
  ants = seatOrbits(seatPeeks(ants))
  await update($, rowsAtom, () => rows)
  await update($, antsAtom, () => ants)
  await update($, tickAtom, () => tick)
  await update($, foldsAtom, () => folds)
  await update($, growthAtom, () => growth)
  await update($, dugAtom, () => dug)
  await update($, contextPercentAtom, () => contextPercent)
  await update($, pokeAtom, () => poke)
  await update($, danceAtom, () => dance)
  // Two live reports of a frozen pane during a /compact and a working subagent turned
  // out to be an install running a stale build, not a redraw bug — so this isn't
  // confirmed necessary. It's kept anyway: $.ui.invalidate is the one documented way to
  // force a redraw outright, cheaper to call every publish() than to find out the hard
  // way that the implicit, throttled redraw-on-read-subscription path has a gap.
  $.ui.invalidate('ui.render')
}

/** Flips the layout, in state, in $.store (so it outlives the session) and on screen. */
const setLayout = async ($: EngineInterface, next: Layout) => {
  layout = next
  await update($, layoutAtom, () => layout)
  await $.store.set('layout', layout)
  $.ui.invalidate('ui.render')
}

/** `raw[key]` if it's one of `allowed`, else `fallback`. */
function pickOption<T extends string>(raw: PluginOptions, key: string, allowed: readonly T[], fallback: T): T {
  const value = raw[key]
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Flips the kill-switch/quiet mode, in state, in $.store (so it outlives the session) and on screen. */
const setMotion = async ($: EngineInterface, next: Motion) => {
  motion = next
  await update($, motionAtom, () => motion)
  await $.store.set('motion', motion)
  $.ui.invalidate('ui.render')
}

/** A fresh mishap's duration: full, or QUIET_MISHAP_TICKS while motion is 'quiet'. */
const mishapTicks = () => (motion === 'quiet' ? QUIET_MISHAP_TICKS : MISHAP_TICKS)

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

/**
 * Stamps an ant with the current tick, so reconcile() can tell one that's gone quiet
 * apart from one that's merely busy and unlisted (a Workflow's agent, say). Refreshed
 * wherever tool.call, turn.step or agent.spawn touch an ant; harmless on main, which
 * reconcile() never looks at.
 */
const touch = (ant: Ant): Ant => ({ ...ant, seenAt: tick })

/** Guards runReconcile so two sweeps never overlap. */
let reconciling = false

/**
 * Sweeps $.agent.list() and reconciles the ants as they stand once it resolves (not as
 * they stood when this started) against it, publishing only if something actually
 * changed. A failed list() call leaves the ants as they are, rather than retiring
 * anything on a guess — there's always a next sweep.
 */
const runReconcile = async ($: EngineInterface) => {
  if (reconciling) return
  reconciling = true
  try {
    const infos = await $.agent.list()
    const next = reconcile(ants, infos, tick, MAIN)
    if (next !== ants) {
      ants = next
      await publish($)
    }
  } catch {
    // Leave ants as they are; the next sweep gets another chance.
  } finally {
    reconciling = false
  }
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

/**
 * How much context main's compaction is folding, in tokens: the live figure, else a rough
 * count of the transcript itself (about 4 characters a token).
 */
const contextTokens = async ($: EngineInterface, messages: readonly unknown[]): Promise<number> => {
  try {
    const tokens = (await $.session.usage()).context.tokens
    if (tokens !== undefined && tokens > 0) return tokens
  } catch {
    // fall back on the transcript
  }
  try {
    return Math.round(JSON.stringify(messages).length / 4)
  } catch {
    return 0
  }
}

/** `$.clock.now()`, or undefined if the clock can't be read: the compaction just goes untimed. */
const now = async ($: EngineInterface): Promise<number | undefined> => {
  try {
    return await $.clock.now()
  } catch {
    return undefined
  }
}

/** Resets the mound to its unbuilt shape: a resolved compaction, or a /clear. */
const resetGrowth = () => {
  growth = 0
  dug = []
  contextPercent = 0
}

/** What an ant's toast says it's doing, for the person who just clicked it. */
const describeAnt = (ant: Ant): string => {
  if (ant.task === 'home') return 'idle'
  if (ant.task === 'busy') return 'digging'
  if (!ant.job) return ant.task === 'returning' ? 'heading home' : 'idle'
  const verb = ant.task === 'walking' ? 'walking to' : ant.task === 'building' ? 'building' : 'working on'
  return `${verb} ${ant.job.path}`
}

/** mound-client.tsx's post, as `surface.post({ hit, x, y })` sends it: code sent it, not a fact. */
type ClickMessage = { hit: Hit; x: number; y: number }
const isClickMessage = (data: unknown): data is ClickMessage => {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (typeof d.x !== 'number' || typeof d.y !== 'number' || !d.hit || typeof d.hit !== 'object') return false
  const hit = d.hit as Record<string, unknown>
  return hit.kind === 'mound' || (hit.kind === 'ant' && typeof hit.id === 'string')
}

export const register: Register = (on, options) => {
  const motionDefault = pickOption(options, 'motion', ['full', 'quiet', 'off'] as const, 'full')

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    cwd = e.cwd.replace(/\/+$/, '')
    rows = await read($, rowsAtom)
    tick = await read($, tickAtom)
    // Ants saved by older versions sat at -1 for home; home is now inside the summit
    // hole. `seenAt` is newer still: an ant saved before it existed gets the
    // just-loaded tick stamped on now, the same way `at` is normalized here, so a
    // long-lived session's reconcile() doesn't mistake it for one that's been silent
    // since tick 0 and retire it as stale on the very first sweep after this loads.
    ants = (await read($, antsAtom)).map(a => {
      const homed = a.task === 'home' || a.at < HOME ? { ...a, at: HOME } : a
      return homed.seenAt === undefined ? { ...homed, seenAt: tick } : homed
    })
    // A fold left with no `after` means the process died mid-compaction: nothing is
    // left to resolve it, so it would otherwise sit forever.
    folds = (await read($, foldsAtom)).filter(f => f.after !== undefined)
    // 0.3.0 saved a bare index per dug cell; it gets the current tick as when it was dug.
    dug = ((await read($, dugAtom)) as unknown[]).flatMap((d): Dug[] =>
      typeof d === 'number' ? [{ i: d, at: tick }] : d && typeof d === 'object' ? [d as Dug] : [],
    )
    poke = await read($, pokeAtom)
    dance = await read($, danceAtom)
    lastClickAt = undefined
    moundClicks = []
    lastDanceAt = undefined
    growth = await read($, growthAtom)
    contextPercent = await read($, contextPercentAtom)
    // $.store, not just $.state, since this is the one thing meant to outlive the
    // session itself (a /clear, a brand-new session): fall back to the atom (an older
    // save, or a session that hasn't gone through $.store yet), then 'side'.
    const stored = await $.store.get('layout')
    layout = stored === 'strip' || stored === 'side' ? stored : (await read($, layoutAtom)) ?? 'side'
    const storedMotion = await $.store.get('motion')
    motion = storedMotion === 'full' || storedMotion === 'quiet' || storedMotion === 'off' ? storedMotion : motionDefault
    const rate = await $.store.get(COMPACT_RATE_KEY)
    compactRate = typeof rate === 'number' && rate > 0 ? rate : undefined
    spawned = Math.max(0, ants.length - 1)
    // Files a failed call put on the tree in an older version (or deleted since) leave
    // their rows behind: drop any saved file row whose file isn't on disk any more.
    const onDisk = await Promise.all(rows.map(r => (r.isDir ? true : $.fs.exists(`${cwd}/${r.path}`))))
    const missing = new Set(rows.filter((_, i) => !onDisk[i]).map(r => r.path))
    ;({ rows, ants } = dropRows(rows, ants, r => missing.has(r.path)))
    if (rows.length === 0) await listInto($, '', 0)
    if (!ants.some(a => a.id === MAIN)) antFor(MAIN, 'main', await $.session.model())

    // How full the context window really is right now, so a reloaded or resumed session
    // doesn't start the mound looking freshly dug when the conversation is already long.
    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      growthThreshold = usage.context.breakdown?.autoCompactThreshold ?? usage.context.window
      const fill = usage.context.tokens === undefined ? undefined : usage.context.tokens / growthThreshold
      growth = stageFor(fill, GROWTH_STAGES)
      contextPercent = fill === undefined || !(fill >= 0) ? 0 : Math.round(fill * 100)
    } catch {
      // Leave growth and contextPercent as whatever state had: the mound just won't grow further this session.
    }

    await publish($)

    await $.command.register({
      name: 'anthill',
      description:
        'Show the ant colony: "strip" moves it above the prompt, "side" (or nothing) back to the pane; '
        + '"quiet" calms the animation, "off" turns it off (either until "full" turns it back on)',
    })
    if (e.isInteractive && layout === 'side' && motion !== 'off') void $.ui.open({ id: PANE, title: 'Anthill' })

    let idleTicks = 0
    $.clock.every(TICK_MS, () => {
      // The kill switch: nothing animates, nothing ticks, nothing to redraw. Cheap too —
      // every firing is this one check instead of a full step()/publish() pass.
      if (motion === 'off') return
      const busy =
        ants.some(a => a.task !== 'home' || a.leaving || a.mishap || a.notice) ||
        rows.some(r => r.built !== undefined || r.flash) ||
        folds.length > 0 ||
        poke.length > 0 ||
        dance > 0
      if (!busy) {
        // Nothing to crawl to: the ants resting in the hole still look busy down
        // there, with a slow antennae wiggle (dropped in quiet mode). The simulation
        // tick itself (and anything that depends on it, like the mound's sparkle)
        // stays put, so an idle session doesn't keep ticking it.
        idleTicks++
        if (idleTicks % IDLE_WIGGLE_EVERY === 0 && motion !== 'quiet' && ants.some(a => a.task === 'home')) {
          ants = ants.map(a => (a.task === 'home' ? { ...a, frame: a.frame + 1 } : a))
          void update($, antsAtom, () => ants)
          $.ui.invalidate('ui.render')
        }
        // A subagent's ant that reconcile() only idled (not retired, since a message
        // may yet resume it) stops counting as busy at once, so if it was the only
        // thing keeping the colony busy, nothing above would ever check on it again.
        // A lighter sweep on the same cadence, even while idle, still does: if its
        // agent later really did end, this retires it, `leaving` makes the colony
        // busy again on the very next firing, and the loop above takes it home.
        if (idleTicks % RECONCILE_EVERY === 0 && ants.some(a => a.id !== MAIN)) void runReconcile($)
        return
      }
      idleTicks = 0
      tick++
      ;({ ants, rows } = step(ants, rows))
      // dig along the route of the mound as it's drawn now: a grown one's runs into its hump
      // (skipped in quiet mode: the busy dot itself still moves, just without the decoration)
      if (motion !== 'quiet') {
        const route = stageOf(SHAPES[layout === 'strip' ? 'horizontal' : 'vertical'], growth).tunnel
        dug = dig(dug, ants, route.length, tick)
      }
      poke = fadePokes(poke)
      if (dance > 0) dance--
      folds = folds
        .map(f => (f.settle !== undefined ? { ...f, settle: f.settle - 1 } : { ...f, frame: f.frame + 1 }))
        // (a settled fold's frame stays put: `peak` already says how far the tree folded)
        .filter(f => f.settle === undefined || f.settle > 0)
      // Every few seconds, while some subagent's ant exists, check it's still really
      // there: one that was stopped, failed or killed without a turn.complete would
      // otherwise dig (and keep this very loop ticking) forever.
      if (tick % RECONCILE_EVERY === 0 && ants.some(a => a.id !== MAIN)) void runReconcile($)
      void publish($)
    })

    return ran
  })

  on('command.run', { command: 'anthill' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const offNotice = 'The anthill is off. "/anthill full" (or "quiet") turns it back on.'
    if (arg === 'quiet' || arg === 'full' || arg === 'off') {
      await setMotion($, arg)
      if (arg === 'off') await $.ui.close({ id: PANE })
      return { text: arg === 'off' ? offNotice : `The anthill's animation is now ${arg}.` }
    }
    if (arg === 'strip') {
      await setLayout($, 'strip')
      await $.ui.close({ id: PANE })
      return { text: 'The anthill moved to the strip above the prompt.' }
    }
    await setLayout($, 'side')
    if (motion !== 'off') await $.ui.open({ id: PANE, title: 'Anthill' })
    return { text: motion === 'off' ? offNotice : 'The anthill is open.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const parent = ants.find(a => a.id === (e.parentAgentId ?? MAIN))
    if (parent) setAnt(touch(markBusy(parent)))
    const started = await next(e)
    if (started.agentId) {
      const ant = antFor(started.agentId, e.subagentType || 'agent', started.model)
      // Busy from frame one: a background subagent may run for minutes before its
      // first tool.call/turn.step lands, and markBusy is a no-op on anything already
      // past 'home', so this is harmless if it's ever already further along.
      setAnt(touch(markBusy({ ...ant, label: e.subagentType || ant.label, breed: breedOf(started.model) })))
    }
    await publish($)
    return started
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (cwd === '') return next(e)
    const id = e.agentId ?? MAIN
    // jobOf is the gate: a resolvable file/dir path gets the walk-to-file animation;
    // anything else (Bash, WebSearch, mcp__*, the Agent tool itself, ...) just shows
    // busy, with no file to point to.
    const job = await jobOf($, e as unknown as Record<string, unknown>)
    const ant = antFor(id, id === MAIN ? 'main' : 'agent')
    setAnt(touch(job ? assign(ant, job) : markBusy(ant)))
    await publish($)
    // What next(e) settles to: a mishap to show on the ant (and the job's row, if any),
    // or undefined for an answered, non-error call. A rejection counts as an error too.
    let mishap: Mishap | undefined
    try {
      const result = await next(e)
      if (result.deny !== undefined) mishap = { kind: 'denied', ticks: mishapTicks() }
      else if (result.isError) mishap = { kind: 'error', ticks: mishapTicks() }
      return result
    } catch (err) {
      mishap = { kind: 'error', ticks: mishapTicks() }
      throw err
    } finally {
      const cur = ants.find(a => a.id === id)
      if (job) {
        // The ant only takes the mishap when this call's job is the one it's actually,
        // visibly on right now: then it stumbles and drops the job at once, turning
        // back wherever it is, rather than walking on to a file the call never worked
        // on. A second, queued call (two parallel Reads, say) failing while the first
        // is still in flight would otherwise paint the mishap onto an ant plainly busy
        // with an unrelated, unaffected job: that job is just finished as on a clean
        // call, and the row's own flash below is signal enough for it.
        const onAnt = mishap !== undefined && cur?.job?.id === job.id
        if (cur) setAnt(touch(onAnt ? drop({ ...cur, mishap }, job.id) : finish(cur, job.id)))
        if (mishap) {
          // A path the failed call named that isn't on disk (a Read of a missing file, a
          // Write that never wrote its new one) only flashes, then step() removes it.
          const ghost = !(await $.fs.exists(`${cwd}/${job.path}`))
          const at = indexOf(rows, job.path)
          const flagged = (r: Row): Row => (ghost ? { ...r, flash: mishap!, ghost: true } : { ...r, flash: mishap! })
          if (at !== -1) rows = rows.map((r, i) => (i === at ? flagged(r) : r))
        }
        await publish($)
      } else if (mishap) {
        // Likewise: a no-job call (Bash, say) only decorates the ant when it has no
        // separate file job of its own in progress to misattribute this failure to.
        if (cur && !cur.job) setAnt({ ...cur, mishap })
        await publish($)
      }
      // A no-job, mishap-free call's busy state stays set until turn.complete, or a
      // later tool.call on this id brings a real job (assign() takes over at once).
    }
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId ?? MAIN
    const ant = markBusy(antFor(id, id === MAIN ? 'main' : 'agent'))
    // Refresh main's breed as the turn starts too, not just once it ends: a
    // /model switch between turns should show up right away, not only after
    // the next turn.complete (seen live: /model to Opus mid-session left the
    // legend reading "main (sonnet)" for the whole next, still-running turn).
    setAnt(touch(id === MAIN ? { ...ant, breed: breedOf(e.model) } : ant))
    await publish($)
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    const ant = ants.find(a => a.id === (e.agentId ?? MAIN))
    if (ant) setAnt(e.agentId ? retire(clearBusy(ant)) : clearBusy(ant))
    if (!e.agentId) {
      // The person may have switched models with /model.
      const main = ants.find(a => a.id === MAIN)
      if (main) setAnt({ ...main, breed: breedOf(await $.session.model()) })
    }
    await publish($)
    return ran
  })

  on('session.compact', async ($, e, next) => {
    // A precompute only works a summary out ahead of time, folding nothing yet: the
    // compaction that later uses it is the one shown.
    if (e.trigger === 'precompute') return next(e)
    const id = e.agentId ?? MAIN
    const ant = antFor(id, id === MAIN ? 'main' : 'agent')
    setAnt(markBusy(ant))
    // main's own compaction folds the tree and refactors the mound, paced to last about as
    // long as folding this much context should take; a subagent's only shows its header
    const tokens = e.agentId ? 0 : await contextTokens($, e.messages)
    const startedAt = e.agentId ? undefined : await now($)
    const paced = {
      isMain: true as const,
      eta: Math.max(
        1,
        Math.min(
          motion === 'quiet' ? QUIET_MAX_ETA_TICKS : Infinity,
          Math.round(compactMs(tokens, compactRate) / TICK_MS),
        ),
      ),
      grown: growth,
    }
    folds = [...folds, { id, label: ant.label, before: e.messages.length, frame: 0, ...(e.agentId ? {} : paced) }]
    await publish($)
    try {
      const result = await next(e)
      const before = folds.find(f => f.id === id)?.before ?? e.messages.length
      const after = result.skip !== undefined ? before : result.messages.length
      folds = folds.map(f =>
        f.id === id ? { ...f, after, settle: motion === 'quiet' ? QUIET_SETTLE_TICKS : SETTLE_TICKS, peak: f.frame } : f,
      )
      // A resolved compaction of main's own conversation (not skipped) shrinks it back down:
      // the mound and its dug tunnels go back to their own starting shape too. A subagent's
      // own compaction never touches the mound at all.
      if (!e.agentId && result.skip === undefined) {
        resetGrowth()
        // Learn how long that took, only when the summarizer really ran (`usage`): not a
        // summary reused from a precompute, nor a hook's answer in core's place.
        const endedAt = result.usage && startedAt !== undefined ? await now($) : undefined
        if (endedAt !== undefined) {
          compactRate = learnRate(compactRate, result.tokensBefore ?? tokens, endedAt - startedAt!)
          if (compactRate !== undefined) void $.store.set(COMPACT_RATE_KEY, compactRate)
        }
      }
      await publish($)
      return result
    } finally {
      const cur = ants.find(a => a.id === id)
      if (cur) setAnt(clearBusy(cur))
      await publish($)
      // No $.clock.sleep here (it would count against this hook's own budget): the
      // settled "(summarized ...)" row's countdown is paid for by the tick loop above.
    }
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    const ran = await next(e)
    // /clear starts a fresh conversation under this same session; nothing else resets
    // the mound for it (no session.start follows a /clear), so this is the one place to.
    if (e.reason === 'clear') {
      resetGrowth()
      await publish($)
    }
    return ran
  })

  on('session.measure', async ($, e, next) => {
    const ran = await next(e)
    // Always the session's own (main's) live context — there's no agentId to filter on;
    // a subagent's turns don't raise this event at all.
    if (e.changed.includes('context')) {
      const fill = e.context.tokens === undefined ? undefined : e.context.tokens / growthThreshold
      growth = stageFor(fill, GROWTH_STAGES)
      contextPercent = fill === undefined || !(fill >= 0) ? 0 : Math.round(fill * 100)
      await publish($)
    }
    return ran
  })

  // A click mound-client.tsx's `onPointer` hit-tested against its own last drawing: an
  // ant (by id) gets a brief, cheerful notice and a toast of what it's doing; a plain
  // mound cell gets a brief flinch where it was clicked. Neither ever lasts.
  on('ui.message', async ($, e, next) => {
    if (e.component !== 'Pane' || !isClickMessage(e.data)) return next(e)
    const { hit, x, y } = e.data
    // Still cooling down from the last click: heard, and ignored. A clock that can't be
    // read just goes ungated rather than swallowing every click.
    const at = await now($)
    if (at !== undefined && lastClickAt !== undefined && at - lastClickAt < CLICK_COOLDOWN_MS) return {}
    if (hit.kind === 'ant') {
      const ant = ants.find(a => a.id === hit.id)
      if (ant) {
        lastClickAt = at
        setAnt({ ...ant, notice: { ticks: motion === 'quiet' ? QUIET_NOTICE_TICKS : NOTICE_TICKS } })
        $.ui.toast(`${ant.label} (${ant.breed}): ${describeAnt(ant)}`)
        await publish($)
      }
    } else {
      lastClickAt = at
      poke = addPoke(poke, y, x, motion === 'quiet' ? QUIET_POKE_TICKS : POKE_TICKS)
      // Enough pokes in a minute, and long enough since the last time: the colony dances.
      // Quiet mode keeps the toast but skips the dance itself (it's all motion).
      if (at !== undefined) {
        const tally = tallyClick(moundClicks, at, lastDanceAt)
        moundClicks = tally.clicks
        if (tally.dance) {
          lastDanceAt = at
          if (motion !== 'quiet') dance = DANCE_TICKS
          $.ui.toast(`The ants are dancing! (${DANCE_CLICKS} pokes in a minute)`)
        }
      }
      await publish($)
    }
    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    // Client (so a click can be hit-tested) exists on terminal and desktop today, not
    // vscode or mobile: there, this falls back to the engine's own default drawing.
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const { Box, Button, Client } = $.ui.resolve(e)
    const readAnts = await read($, antsAtom)
    const main = readAnts.find(a => a.id === MAIN)
    const width = Math.max(10, e.props.bodyColumns || 40)
    const height = Math.max(8, e.props.scroll.bodyRows || 30)
    // One row held for the layout button below, outside the Client (it isn't clickable
    // content, and the Client only ever reports a click inside its own region anyway).
    const bodyHeight = height - 1
    // Client props cross into a separate, sandboxed module as plain JSON: no key may
    // hold `undefined` (mainRow's own, past this point), unlike compose()'s own opts.
    const clientProps: MoundClientProps = {
      rows: await read($, rowsAtom),
      ants: readAnts,
      folds: await read($, foldsAtom),
      opts: {
        width,
        height: bodyHeight,
        tick: await read($, tickAtom),
        growth: await read($, growthAtom),
        dug: await read($, dugAtom),
        contextPercent: await read($, contextPercentAtom),
        quiet: motion === 'quiet' || motion === 'off',
        poke: await read($, pokeAtom),
        dance: (await read($, danceAtom)) > 0,
        ...(main && main.at >= 0 ? { mainRow: main.at } : {}),
      },
    }

    return (
      <Box flexDirection="column">
        {Client({ key: 'mound', module: './mound-client.tsx', width, height: bodyHeight, props: clientProps })}
        <Box justifyContent="flex-end">
          <Button
            key="to-strip"
            plain
            dimColor
            hotkey="h"
            label="▬ strip"
            onPress={() => {
              void setLayout($, 'strip')
              void $.ui.close({ id: PANE })
            }}
          />
        </Box>
      </Box>
    )
  })

  // The band directly above the prompt: a short, wide strip the "▬ strip" button (or
  // `/anthill strip`) switches to instead of the docked/inline pane. Always-on and
  // shared, unlike Pane — it hides itself (by answering next(e), the engine's own empty
  // draw) whenever the layout isn't "strip", or a survey is using the band instead.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || layout !== 'strip' || motion === 'off') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const readAnts = await read($, antsAtom)
    const main = readAnts.find(a => a.id === MAIN)
    const width = Math.max(10, e.props.bodyColumns || 40)
    const height = Math.max(3, Math.min(e.props.maxRows, STRIP_MAX_ROWS) - 1) // one row held for the button
    const tickNow = await read($, tickAtom)
    const cp = await read($, contextPercentAtom)
    const lines = compose(await read($, rowsAtom), readAnts, await read($, foldsAtom), {
      width,
      height,
      tick: tickNow,
      mainRow: main && main.at >= 0 ? main.at : undefined,
      orientation: 'horizontal',
      growth: await read($, growthAtom),
      dug: await read($, dugAtom),
      legend: false, // drawn beside the button below instead, so it never costs the strip a row
      contextPercent: cp,
      quiet: motion === 'quiet',
      poke: await read($, pokeAtom),
      dance: (await read($, danceAtom)) > 0,
    })
    // the legend's first line (plus the context readout), leaving the button room at the row's end
    const legendRow: Line =
      legendLines(readAnts, Math.max(10, width - 12), tickNow, cp ? `${cp}% to compact` : undefined)[0] ?? []

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
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            {legendRow.map(seg => (
              <Text color={seg.color} dimColor={seg.dim}>
                {seg.text}
              </Text>
            ))}
          </Text>
          <Button
            key="to-side"
            plain
            dimColor
            hotkey="s"
            label="▮ side"
            onPress={() => {
              void setLayout($, 'side')
              void $.ui.open({ id: PANE, title: 'Anthill' })
            }}
          />
        </Box>
      </Box>
    )
  })
}
