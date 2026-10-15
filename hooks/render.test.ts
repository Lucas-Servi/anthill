import { test, expect } from 'claude-code/testing'
import type { Row, Ant, Breed, Fold } from '../types'
import { assign, markBusy, seatOrbits, seatPeeks } from './ants'
import { foldTree, foldProgress, compactMs, learnRate, COMPACT_BASE_MS, COMPACT_MS_PER_TOKEN, SETTLE_TICKS, MOUND, MISHAP_COLORS, MISHAP_MARK, PEEK, antGlyph, dugSprite, legendLines, workFx, compose, lineText, type Line } from './render'
import {
  GROWTH,
  GROWTH_STAGES,
  HOLE,
  HOME,
  H_GROWTH,
  H_HOLE,
  H_MOUND,
  H_MOUND_MASK,
  H_PEEKS,
  H_SPARKLE_LINE,
  H_SUMMIT,
  H_TRAIL,
  H_TRAIL_STEPS,
  H_TUNNEL,
  SHAPES,
  MOUND_MASK,
  MOUND_PALETTE,
  PEEKS,
  SPARKLE_LINE,
  SUMMIT,
  TRAIL,
  TRAIL_STEPS,
  TREE_INDENT,
  TUNNEL,
  glyphStart,
  stageOf,
  type MoundShape,
} from './mound'

/** A number rounded to 6 places, for comparing computed fractions. */
const approx = (n: unknown): number => Math.round((n as number) * 1e6) / 1e6

const BREEDS: Breed[] = ['haiku', 'sonnet', 'opus', 'fable', 'other']

const row = (over: Partial<Row>): Row => ({
  path: over.name ?? 'x',
  name: 'x',
  depth: 0,
  isDir: false,
  ...over,
})

const ant = (over: Partial<Ant>): Ant => ({
  id: 'a',
  label: 'a',
  breed: 'sonnet',
  color: '#ff0000',
  at: HOME,
  task: 'home',
  queue: [],
  doneIds: [],
  frame: 0,
  ...over,
})

test('each breed glyph has a stable width across frames', () => {
  for (const breed of BREEDS) {
    const widths = new Set<number>()
    for (const frame of [0, 1, 2, 3]) {
      for (const task of ['walking', 'working', 'building', 'returning'] as const) {
        widths.add(Array.from(antGlyph(breed, task, frame)).length)
      }
    }
    expect(widths.size).toBe(1)
  }
})

test('breed glyphs differ from one another', () => {
  const seen = new Set<string>()
  for (const breed of BREEDS) {
    const g = antGlyph(breed, 'walking', 0)
    expect(seen.has(g)).toBe(false)
    seen.add(g)
  }
})

test('compose respects height and width', () => {
  const rows: Row[] = Array.from({ length: 30 }, (_, i) =>
    row({ name: `f${i}.ts`, path: `f${i}.ts`, depth: 0 }),
  )
  const ants: Ant[] = [ant({ id: 'a1', at: 5, task: 'working' })]
  const lines = compose(rows, ants, [], { width: 20, height: 15, tick: 0 })
  expect(lines.length <= 15).toBe(true)
  for (const l of lines) expect(Array.from(lineText(l)).length <= 20).toBe(true)
})

test('a working ant appears on its row with fx', () => {
  const rows: Row[] = [row({ name: 'main.ts', path: 'main.ts' })]
  const ants: Ant[] = [ant({ id: 'a1', at: 0, task: 'working', color: '#00ff00', frame: 0 })]
  const lines = compose(rows, ants, [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('main.ts'))
  expect(treeLine).toBeDefined()
  const text = lineText(treeLine!)
  expect(text.includes(antGlyph('sonnet', 'working', 0))).toBe(true)
  expect(text.includes(workFx('working', 0))).toBe(true)
})

test('a walking ant appears in the gutter before the name', () => {
  const rows: Row[] = [row({ name: 'util.ts', path: 'util.ts' })]
  const ants: Ant[] = [ant({ id: 'a1', at: 0, task: 'walking', frame: 0 })]
  const lines = compose(rows, ants, [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('util.ts'))
  expect(treeLine).toBeDefined()
  const text = lineText(treeLine!)
  const glyph = antGlyph('sonnet', 'walking', 0)
  expect(text.indexOf(glyph) < text.indexOf('util.ts')).toBe(true)
})

test('scroll keeps a deep ant visible', () => {
  const rows: Row[] = Array.from({ length: 50 }, (_, i) =>
    row({ name: `f${i}.ts`, path: `f${i}.ts`, depth: 0 }),
  )
  const ants: Ant[] = [ant({ id: 'a1', at: 45, task: 'working' })]
  const lines = compose(rows, ants, [], { width: 30, height: 15, tick: 0 })
  const found = lines.some(l => lineText(l).includes('f45.ts'))
  expect(found).toBe(true)
})

test('legend lists each ant', () => {
  const rows: Row[] = [row({ name: 'a.ts', path: 'a.ts' })]
  const ants: Ant[] = [
    ant({ id: 'a1', label: 'main', breed: 'haiku', at: HOME, task: 'home' }),
    ant({ id: 'a2', label: 'worker', breed: 'opus', at: 0, task: 'building' }),
  ]
  const lines = compose(rows, ants, [], { width: 80, height: 20, tick: 0 })
  const all = lines.map(lineText).join('\n')
  expect(all.includes('main (haiku)')).toBe(true)
  expect(all.includes('worker (opus)')).toBe(true)
})

test('legendLines appends the context readout, dim, after every ant\'s own item', () => {
  const ants: Ant[] = [ant({ id: 'a1', label: 'main', breed: 'haiku' })]
  const withExtra = legendLines(ants, 80, 0, '63% to compact')
  expect(lineText(withExtra.at(-1)!)).toContain('63% to compact')
  const extraSeg = withExtra.at(-1)!.find(s => s.text === '63% to compact')!
  expect(extraSeg.dim).toBe(true)
  expect(extraSeg.color).toBeUndefined()
  // opt-in only: omitting it changes nothing
  expect(lineText(legendLines(ants, 80, 0).at(-1)!)).not.toContain('to compact')
})

test('compose shows the context readout in the legend when given, omits it when not', () => {
  const ants: Ant[] = [ant({ id: 'main', label: 'main', breed: 'opus', task: 'working', at: 0 })]
  const withPercent = compose(TREE, ants, [], { width: 80, height: 20, tick: 0, contextPercent: 63 })
  expect(withPercent.some(l => lineText(l).includes('63% to compact'))).toBe(true)
  const without = compose(TREE, ants, [], { width: 80, height: 20, tick: 0 })
  expect(without.some(l => lineText(l).includes('to compact'))).toBe(false)
})

test('MOUND is a small block', () => {
  expect(MOUND.length >= 4 && MOUND.length <= 7).toBe(true)
  for (const l of MOUND) expect(Array.from(l).length <= 24).toBe(true)
})

/** A line as one { ch, color } per code point. */
const cells = (line: Line | undefined): { ch: string; color?: string; bold?: boolean }[] =>
  (line ?? []).flatMap(seg => Array.from(seg.text).map(ch => ({ ch, color: seg.color, bold: seg.bold })))

const TREE: Row[] = [
  row({ name: 'src', path: 'src', isDir: true, isOpen: true }),
  row({ name: 'main.ts', path: 'src/main.ts', depth: 1 }),
  row({ name: 'README.md', path: 'README.md' }),
]

test('MOUND_MASK covers every mound cell with a known color', () => {
  expect(MOUND_MASK.length).toBe(MOUND.length)
  MOUND.forEach((line, i) => {
    const chars = Array.from(line)
    const keys = Array.from(MOUND_MASK[i]!)
    expect(keys.length).toBe(chars.length)
    chars.forEach((ch, c) => {
      expect(keys[c] === ' ').toBe(ch === ' ')
      if (ch !== ' ') expect(MOUND_PALETTE[keys[c]!] !== undefined).toBe(true)
    })
  })
})

test('H_MOUND is a short, wide block', () => {
  expect(H_MOUND.length <= 5).toBe(true)
  for (const l of H_MOUND) expect(Array.from(l).length <= 40).toBe(true)
})

test('H_MOUND_MASK covers every H_MOUND cell with a known color', () => {
  expect(H_MOUND_MASK.length).toBe(H_MOUND.length)
  H_MOUND.forEach((line, i) => {
    const chars = Array.from(line)
    const keys = Array.from(H_MOUND_MASK[i]!)
    expect(keys.length).toBe(chars.length)
    chars.forEach((ch, c) => {
      expect(keys[c] === ' ').toBe(ch === ' ')
      if (ch !== ' ') expect(MOUND_PALETTE[keys[c]!] !== undefined).toBe(true)
    })
  })
})

test('the horizontal trail keeps the same shape as the vertical one, so ants.ts needs no changes', () => {
  expect(H_TRAIL_STEPS).toBe(TRAIL_STEPS)
  expect(H_TRAIL.length).toBe(TRAIL.length)
  expect(H_SUMMIT).toBe(SUMMIT)
})

test('the side door is gone; the hole is a dark pit in the summit', () => {
  const all = MOUND.join('\n')
  for (const door of ['▛', '▜', '▘', '▝']) expect(all.includes(door)).toBe(false)
  const lines = compose([], [], [], { width: 40, height: 20, tick: 0 })
  const mouth = cells(lines[HOLE.line])
  const well = cells(lines[HOLE.line + 1])
  for (let c = HOLE.start; c <= HOLE.end; c++) {
    expect(mouth[c]!.color).toBe(MOUND_PALETTE.H)
    expect(well[c]!.color).toBe(MOUND_PALETTE.H)
  }
  // raised rims on both sides of the mouth
  expect(mouth[HOLE.start - 1]!.ch).toBe('▟')
  expect(mouth[HOLE.end + 1]!.ch).toBe('▙')
})

test('the sparkle line twinkles and is colored by the sparkle shown', () => {
  const at = (tick: number) => cells(compose([], [], [], { width: 40, height: 20, tick })[SPARKLE_LINE])
  const a = at(0)
  const b = at(1)
  expect(a.map(c => c.ch).join('') === b.map(c => c.ch).join('')).toBe(false)
  for (const c of [...a, ...b]) {
    if (c.ch === '.') expect(c.color).toBe(MOUND_PALETTE.w)
    if (c.ch === '*' || c.ch === "'") expect(c.color).toBe(MOUND_PALETTE.k)
  }
})

test('the trail starts in the hole and ends beside the trunk, above tree row 0', () => {
  expect(TRAIL.length).toBe(TRAIL_STEPS)
  const first = TRAIL[0]!
  expect(first.line >= HOLE.line && first.col >= HOLE.start && first.col <= HOLE.end).toBe(true)
  const last = TRAIL.at(-1)!
  expect(last.line).toBe(MOUND.length - 1)
  // every step moves down at most one line and a few columns
  TRAIL.slice(1).forEach((p, i) => {
    const q = TRAIL[i]!
    expect(Math.abs(p.line - q.line) <= 1).toBe(true)
    expect(Math.abs(glyphStart(p, 5) - glyphStart(q, 5)) <= 3).toBe(true)
  })
})

test('the trunk stands right above the tree root connectors', () => {
  const lines = compose(TREE, [], [], { width: 40, height: 20, tick: 0 })
  const trunk = Array.from(lineText(lines[MOUND.length - 1]!)).indexOf('│')
  const row0 = Array.from(lineText(lines[MOUND.length]!))
  expect(trunk).toBe(TREE_INDENT)
  expect(row0.findIndex(ch => ch !== ' ')).toBe(trunk)
  expect(row0[trunk]).toBe('├')
})

test('an ant on the trail is drawn on its mound line, centered on its trail point', () => {
  for (const breed of BREEDS) {
    for (const task of ['walking', 'returning'] as const) {
      TRAIL.forEach((p, k) => {
        const a = ant({ breed, task, at: k - TRAIL_STEPS, frame: k, color: '#123456' })
        const lines = compose(TREE, [a], [], { width: 40, height: 20, tick: k })
        const glyph = Array.from(antGlyph(breed, task, k))
        const start = glyphStart(p, glyph.length)
        expect(start >= 0).toBe(true)
        const line = cells(lines[p.line])
        expect(line.slice(start, start + glyph.length).map(c => c.ch).join('')).toBe(glyph.join(''))
        for (const c of line.slice(start, start + glyph.length)) expect(c.color).toBe('#123456')
        // and nowhere on the tree
        for (const l of lines.slice(MOUND.length, MOUND.length + TREE.length)) {
          expect(lineText(l).includes(glyph.join(''))).toBe(false)
        }
      })
    }
  }
})

test('beside the trunk, ants sharing the point stand side by side', () => {
  const k = TRAIL.length - 1
  const a = ant({ id: 'a', breed: 'opus', task: 'walking', at: k - TRAIL_STEPS, color: '#111111' })
  const b = ant({ id: 'b', breed: 'haiku', task: 'returning', at: k - TRAIL_STEPS, color: '#222222' })
  const lines = compose(TREE, [a, b], [], { width: 40, height: 20, tick: 0 })
  const line = lineText(lines[TRAIL[k]!.line]!)
  expect(line.includes(antGlyph('opus', 'walking', 0) + antGlyph('haiku', 'returning', 0))).toBe(true)
})

test('a second ant on a summit or flank point is drawn where it stood a tick ago, not inside the mound', () => {
  for (let k = 0; k < TRAIL.length - 1; k++) {
    for (const task of ['walking', 'returning'] as const) {
      for (const breed of BREEDS) {
        const first = ant({ id: 'a', breed: 'opus', task: task === 'walking' ? 'returning' : 'walking', at: k - TRAIL_STEPS, color: '#111111' })
        const second = ant({ id: 'b', breed, task, at: k - TRAIL_STEPS, color: '#222222' })
        const lines = compose(TREE, [first, second], [], { width: 40, height: 20, tick: 0 })
        const p = TRAIL[k]!
        const glyph = antGlyph('opus', first.task, 0)
        const g2 = antGlyph(breed, task, 0)
        const drawn = (color: string) =>
          lines.slice(0, MOUND.length).flatMap((l, li) => cells(l).flatMap((c, col) => (c.color === color ? [{ ...c, li, col }] : [])))
        // the second stands a point back along its way: up the trail if going out, down it if going home
        const back = task === 'walking' ? k - 1 : k + 1
        if (back < 0) {
          // down in the well there's nowhere further back: side by side
          expect(lineText(lines[p.line]!).includes(glyph + g2)).toBe(true)
          continue
        }
        const q = TRAIL[back]!
        const one = drawn('#111111')
        const two = drawn('#222222')
        expect(one.map(c => c.ch).join('')).toBe(glyph)
        expect(two.map(c => c.ch).join('')).toBe(g2)
        expect(one.every(c => c.li === p.line)).toBe(true)
        expect(two.every(c => c.li === q.line)).toBe(true)
        if (q.line !== p.line) {
          // each right on its point: the first keeps it
          expect(one[0]!.col).toBe(glyphStart(p, 5))
          expect(two[0]!.col).toBe(glyphStart(q, Array.from(g2).length))
        }
      }
    }
  }
})

test('home ants peek out of the hole in their own colors, no colony row', () => {
  const home = [
    ant({ id: 'm', color: '#aa0000' }),
    ant({ id: 's1', color: '#00aa00' }),
    ant({ id: 's2', color: '#0000aa' }),
    ant({ id: 's3', color: '#aaaa00' }),
  ]
  for (let n = 1; n <= home.length; n++) {
    const lines = compose(TREE, home.slice(0, n), [], { width: 40, height: 20, tick: 0 })
    // the tree starts right below the mound
    expect(lineText(lines[MOUND.length]!).includes('src/')).toBe(true)
    const shown = Math.min(n, PEEKS.length)
    PEEKS.forEach((p, slot) => {
      const c = cells(lines[p.line])[p.col]!
      if (slot < shown) {
        expect(c.ch).toBe(PEEK)
        expect(c.color).toBe(home[slot]!.color)
        expect(c.bold).toBe(true)
      } else {
        expect(c.color).toBe(MOUND_PALETTE.H)
      }
    })
    // at least one cell of the pit stays dark
    const dark = [HOLE.line, HOLE.line + 1].flatMap(l => cells(lines[l]).slice(HOLE.start, HOLE.end + 1))
    expect(dark.some(c => c.color === MOUND_PALETTE.H)).toBe(true)
  }
})

/** A line as one { ch, color, bg } per code point. */
const cellsBg = (line: Line | undefined): { ch: string; color?: string; bg?: string }[] =>
  (line ?? []).flatMap(seg => Array.from(seg.text).map(ch => ({ ch, color: seg.color, bg: seg.bg })))

test('antennae and ants in the hole keep its dark ground, so it shows on light terminals too', () => {
  const home = ['#ffff5f', '#5fffff', '#5fff5f'].map((color, i) => ant({ id: `h${i}`, color }))
  const lines = compose(TREE, home, [], { width: 40, height: 20, tick: 0 })
  PEEKS.forEach(p => {
    const c = cellsBg(lines[p.line])[p.col]!
    expect(c.ch).toBe(PEEK)
    expect(c.bg).toBe(MOUND_PALETTE.H)
  })
  // an ant down in the well: the cells of the hole under it stay dark, the rest of it doesn't
  const well = TRAIL[0]!
  const a = ant({ breed: 'opus', task: 'walking', at: -TRAIL_STEPS, color: '#5f87ff' })
  const bare = cellsBg(compose(TREE, [], [], { width: 40, height: 20, tick: 0 })[well.line])
  const drawn = cellsBg(compose(TREE, [a], [], { width: 40, height: 20, tick: 0 })[well.line])
  const start = glyphStart(well, 5)
  for (let col = start; col < start + 5; col++) {
    expect(drawn[col]!.color).toBe('#5f87ff')
    expect(drawn[col]!.bg).toBe(bare[col]!.color === MOUND_PALETTE.H ? MOUND_PALETTE.H : undefined)
  }
  expect(drawn.slice(start, start + 5).some(c => c.bg === MOUND_PALETTE.H)).toBe(true)
  // nothing else in the picture has a background
  for (const l of compose(TREE, [], [], { width: 40, height: 20, tick: 0 })) for (const seg of l) expect(seg.bg).toBeUndefined()
})

/** The color of the antennae at each peek slot (undefined where none peek). */
const peekColors = (ants: Ant[]): (string | undefined)[] => {
  const lines = compose(TREE, ants, [], { width: 40, height: 20, tick: 0 })
  return PEEKS.map(p => {
    const c = cells(lines[p.line])[p.col]!
    return c.ch === PEEK ? c.color : undefined
  })
}

test('a home ant keeps its peek slot when the ant before it leaves', () => {
  // seated as register.tsx publishes them, then the first ant sets out
  const [m, s] = seatPeeks([ant({ id: 'm', color: '#aa0000' }), ant({ id: 's', color: '#00aa00' })])
  expect(peekColors([m!, s!])).toEqual(['#aa0000', '#00aa00', undefined])
  const after = seatPeeks([{ ...m!, task: 'walking', at: HOME + 1 }, s!])
  expect(peekColors(after)).toEqual([undefined, '#00aa00', undefined])
})

test('antennae stay put when an earlier ant is removed or a seat frees up', () => {
  // [main, Explore, Plan] at home; Explore finishes and is removed from the list
  const [main, explore, plan] = seatPeeks(['#aa0000', '#00aa00', '#0000aa'].map((color, i) => ant({ id: `a${i}`, color })))
  expect(peekColors(seatPeeks([main!, plan!]))).toEqual(['#aa0000', undefined, '#0000aa'])
  void explore

  // 4 ants, one out on the tree: the fourth home ant keeps its seat when main sets out
  const four = seatPeeks([
    ant({ id: 'm', color: '#aa0000' }),
    ant({ id: 'b', color: '#00aa00' }),
    ant({ id: 'c', color: '#0000aa', task: 'working', at: 2 }),
    ant({ id: 'd', color: '#aaaa00' }),
  ])
  expect(peekColors(four)).toEqual(['#aa0000', '#00aa00', '#aaaa00'])
  // (main walks on the tree, clear of the hole: just out of it, its glyph would cover the well's seat)
  const out = seatPeeks(four.map(a => (a.id === 'm' ? { ...a, task: 'walking' as const, at: 1 } : a)))
  expect(out.map(a => a.peek)).toEqual([undefined, 1, undefined, 2])
  expect(peekColors(out)).toEqual([undefined, '#00aa00', '#aaaa00'])
  // a seat frees up: a newcomer takes it, nobody else moves
  const back = seatPeeks([...out, ant({ id: 'e', color: '#00aaaa' })])
  expect(peekColors(back)).toEqual(['#00aaaa', '#00aa00', '#aaaa00'])
})

test('one peeking ant leaves the hole mouth symmetric: both mouth cells dark full height', () => {
  for (const n of [1, 2]) {
    const home = ['#ff5f5f', '#5fff5f'].slice(0, n).map((color, i) => ant({ id: `h${i}`, color }))
    const mouth = cellsBg(compose(TREE, home, [], { width: 40, height: 20, tick: 0 })[HOLE.line])
    for (let col = HOLE.start; col <= HOLE.end; col++) expect(mouth[col]!.bg).toBe(MOUND_PALETTE.H)
  }
})

test('scrolling fits the "more" markers and the whole legend, and short panes still show the ant', () => {
  const tall = Array.from({ length: 40 }, (_, i) => row({ name: `f${String(i).padStart(2, '0')}.ts` }))
  for (const height of [9, 10, 11, 12, 14, 20, 30, 40]) {
    for (let at = 0; at < tall.length; at++) {
      const a = ant({ breed: 'opus', task: 'working', at, color: '#ff5f5f' })
      const lines = compose(tall, [a], [], { width: 40, height, tick: 0 })
      expect(lines.length <= height).toBe(true)
      // the legend is the last line, whole
      expect(lineText(lines.at(-1)!)).toBe(antGlyph('opus', 'working', 0) + ' a (opus)')
      // the ant's row is on screen
      expect(lines.some(l => lineText(l).includes(`f${String(at).padStart(2, '0')}.ts`))).toBe(true)
    }
  }
})

test('an ant sent out but still in the hole keeps peeking', () => {
  const a = ant({ task: 'walking', at: HOME, color: '#abcdef' })
  const lines = compose(TREE, [a], [], { width: 40, height: 20, tick: 0 })
  const slot = PEEKS[0]!
  expect(cells(lines[slot.line])[slot.col]!.color).toBe('#abcdef')
})

test('every line fits the width at 25, 40 and 60 columns', () => {
  const rows: Row[] = [
    row({ name: 'deeply', path: 'deeply', isDir: true, isOpen: true }),
    row({ name: 'nested', path: 'deeply/nested', depth: 1, isDir: true, isOpen: true }),
    row({ name: 'a_rather_long_file_name.ts', path: 'deeply/nested/a_rather_long_file_name.ts', depth: 2 }),
    row({ name: 'README.md', path: 'README.md' }),
  ]
  const crowd: Ant[] = [
    ant({ id: 'h', label: 'main' }),
    ...TRAIL.map((_, k) => ant({ id: `t${k}`, label: `trail${k}`, breed: BREEDS[k % BREEDS.length]!, task: 'walking', at: k - TRAIL_STEPS })),
    ant({ id: 'x', label: 'twin', breed: 'fable', task: 'returning', at: TRAIL_STEPS - 1 - TRAIL_STEPS }),
    ant({ id: 'w', label: 'worker', breed: 'opus', task: 'working', at: 2 }),
    ant({ id: 'b', label: 'builder', breed: 'sonnet', task: 'building', at: 3 }),
    ant({ id: 'c', label: 'climber', breed: 'haiku', task: 'walking', at: 2, climbDepth: 0 }),
  ]
  for (const width of [25, 40, 60]) {
    for (let tick = 0; tick < 4; tick++) {
      const lines = compose(rows, crowd, [], { width, height: 30, tick })
      for (const l of lines) expect(Array.from(lineText(l)).length <= width).toBe(true)
    }
  }
})

test('tree rows and "more" markers are indented under the trunk', () => {
  const rows: Row[] = Array.from({ length: 40 }, (_, i) => row({ name: `f${i}.ts`, path: `f${i}.ts` }))
  const lines = compose(rows, [ant({ at: 30, task: 'working' })], [], { width: 40, height: 20, tick: 0 })
  const tree = lines.slice(MOUND.length).map(lineText).filter(t => !t.includes('(sonnet)'))
  expect(tree.some(t => t.includes('more'))).toBe(true)
  for (const t of tree) expect(t.startsWith(' '.repeat(TREE_INDENT)) && t[TREE_INDENT] !== ' ').toBe(true)
})

/**
 * Each trail ant's glyph shows exactly once on the mound, whole and in its own color, on
 * the line of its own point, or (crowded off it) of a point it just came from.
 */
const expectWholeOnTrail = (ants: Ant[], lines: Line[]) => {
  for (const a of ants) {
    const glyph = antGlyph(a.breed, a.task, a.frame)
    const k = a.at + TRAIL_STEPS
    const way = a.task === 'returning' ? 1 : -1
    const allowed = new Set([TRAIL[k]!.line])
    for (let j = 1; j < ants.length; j++) {
      const p = TRAIL[k + way * j]
      if (p) allowed.add(p.line)
    }
    const drawn = lines.slice(0, MOUND.length).flatMap((l, li) => {
      const mine = cells(l).flatMap((c, col) => (c.color === a.color ? [{ ...c, col }] : []))
      return mine.length ? [{ li, mine }] : []
    })
    expect(drawn.length).toBe(1)
    const { li, mine } = drawn[0]!
    expect(allowed.has(li)).toBe(true)
    expect(mine.map(c => c.ch).join('')).toBe(glyph)
    expect(mine.at(-1)!.col - mine[0]!.col + 1).toBe(mine.length)
  }
}

test('ants on neighbouring summit points never cover one another', () => {
  const pairs: [Breed, Breed][] = [['opus', 'opus'], ['opus', 'haiku'], ['haiku', 'opus'], ['fable', 'sonnet'], ['sonnet', 'fable']]
  const summit = TRAIL.flatMap((p, k) => (p.line === TRAIL[1]!.line ? [k] : []))
  expect(summit.length >= 3).toBe(true)
  for (const [b1, b2] of pairs) {
    for (const k1 of summit) {
      for (const k2 of summit) {
        if (k1 === k2) continue
        for (const t1 of ['walking', 'returning'] as const) {
          for (const t2 of ['walking', 'returning'] as const) {
            for (const frame of [0, 1]) {
              const ants = [
                ant({ id: 'a', breed: b1, task: t1, at: k1 - TRAIL_STEPS, frame, color: '#111111' }),
                ant({ id: 'b', breed: b2, task: t2, at: k2 - TRAIL_STEPS, frame: frame + 1, color: '#222222' }),
              ]
              expectWholeOnTrail(ants, compose(TREE, ants, [], { width: 40, height: 20, tick: frame }))
            }
          }
        }
      }
    }
  }
})

test('any two trail ants, of any breeds, are both drawn whole', () => {
  for (const b1 of BREEDS) {
    for (const b2 of BREEDS) {
      TRAIL.forEach((_, k1) => {
        TRAIL.forEach((_, k2) => {
          const ants = [
            ant({ id: 'a', breed: b1, task: 'returning', at: k1 - TRAIL_STEPS, color: '#111111' }),
            ant({ id: 'b', breed: b2, task: 'walking', at: k2 - TRAIL_STEPS, color: '#222222' }),
          ]
          expectWholeOnTrail(ants, compose(TREE, ants, [], { width: 40, height: 20, tick: 0 }))
        })
      })
    }
  }
})

test('a crowd on the summit and flank lines is drawn whole, one glyph per ant', () => {
  const crowds: number[][] = [[1, 2, 3], [1, 1, 2], [2, 3, 3], [0, 4, 4], [1, 3, 3, 2], [7, 7, 7]]
  for (const ks of crowds) {
    for (const breed of ['opus', 'fable', 'sonnet', 'haiku'] as const) {
      const ants = ks.map((k, i) =>
        ant({ id: `c${i}`, breed, task: i % 2 ? 'walking' : 'returning', at: k - TRAIL_STEPS, color: `#0000${i}${i}` }),
      )
      expectWholeOnTrail(ants, compose(TREE, ants, [], { width: 40, height: 20, tick: 0 }))
    }
  }
})

test('an ant crowded off its summit point steps aside, the one nearer the hole stays put', () => {
  const near = ant({ id: 'n', breed: 'opus', task: 'returning', at: 1 - TRAIL_STEPS, color: '#111111' })
  const far = ant({ id: 'f', breed: 'opus', task: 'walking', at: 2 - TRAIL_STEPS, color: '#222222' })
  const line = cells(compose(TREE, [far, near], [], { width: 40, height: 20, tick: 0 })[TRAIL[1]!.line])
  const startOf = (color: string) => line.findIndex(c => c.color === color)
  expect(startOf('#111111')).toBe(glyphStart(TRAIL[1]!, 5))
  // further along the trail (leftward), right beside it
  expect(startOf('#222222')).toBe(glyphStart(TRAIL[1]!, 5) - 5)
})

test('a resting ant\'s antennae wiggle between two frames as its own frame advances, not with tick', () => {
  const a = ant({ id: 'm', color: '#ff5f5f', frame: 0 })
  const slot = PEEKS[0]!
  const atFrame = (frame: number) => cells(compose(TREE, [{ ...a, frame }], [], { width: 40, height: 20, tick: 99 })[slot.line])[slot.col]!.ch
  expect(atFrame(0)).toBe(PEEK)
  expect(atFrame(1)).not.toBe(PEEK)
  expect(atFrame(2)).toBe(PEEK)
  expect(atFrame(3)).toBe(atFrame(1))
  // the tick (the mound's own sparkle counter) never moves the antennae
  expect(cells(compose(TREE, [a], [], { width: 40, height: 20, tick: 0 })[slot.line])[slot.col]!.ch).toBe(atFrame(0))
})

test('TUNNEL cells are all on the shaded body, disjoint from TRAIL/PEEKS/HOLE/the sparkle line, and form one winding path', () => {
  const occupied = new Set<string>()
  for (const p of TRAIL) occupied.add(`${p.line},${p.col}`)
  for (const p of PEEKS) occupied.add(`${p.line},${p.col}`)
  for (let c = HOLE.start; c <= HOLE.end; c++) occupied.add(`${HOLE.line},${c}`)

  const seen = new Set<string>()
  for (const p of TUNNEL) {
    expect(p.line).not.toBe(SPARKLE_LINE)
    expect(occupied.has(`${p.line},${p.col}`)).toBe(false)
    expect(['o', 'd', 'l']).toContain(Array.from(MOUND_MASK[p.line]!)[p.col])
    seen.add(`${p.line},${p.col}`)
  }
  expect(seen.size).toBe(TUNNEL.length) // no cell visited twice
  for (let i = 1; i < TUNNEL.length; i++) {
    const a = TUNNEL[i - 1]!, b = TUNNEL[i]!
    expect(Math.abs(a.line - b.line) + Math.abs(a.col - b.col)).toBe(1) // every step touches the last
  }
})

test('a busy ant draws a dot inside the mound, in its own color, with no peeking antennae', () => {
  const busy = seatOrbits([markBusy(ant({ color: '#5f87ff' }))])[0]!
  const lines = compose(TREE, [busy], [], { width: 40, height: 20, tick: 0 })
  const dots = TUNNEL.filter(p => cells(lines[p.line])[p.col]?.color === '#5f87ff')
  expect(dots.length).toBe(1)
  // no antennae anywhere: a busy ant never holds a peek seat
  for (const p of PEEKS) expect(cells(lines[p.line])[p.col]?.ch).not.toBe(PEEK)
})

test('two busy ants, seated on different seats, draw two distinct colored dots at a frame where their routes don\'t cross', () => {
  const busy = seatOrbits(['#ff5f5f', '#5fff5f'].map(color => markBusy(ant({ id: color, color }))))
  expect(busy[0]!.busySeat).not.toBe(busy[1]!.busySeat)
  const lines = compose(TREE, busy.map(a => ({ ...a, frame: 0 })), [], { width: 40, height: 20, tick: 0 })
  const found = busy.map(a => {
    const hit = TUNNEL.filter(p => cells(lines[p.line])[p.col]?.color === a.color)
    expect(hit.length).toBe(1)
    return hit[0]!
  })
  expect(found[0]!.line === found[1]!.line && found[0]!.col === found[1]!.col).toBe(false)
})

test('cells a busy ant\'s dot has passed stay dug, drawn as that cell\'s own sprite, under the dot where it currently sits', () => {
  const busy = { ...seatOrbits([markBusy(ant({ color: '#5f87ff' }))])[0]!, frame: 4 }
  const dugCell = TUNNEL[0]! // seat 0, frame 0: the ant started here before reaching frame 4
  const lines = compose(TREE, [busy], [], { width: 40, height: 20, tick: 50, dug: [{ i: 0, at: 0 }] })
  const drawn = cells(lines[dugCell.line])[dugCell.col]!
  const sprite = dugSprite(0, 50)
  expect(drawn.ch).toBe(sprite.ch)
  expect(drawn.color).toBe(sprite.color)
})

test('a busy ant that gets a real file job stops digging and starts walking that same tick', () => {
  const busy = seatOrbits([markBusy(ant({ color: '#ff8700' }))])[0]!
  const walking = assign(busy, { id: 'j', path: 'README.md', kind: 'work' })
  expect(walking.task).toBe('walking')
  const lines = compose(TREE, [walking], [], { width: 40, height: 20, tick: 0 })
  for (const p of TUNNEL) expect(cells(lines[p.line])[p.col]?.color).not.toBe('#ff8700')
})

test('compose reserves room for fold blocks above the tree, same precedence as the mound and legend', () => {
  const fold: Fold = { id: 'main', label: 'main', before: 12, frame: 0 }
  const lines = compose(TREE, [], [fold], { width: 40, height: 20, tick: 0 })
  const all = lines.map(lineText).join('\n')
  expect(all.includes('folding its memory')).toBe(true)
  // a short pane trims tree rows first, never the fold block
  const tall = Array.from({ length: 20 }, (_, i) => row({ name: `f${i}.ts`, path: `f${i}.ts` }))
  const short = compose(tall, [], [fold], { width: 40, height: 10, tick: 0 })
  expect(short.map(lineText).join('\n').includes('folding its memory')).toBe(true)
})

test('a running fold\'s header says it\'s folding, its spinner turning frame to frame; a resolved one shows the real counts', () => {
  const header = (f: Fold) => compose(TREE, [], [f], { width: 60, height: 20, tick: 0 }).map(lineText).find(l => l.includes('memory'))!
  const running = header({ id: 'main', label: 'main', before: 9, frame: 0 })
  expect(running).toContain('main folding its memory')
  expect(header({ id: 'main', label: 'main', before: 9, frame: 1 })).not.toBe(running) // the spinner moved
  expect(header({ id: 'main', label: 'main', before: 9, after: 2, frame: 4, settle: 3 })).toContain("main's memory folded: 9 → 2 messages")
  const skipped = compose(TREE, [], [{ id: 'main', label: 'main', before: 9, after: 9, frame: 4, settle: 3 }], { width: 60, height: 20, tick: 0 })
  expect(skipped.map(lineText).join('\n')).toContain('main: nothing to fold')
})

test('a climbing ant\'s glyph overlays the shallower ancestor column, not the row\'s own prefix end', () => {
  const a = ant({ id: 'a1', at: 1, task: 'walking', climbDepth: 0, color: '#123456' })
  const lines = compose(TREE, [a], [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('main.ts'))!
  const text = lineText(treeLine)
  const glyph = antGlyph('sonnet', 'walking', 0)
  // overlaid right after the indent, over the ancestor's trunk column — not appended before the name
  expect(text.startsWith(' '.repeat(TREE_INDENT) + glyph)).toBe(true)
  expect(text.indexOf(glyph) < text.indexOf('main.ts')).toBe(true)
  // colored as the overlay, not the row's own dim prefix
  const colored = treeLine.find(s => s.color === '#123456')
  expect(colored?.text.startsWith(glyph[0]!)).toBe(true)
})

test('a non-climbing ant (climbDepth absent) renders exactly as before: appended after the full prefix', () => {
  const a = ant({ id: 'a1', at: 1, task: 'walking', color: '#123456' })
  const lines = compose(TREE, [a], [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('main.ts'))!
  const text = lineText(treeLine)
  const glyph = antGlyph('sonnet', 'walking', 0)
  expect(text.startsWith(' '.repeat(TREE_INDENT) + glyph)).toBe(false)
  expect(text.indexOf(glyph) < text.indexOf('main.ts')).toBe(true)
})

test('a climbing ant with a mishap still trails its marker right after the overlaid glyph, same as a non-climbing one (regression)', () => {
  const a = ant({ id: 'a1', task: 'walking', at: 1, climbDepth: 0, color: '#123456', mishap: { kind: 'error', ticks: 5 } })
  const glyph = antGlyph('sonnet', 'walking', 0)
  for (const width of [10, 20, 60]) {
    const lines = compose(TREE, [a], [], { width, height: 20, tick: 0 })
    for (const l of lines) expect(Array.from(lineText(l)).length <= width).toBe(true)
  }
  const lines = compose(TREE, [a], [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('main.ts'))!
  expect(lineText(treeLine).includes(glyph + MISHAP_MARK.error)).toBe(true)
})

test('compose keeps the main ant\'s row visible, over a farther busy ant, when both can\'t fit', () => {
  const tall: Row[] = Array.from({ length: 50 }, (_, i) => row({ name: `f${i}.ts`, path: `f${i}.ts` }))
  const ants: Ant[] = [ant({ id: 'main', at: 2, task: 'working' }), ant({ id: 'sub', at: 45, task: 'working' })]
  const lines = compose(tall, ants, [], { width: 30, height: 15, tick: 0, mainRow: 2 })
  expect(lines.some(l => lineText(l).includes('f2.ts'))).toBe(true)
  expect(lines.some(l => lineText(l).includes('f45.ts'))).toBe(false)
})

test('compose falls back to the lowest busy ant when mainRow is undefined (main idle at home)', () => {
  const tall: Row[] = Array.from({ length: 50 }, (_, i) => row({ name: `f${i}.ts`, path: `f${i}.ts` }))
  const ants: Ant[] = [ant({ id: 'sub', at: 45, task: 'working' })]
  const lines = compose(tall, ants, [], { width: 30, height: 15, tick: 0 })
  expect(lines.some(l => lineText(l).includes('f45.ts'))).toBe(true)
})

test('a default orientation (none given) renders byte-identical to orientation: "vertical"', () => {
  const rows: Row[] = [row({ name: 'a.ts', path: 'a.ts' })]
  const ants: Ant[] = [ant({ id: 'a1', at: 0, task: 'working' })]
  const withDefault = compose(rows, ants, [], { width: 40, height: 20, tick: 3 })
  const withExplicit = compose(rows, ants, [], { width: 40, height: 20, tick: 3, orientation: 'vertical' })
  expect(withDefault).toEqual(withExplicit)
})

test('compose in horizontal mode respects width and height', () => {
  const rows: Row[] = Array.from({ length: 10 }, (_, i) => row({ name: `f${i}.ts`, path: `f${i}.ts` }))
  const ants: Ant[] = [ant({ id: 'a1', at: 2, task: 'working' })]
  const lines = compose(rows, ants, [], { width: 80, height: 5, tick: 0, orientation: 'horizontal' })
  expect(lines.length <= 5).toBe(true)
  for (const l of lines) expect(Array.from(lineText(l)).length <= 80).toBe(true)
})

test('horizontal mode puts the mound and the tree on the same lines, not stacked', () => {
  const lines = compose(TREE, [], [], { width: 80, height: 5, tick: 0, orientation: 'horizontal' })
  const idx = lines.findIndex(l => lineText(l).includes('src/'))
  expect(idx).toBeGreaterThanOrEqual(0)
  expect(idx).toBeLessThan(H_MOUND.length) // same block of lines as the mound, not stacked below it
  expect(lineText(lines[idx]!).indexOf('src/')).toBeGreaterThan(10) // preceded by the mound + gap, not flush left
})

test('a walking ant on the horizontal trail paints further right as it moves from the well toward the baseline', () => {
  const glyph = antGlyph('sonnet', 'walking', 0)
  const wellAnt = ant({ id: 'a1', at: 0 - H_TRAIL_STEPS, task: 'walking', color: '#abcdef' }) // trail point 0
  const baselineAnt = ant({ id: 'a1', at: 6 - H_TRAIL_STEPS, task: 'walking', color: '#abcdef' }) // trail point 6
  const wellLines = compose([], [wellAnt], [], { width: 60, height: 5, tick: 0, orientation: 'horizontal' })
  const baselineLines = compose([], [baselineAnt], [], { width: 60, height: 5, tick: 0, orientation: 'horizontal' })
  const wellCol = lineText(wellLines[H_TRAIL[0]!.line]!).indexOf(glyph)
  const baseCol = lineText(baselineLines[H_TRAIL[6]!.line]!).indexOf(glyph)
  expect(wellCol).toBeGreaterThanOrEqual(0)
  expect(baseCol).toBeGreaterThan(wellCol)
})

test('the tree still scrolls vertically beside the mound in horizontal mode, anchored on mainRow', () => {
  const tall: Row[] = Array.from({ length: 30 }, (_, i) => row({ name: `f${i}.ts`, path: `f${i}.ts` }))
  const ants: Ant[] = [ant({ id: 'main', at: 20, task: 'working' })]
  const lines = compose(tall, ants, [], { width: 80, height: 5, tick: 0, orientation: 'horizontal', mainRow: 20 })
  expect(lines.some(l => lineText(l).includes('f20.ts'))).toBe(true)
  expect(lines.some(l => lineText(l).includes('f0.ts'))).toBe(false)
})

test('horizontal mode\'s tree column stays steady regardless of how wide the ant standing at the mound\'s edge is', () => {
  const atTrailEnd = (breed: Breed): Ant => ant({ id: 'a1', breed, task: 'walking', at: 8 - H_TRAIL_STEPS, color: '#abcdef' })
  const colOf = (breed: Breed) => {
    const lines = compose(TREE, [atTrailEnd(breed)], [], { width: 80, height: 5, tick: 0, orientation: 'horizontal' })
    const line = lines.find(l => lineText(l).includes('src/'))!
    return lineText(line).indexOf('src/')
  }
  expect(colOf('opus')).toBe(colOf('haiku'))
})

test('horizontal mode drops the legend (not corrupts it) at exactly the mound\'s own height; shows it with one spare row', () => {
  const ants: Ant[] = [ant({ id: 'a1', task: 'working', at: 0 })]
  const tight = compose(TREE, ants, [], { width: 80, height: H_MOUND.length, tick: 0, orientation: 'horizontal' })
  expect(tight.length).toBeLessThanOrEqual(H_MOUND.length)
  expect(tight.some(l => lineText(l).includes('(sonnet)'))).toBe(false)

  const roomy = compose(TREE, ants, [], { width: 80, height: H_MOUND.length + 1, tick: 0, orientation: 'horizontal' })
  expect(roomy.some(l => lineText(l).includes('(sonnet)'))).toBe(true)
})

test('compose draws the mound\'s current growth stage; growth omitted means stage 0', () => {
  const base = compose(TREE, [], [], { width: 80, height: 20, tick: 0 })
  const explicit0 = compose(TREE, [], [], { width: 80, height: 20, tick: 0, growth: 0 })
  expect(base).toEqual(explicit0)
  expect(base.map(lineText).join('\n').includes('.:')).toBe(false)

  const lastStage = GROWTH_STAGES - 1
  const grown = compose(TREE, [], [], { width: 80, height: 30, tick: 0, growth: lastStage })
  expect(grown.map(lineText).join('\n').includes('.:')).toBe(true)
})

test('a growth stage past the end clamps to the last stage, a negative one to stage 0', () => {
  const lastStage = GROWTH_STAGES - 1
  const atLast = compose(TREE, [], [], { width: 80, height: 30, tick: 0, growth: lastStage })
  const pastEnd = compose(TREE, [], [], { width: 80, height: 30, tick: 0, growth: lastStage + 50 })
  expect(pastEnd).toEqual(atLast)

  const atZero = compose(TREE, [], [], { width: 80, height: 20, tick: 0, growth: 0 })
  const negative = compose(TREE, [], [], { width: 80, height: 20, tick: 0, growth: -5 })
  expect(negative).toEqual(atZero)
})

test('horizontal mode also grows: H_GROWTH\'s last stage shows the spill flourish too', () => {
  const grown = compose(TREE, [], [], { width: 100, height: 6, tick: 0, orientation: 'horizontal', growth: GROWTH_STAGES - 1 })
  expect(grown.map(lineText).join('\n').includes('.:')).toBe(true)
})

test('GROWTH and H_GROWTH both keep every stage the same number of lines as stage 0', () => {
  for (const stages of [GROWTH, H_GROWTH]) {
    for (const { mound, mask } of stages) {
      expect(mound.length).toBe(stages[0]!.mound.length)
      expect(mask.length).toBe(stages[0]!.mask.length)
    }
  }
})

/** Every cell of `shape`'s base picture something but the tunnel addresses: trail, peeks, hole, sparkle line. */
const protectedCells = (shape: MoundShape): { line: number; col: number }[] => [
  ...shape.trail,
  ...shape.peeks,
  ...Array.from({ length: shape.hole.end - shape.hole.start + 1 }, (_, k) => ({ line: shape.hole.line, col: shape.hole.start + k })),
  ...Array.from(shape.mound[shape.sparkleLine]!, (_, col) => ({ line: shape.sparkleLine, col })),
]
const at = (lines: string[], line: number, col: number) => Array.from(lines[line] ?? '')[col]

test('every growth stage keeps the trail, peeks, hole, sparkle line and base tunnel cells exactly as the base picture has them', () => {
  for (const shape of [SHAPES.vertical, SHAPES.horizontal]) {
    const base = shape.stages[0]!
    for (const stage of shape.stages) {
      for (const p of [...protectedCells(shape), ...shape.tunnel]) {
        expect(at(stage.mound, p.line, p.col)).toBe(at(base.mound, p.line, p.col))
        expect(at(stage.mask, p.line, p.col)).toBe(at(base.mask, p.line, p.col))
      }
    }
  }
})

test('every growth stage\'s picture and mask line up cell for cell, with only known palette keys', () => {
  for (const shape of [SHAPES.vertical, SHAPES.horizontal]) {
    for (const { mound, mask } of shape.stages) {
      mound.forEach((line, i) => {
        const chars = Array.from(line)
        const keys = Array.from(mask[i]!)
        expect(keys.length).toBe(chars.length)
        chars.forEach((ch, c) => {
          expect(keys[c] === ' ').toBe(ch === ' ')
          if (ch !== ' ') expect(MOUND_PALETTE[keys[c]!] !== undefined).toBe(true)
        })
      })
    }
  }
})

test('the mound grows a little at every stage, never shrinks, and stays narrow enough for a docked pane', () => {
  for (const shape of [SHAPES.vertical, SHAPES.horizontal]) {
    const cellCount = (lines: string[]) => lines.join('').replace(/ /g, '').length
    for (let n = 1; n < shape.stages.length; n++) {
      expect(shape.stages[n]!.mound.join('\n')).not.toBe(shape.stages[n - 1]!.mound.join('\n'))
      expect(cellCount(shape.stages[n]!.mound)).toBeGreaterThanOrEqual(cellCount(shape.stages[n - 1]!.mound))
    }
  }
  const widest = (lines: string[]) => Math.max(...lines.map(l => Array.from(l).length))
  expect(widest(GROWTH.at(-1)!.mound)).toBeLessThanOrEqual(30)
  expect(widest(H_GROWTH.at(-1)!.mound)).toBeLessThanOrEqual(36)
})

test('a grown stage\'s tunnel goes on from the base route into the hump, one touching step at a time, and only grows', () => {
  for (const shape of [SHAPES.vertical, SHAPES.horizontal]) {
    let prev = shape.tunnel
    for (const stage of shape.stages) {
      const route = stage.tunnel
      // starts with the previous stage's whole route, unchanged: a dug index keeps its cell
      expect(route.slice(0, prev.length)).toEqual(prev)
      const seen = new Set<string>()
      route.forEach((p, k) => {
        expect(at(stage.mask, p.line, p.col) ?? ' ').not.toBe(' ') // on the mound, never off it
        seen.add(`${p.line},${p.col}`)
        if (k > 0) expect(Math.abs(p.line - route[k - 1]!.line) + Math.abs(p.col - route[k - 1]!.col)).toBe(1)
      })
      expect(seen.size).toBe(route.length)
      prev = route
    }
    // the fully grown mound's tunnel reaches past the base picture's right edge, into the hump
    const baseWidth = Math.max(...shape.stages[0]!.mound.slice(1, -1).map(l => Array.from(l).length))
    expect(Math.max(...shape.stages.at(-1)!.tunnel.map(p => p.col))).toBeGreaterThanOrEqual(baseWidth - 1)
  }
})

test('H_TUNNEL avoids the trail, peeks, hole and sparkle line; only the grown route crosses the trail, at one point', () => {
  const blocked = new Set([...H_TRAIL, ...H_PEEKS].map(p => `${p.line},${p.col}`))
  for (let c = H_HOLE.start; c <= H_HOLE.end; c++) blocked.add(`${H_HOLE.line},${c}`)
  for (const p of H_TUNNEL) {
    expect(p.line).not.toBe(H_SPARKLE_LINE)
    expect(blocked.has(`${p.line},${p.col}`)).toBe(false)
  }
  const crossings = H_GROWTH.at(-1)!.tunnel.filter(p => blocked.has(`${p.line},${p.col}`))
  expect(crossings).toEqual([{ line: 3, col: 12 }])
})

test('a dug cell is never drawn blank: a passage, chamber, root or fungus, the same kind every time for the same index', () => {
  const kinds = new Set<string>()
  for (let i = 0; i < 60; i++) {
    const a = dugSprite(i, 0)
    expect(a.ch.trim()).not.toBe('')
    expect(dugSprite(i, 0)).toEqual(a)
    kinds.add(dugSprite(i, 1000).ch)
  }
  expect(kinds.size).toBeGreaterThanOrEqual(4) // passages, chambers, roots and grown fungi all show up
})

test('a fungus grows the longer its tunnel has been dug: spore, sprout, stalk, cap, each in its own color', () => {
  const fungus = Array.from({ length: 200 }, (_, i) => i).find(i => dugSprite(i, 1000).ch === 'τ')
  expect(fungus).toBeDefined()
  const frames = [0, 15, 40, 80, 140].map(age => dugSprite(fungus!, age).ch)
  expect(new Set(frames).size).toBe(frames.length)
  expect(frames.at(-1)).toBe('τ')
})

test('a cell dug further along a bigger mound\'s route isn\'t drawn once the mound is smaller again', () => {
  const grown = GROWTH.at(-1)!.tunnel
  const far = grown.length - 1 // only on the grown route
  const small = compose(TREE, [], [], { width: 60, height: 20, tick: 500, growth: 0, dug: [{ i: far, at: 0 }] })
  const big = compose(TREE, [], [], { width: 60, height: 30, tick: 500, growth: GROWTH.length - 1, dug: [{ i: far, at: 0 }] })
  const cell = grown[far]!
  expect(cells(big[cell.line])[cell.col]!.ch).toBe(dugSprite(far, 500).ch)
  // the small mound shows its own picture there (nothing, or the base cell), not the dug sprite
  expect(cells(small[cell.line])[cell.col]?.ch).toBe(at(GROWTH[0]!.mound, cell.line, cell.col))
})

test('compose leaves the legend out when asked to; legendLines draws it on its own, for the strip\'s button row', () => {
  const ants: Ant[] = [ant({ id: 'main', label: 'main', breed: 'opus', task: 'working', at: 0 })]
  const without = compose(TREE, ants, [], { width: 80, height: 20, tick: 0, legend: false })
  expect(without.some(l => lineText(l).includes('main (opus)'))).toBe(false)
  expect(lineText(legendLines(ants, 80, 0)[0]!)).toContain('main (opus)')
})

test('stageOf clamps a stage out of range, or not a whole number, to a real one', () => {
  const shape = SHAPES.vertical
  expect(stageOf(shape, -3)).toBe(shape.stages[0])
  expect(stageOf(shape, 999)).toBe(shape.stages.at(-1))
  expect(stageOf(shape, Number.NaN)).toBe(shape.stages[0])
})

// ---- mishaps and flashes ----------------------------------------------------

test('a busy ant\'s tunnel dot with a mishap is drawn as its marker, in the mishap\'s color, instead of the plain dot', () => {
  const busy = seatOrbits([markBusy(ant({ color: '#5f87ff', mishap: { kind: 'error', ticks: 5 } }))])[0]!
  const lines = compose(TREE, [busy], [], { width: 40, height: 20, tick: 0 })
  const hit = TUNNEL.filter(p => cells(lines[p.line])[p.col]?.color === MISHAP_COLORS.error)
  expect(hit.length).toBe(1)
  expect(cells(lines[hit[0]!.line])[hit[0]!.col]?.ch).toBe(MISHAP_MARK.error)
  // never drawn in the ant's own color while the mishap lasts
  expect(TUNNEL.some(p => cells(lines[p.line])[p.col]?.color === '#5f87ff')).toBe(false)
})

test('a denied busy ant\'s dot shows "!" instead of "x"', () => {
  const busy = seatOrbits([markBusy(ant({ color: '#5f87ff', mishap: { kind: 'denied', ticks: 5 } }))])[0]!
  const lines = compose(TREE, [busy], [], { width: 40, height: 20, tick: 0 })
  const hit = TUNNEL.filter(p => cells(lines[p.line])[p.col]?.color === MISHAP_COLORS.denied)
  expect(hit.length).toBe(1)
  expect(cells(lines[hit[0]!.line])[hit[0]!.col]?.ch).toBe(MISHAP_MARK.denied)
})

test('an ant with a mishap blinks every other frame between its own color and the mishap\'s, on the trail', () => {
  const k = 1
  const own = '#111111'
  const colorAt = (frame: number): string | undefined => {
    const a = ant({ id: 'm', breed: 'opus', task: 'walking', at: k - TRAIL_STEPS, color: own, frame, mishap: { kind: 'denied', ticks: 5 } })
    const lines = compose(TREE, [a], [], { width: 40, height: 20, tick: 0 })
    return cells(lines[TRAIL[k]!.line]).find(c => c.color === own || c.color === MISHAP_COLORS.denied)?.color
  }
  expect(colorAt(0)).toBe(own)
  expect(colorAt(1)).toBe(MISHAP_COLORS.denied)
  expect(colorAt(2)).toBe(own)
  expect(colorAt(3)).toBe(MISHAP_COLORS.denied)
})

test('an ant with a mishap peeking from the hole blinks the same way as on the trail', () => {
  const own = '#5f87ff'
  const colorAt = (frame: number): string | undefined => {
    const a = ant({ id: 'm', color: own, frame, mishap: { kind: 'error', ticks: 5 } })
    const lines = compose(TREE, [a], [], { width: 40, height: 20, tick: 0 })
    const slot = PEEKS[0]!
    return cells(lines[slot.line])[slot.col]?.color
  }
  expect(colorAt(0)).toBe(own)
  expect(colorAt(1)).toBe(MISHAP_COLORS.error)
})

test('quiet mode drops the blink on the trail: a mishap still shows, it just stops flickering', () => {
  const k = 1
  const own = '#111111'
  const colorAt = (frame: number): string | undefined => {
    const a = ant({ id: 'm', breed: 'opus', task: 'walking', at: k - TRAIL_STEPS, color: own, frame, mishap: { kind: 'denied', ticks: 5 } })
    const lines = compose(TREE, [a], [], { width: 40, height: 20, tick: 0, quiet: true })
    return cells(lines[TRAIL[k]!.line]).find(c => c.color === own || c.color === MISHAP_COLORS.denied)?.color
  }
  expect(colorAt(0)).toBe(own)
  expect(colorAt(1)).toBe(own)
  expect(colorAt(3)).toBe(own)
})

test('quiet mode drops the blink peeking from the hole too', () => {
  const own = '#5f87ff'
  const a = ant({ id: 'm', color: own, frame: 1, mishap: { kind: 'error', ticks: 5 } })
  const lines = compose(TREE, [a], [], { width: 40, height: 20, tick: 0, quiet: true })
  const slot = PEEKS[0]!
  expect(cells(lines[slot.line])[slot.col]?.color).toBe(own)
})

test('a walking ant with a mishap trails a marker right after its glyph on a tree row', () => {
  const rows: Row[] = [row({ name: 'util.ts', path: 'util.ts' })]
  const a = ant({ id: 'a1', task: 'walking', at: 0, frame: 0, mishap: { kind: 'error', ticks: 5 } })
  const lines = compose(rows, [a], [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('util.ts'))!
  const glyph = antGlyph('sonnet', 'walking', 0)
  expect(lineText(treeLine).includes(glyph + MISHAP_MARK.error + ' util.ts')).toBe(true)
})

test('a working ant with a mishap trails a marker right after its glyph on a tree row', () => {
  const rows: Row[] = [row({ name: 'main.ts', path: 'main.ts' })]
  const a = ant({ id: 'a1', task: 'working', at: 0, frame: 0, mishap: { kind: 'denied', ticks: 5 } })
  const lines = compose(rows, [a], [], { width: 60, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('main.ts'))!
  const glyph = antGlyph('sonnet', 'working', 0)
  expect(lineText(treeLine).includes(glyph + MISHAP_MARK.denied)).toBe(true)
})

test('quiet mode drops the blink on a tree row too: a standing ant with a mishap stays its own color', () => {
  const own = '#222222'
  const rows: Row[] = [row({ name: 'main.ts', path: 'main.ts' })]
  const a = ant({ id: 'a1', task: 'working', at: 0, color: own, frame: 1, mishap: { kind: 'denied', ticks: 5 } })
  const full = compose(rows, [a], [], { width: 60, height: 20, tick: 0 })
  const quiet = compose(rows, [a], [], { width: 60, height: 20, tick: 0, quiet: true })
  const glyphColor = (lines: Line[]) => lines.flatMap(l => l).find(s => s.text.includes(antGlyph('sonnet', 'working', 1)))?.color
  expect(glyphColor(full)).toBe(MISHAP_COLORS.denied) // frame 1 is odd: blinking without quiet
  expect(glyphColor(quiet)).toBe(own)
})

test('a row with a flash draws its name bold in the flash\'s color, with a trailing marker', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false, flash: { kind: 'error', ticks: 5 } }]
  const lines = compose(rows, [], [], { width: 40, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('a.ts'))!
  const seg = treeLine.find(s => s.text.includes('a.ts'))!
  expect(seg.bold).toBe(true)
  expect(seg.color).toBe(MISHAP_COLORS.error)
  expect(lineText(treeLine).includes('a.ts ' + MISHAP_MARK.error)).toBe(true)
})

test('a denied row\'s flash shows "!" in the denied color instead', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false, flash: { kind: 'denied', ticks: 5 } }]
  const lines = compose(rows, [], [], { width: 40, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('a.ts'))!
  const seg = treeLine.find(s => s.text.includes('a.ts'))!
  expect(seg.color).toBe(MISHAP_COLORS.denied)
  expect(lineText(treeLine).includes('a.ts ' + MISHAP_MARK.denied)).toBe(true)
})

test('a row\'s flash takes precedence over an ant standing there and highlighting its name', () => {
  const rows: Row[] = [{ path: 'a.ts', name: 'a.ts', depth: 0, isDir: false, flash: { kind: 'error', ticks: 5 } }]
  const standing = ant({ id: 'w', task: 'working', at: 0, color: '#5fff5f' })
  const lines = compose(rows, [standing], [], { width: 40, height: 20, tick: 0 })
  const treeLine = lines.find(l => lineText(l).includes('a.ts'))!
  const seg = treeLine.find(s => s.text.includes('a.ts'))!
  expect(seg.color).toBe(MISHAP_COLORS.error)
})

test('the legend item of an ant with a mishap gets a trailing marker in the mishap\'s color', () => {
  const ants: Ant[] = [ant({ id: 'a1', label: 'worker', breed: 'opus', mishap: { kind: 'denied', ticks: 5 } })]
  const lines = legendLines(ants, 80, 0)
  const text = lineText(lines[0]!)
  expect(text).toContain('worker (opus) ' + MISHAP_MARK.denied)
  const markSeg = lines[0]!.find(s => s.text === ' ' + MISHAP_MARK.denied)
  expect(markSeg?.color).toBe(MISHAP_COLORS.denied)
})

test('an ant with no mishap gets no trailing marker in the legend', () => {
  const ants: Ant[] = [ant({ id: 'a1', label: 'worker', breed: 'opus' })]
  const text = lineText(legendLines(ants, 80, 0)[0]!)
  expect(text).toBe(antGlyph('opus', 'home', 0) + ' worker (opus)')
})

test('every line still fits the width with a mishap ant blinking and a row flashing, markers and all', () => {
  const rows: Row[] = [
    row({ name: 'deeply', path: 'deeply', isDir: true, isOpen: true }),
    row({ name: 'nested', path: 'deeply/nested', depth: 1, isDir: true, isOpen: true }),
    { ...row({ name: 'a_rather_long_file_name.ts', path: 'deeply/nested/a_rather_long_file_name.ts', depth: 2 }), flash: { kind: 'error', ticks: 5 } },
    row({ name: 'README.md', path: 'README.md' }),
  ]
  const crowd: Ant[] = [
    { ...ant({ id: 'h', label: 'main' }), mishap: { kind: 'denied', ticks: 5 } },
    ...TRAIL.map((_, k) => ({
      ...ant({ id: `t${k}`, label: `trail${k}`, breed: BREEDS[k % BREEDS.length]!, task: 'walking' as const, at: k - TRAIL_STEPS }),
      ...(k % 3 === 0 ? { mishap: { kind: 'error' as const, ticks: 5 } } : {}),
    })),
    { ...ant({ id: 'w', label: 'worker', breed: 'opus', task: 'working', at: 2 }), mishap: { kind: 'error' as const, ticks: 5 } },
    { ...ant({ id: 'b', label: 'builder', breed: 'sonnet', task: 'building', at: 3 }), mishap: { kind: 'denied' as const, ticks: 5 } },
  ]
  for (const width of [25, 40, 60]) {
    for (let tick = 0; tick < 4; tick++) {
      const lines = compose(rows, crowd, [], { width, height: 30, tick })
      for (const l of lines) expect(Array.from(lineText(l)).length <= width).toBe(true)
    }
  }
})

// ---- compaction: the tree folds up, the ants refactor the anthill ----------------

const NESTED: Row[] = [
  row({ name: 'a', path: 'a', isDir: true, isOpen: true }),
  row({ name: 'b', path: 'a/b', depth: 1, isDir: true, isOpen: true }),
  row({ name: 'c.ts', path: 'a/b/c.ts', depth: 2 }),
  row({ name: 'd.ts', path: 'a/d.ts', depth: 1 }),
  row({ name: 'e', path: 'e', isDir: true }),
  row({ name: 'f.md', path: 'f.md' }),
  row({ name: 'g.md', path: 'g.md' }),
  row({ name: 'h.md', path: 'h.md' }),
]
const mainFold = (o: Partial<Fold>): Fold => ({ id: 'main', label: 'main', before: 40, frame: 0, isMain: true, ...o })

test('foldTree tucks the deepest level away first, then the next, then folds top-level rows away from the bottom', () => {
  const none = foldTree(NESTED, 0, new Set())
  expect(none.shown.every(Boolean)).toBe(true)
  const one = foldTree(NESTED, 1, new Set())
  expect(one.shown).toEqual([true, true, false, true, true, true, true, true]) // depth 2 tucked
  expect(one.tucked[1]).toBe(1) // into b/
  const two = foldTree(NESTED, 2, new Set())
  expect(two.shown).toEqual([true, false, false, false, true, true, true, true])
  expect(two.tucked[0]).toBe(3) // b/, c.ts and d.ts all tucked under a/
  const all = foldTree(NESTED, 99, new Set())
  expect(all.shown.filter(Boolean).length).toBe(3) // FOLDED_KEEP top-level rows stay
  expect(all.folded).toBe(2) // g.md and h.md folded away below
})

test('foldTree never folds away a row an ant stands on, nor the folders above it', () => {
  const view = foldTree(NESTED, 99, new Set([2])) // an ant on a/b/c.ts
  expect(view.shown[0]).toBe(true)
  expect(view.shown[1]).toBe(true)
  expect(view.shown[2]).toBe(true)
})

test('main compacting folds the drawn tree (marks and all); a subagent compacting only shows its header', () => {
  const folded = compose(NESTED, [], [mainFold({ frame: 5, eta: 10 })], { width: 60, height: 30, tick: 0 }).map(lineText).join('\n')
  expect(folded).toContain('a/ +3')
  expect(folded).not.toContain('c.ts')
  const sub = compose(NESTED, [], [{ id: 'sub', label: 'Explore', before: 9, frame: 4 }], { width: 60, height: 30, tick: 0 }).map(lineText).join('\n')
  expect(sub).toContain('Explore folding its memory')
  expect(sub).toContain('c.ts')
  const later = compose(NESTED, [], [mainFold({ frame: 40, eta: 10 })], { width: 60, height: 30, tick: 0 }).map(lineText).join('\n')
  expect(later).toContain('… 2 folded away')
})

test('once resolved the tree holds folded under the banner, then unfolds so it is whole as the banner leaves', () => {
  const held = compose(NESTED, [], [mainFold({ after: 8, frame: 40, peak: 40, eta: 10, settle: SETTLE_TICKS - 10 })], { width: 60, height: 30, tick: 0 }).map(lineText).join('\n')
  expect(held).toContain("main's memory folded: 40 → 8 messages")
  expect(held).toContain('folded away')
  const end = compose(NESTED, [], [mainFold({ after: 8, frame: 40, peak: 40, settle: 0 })], { width: 60, height: 30, tick: 0 }).map(lineText).join('\n')
  for (const r of NESTED) expect(end).toContain(r.name)
})

test('while main compacts the hump comes down a stage at a time, and workers haul clods along the haul path', () => {
  const widest = (lines: Line[]) => Math.max(...lines.slice(0, MOUND.length).map(l => Array.from(lineText(l)).length))
  const grownLines = compose(TREE, [], [], { width: 60, height: 30, tick: 0, growth: GROWTH.length - 1 })
  const early = compose(TREE, [], [mainFold({ frame: 0 })], { width: 60, height: 30, tick: 0, growth: GROWTH.length - 1 })
  const late = compose(TREE, [], [mainFold({ frame: 999 })], { width: 60, height: 30, tick: 0, growth: GROWTH.length - 1 })
  expect(widest(early)).toBe(widest(grownLines))
  expect(widest(late)).toBeLessThan(widest(grownLines))
  const main = ant({ id: 'main', color: '#ff5f5f' })
  const working = compose(TREE, [main], [mainFold({ frame: 6 })], { width: 60, height: 30, tick: 0 })
  const workers = SHAPES.vertical.haul.filter(p => cells(working[p.line])[p.col + 1]?.ch === 'o' && cells(working[p.line])[p.col + 1]?.color === '#ff5f5f')
  expect(workers.length).toBeGreaterThan(0)
  const done = compose(TREE, [main], [mainFold({ after: 9, frame: 6, peak: 6, settle: 5 })], { width: 60, height: 30, tick: 0 })
  expect(SHAPES.vertical.haul.some(p => cells(done[p.line])[p.col + 1]?.color === '#ff5f5f')).toBe(false) // gone home
})

test('the refactoring ants pack the mound tighter once the hump is gone, filling its tunnels; it eases back after', () => {
  const loose = (lines: Line[]) => lines.slice(0, MOUND.length).map(lineText).join('').split('░').length - 1
  const base = compose(TREE, [], [], { width: 60, height: 30, tick: 0 })
  const packing = compose(TREE, [], [mainFold({ frame: 8, eta: 20 })], { width: 60, height: 30, tick: 0 })
  expect(loose(packing)).toBeLessThan(loose(base))
  const tunnel = TUNNEL[0]!
  const filled = compose(TREE, [], [mainFold({ frame: 999 })], { width: 60, height: 30, tick: 500, dug: [{ i: 0, at: 0 }] })
  expect(cells(filled[tunnel.line])[tunnel.col]!.ch).toBe('▒')
  const after = compose(TREE, [], [mainFold({ after: 9, frame: 999, peak: 999, settle: 0 })], { width: 60, height: 30, tick: 0 })
  expect(loose(after)).toBe(loose(base))
  const skipped = compose(TREE, [], [mainFold({ after: 40, frame: 999, peak: 999, settle: 20 })], { width: 60, height: 30, tick: 0 })
  expect(loose(skipped)).toBe(loose(base)) // nothing compacted, nothing packed
})

test('foldProgress keeps a steady pace through most of its eta, then slows, never quite done before it resolves', () => {
  expect(foldProgress(0, 100)).toBe(0)
  expect(approx(foldProgress(50, 100))).toBe(approx(0.5))
  let last = 0
  for (const frame of [10, 60, 75, 90, 100, 150, 200, 400]) {
    const p = foldProgress(frame, 100)
    expect(p).toBeGreaterThan(last)
    expect(p).toBeLessThan(1)
    last = p
  }
  expect(foldProgress(100, 100)).toBeGreaterThan(0.8) // most of the way there by its estimate
  expect(foldProgress(200, 100) - foldProgress(150, 100)).toBeLessThan(foldProgress(50, 100) - foldProgress(0, 100)) // slower when overdue
})

test('a compaction is expected to take time in proportion to the context it folds, and learns from each one it times', () => {
  expect(compactMs(0)).toBe(COMPACT_BASE_MS)
  expect(approx(compactMs(200_000) - compactMs(100_000))).toBe(approx(100_000 * COMPACT_MS_PER_TOKEN))
  expect(compactMs(100_000, 1)).toBe(COMPACT_BASE_MS + 100_000)
  // the first one timed sets the rate outright; later ones move it halfway each
  expect(approx(learnRate(undefined, 100_000, COMPACT_BASE_MS + 30_000))).toBe(approx(0.3))
  expect(approx(learnRate(0.3, 100_000, COMPACT_BASE_MS + 10_000))).toBe(approx(0.2))
  // nothing to learn from no context or no time; a wild measure is clamped
  expect(learnRate(0.3, 0, 9_000)).toBe(0.3)
  expect(learnRate(0.3, 100_000, 0)).toBe(0.3)
  expect(learnRate(undefined, 10, 3_600_000)).toBe(5)
})

test('the refactoring is paced to the compaction\'s eta: a longer one still has its hump left when a shorter one is done', () => {
  const widest = (lines: Line[]) => Math.max(...lines.slice(0, MOUND.length).map(l => Array.from(lineText(l)).length))
  const top = GROWTH.length - 1
  const grown = widest(compose(TREE, [], [], { width: 60, height: 30, tick: 0, growth: top }))
  const bare = widest(compose(TREE, [], [], { width: 60, height: 30, tick: 0 }))
  const short = compose(TREE, [], [mainFold({ frame: 100, eta: 150, grown: top })], { width: 60, height: 30, tick: 0, growth: top })
  const long = compose(TREE, [], [mainFold({ frame: 100, eta: 2000, grown: top })], { width: 60, height: 30, tick: 0, growth: top })
  expect(widest(short)).toBe(bare) // hauled away
  expect(widest(long)).toBeGreaterThan(bare) // still at it
  expect(widest(long)).toBeLessThan(grown) // but under way
  // and it hauls from the stage the compaction began at, whatever growth reads meanwhile
  const measured = compose(TREE, [], [mainFold({ frame: 0, eta: 2000, grown: top })], { width: 60, height: 30, tick: 0, growth: 3 })
  expect(widest(measured)).toBe(grown)
})

test('a compaction that resolves before its eta is finished off at once: fully packed and folded within a few ticks', () => {
  const loose = (lines: Line[]) => lines.slice(0, MOUND.length).map(lineText).join('').split('░').length - 1
  const main = ant({ id: 'main', color: '#ff5f5f' })
  const early = mainFold({ after: 8, frame: 3, peak: 3, eta: 1000 })
  const resolving = compose(NESTED, [main], [{ ...early, settle: SETTLE_TICKS }], { width: 60, height: 30, tick: 0 })
  expect(loose(resolving)).toBeGreaterThan(0)
  expect(SHAPES.vertical.haul.some(p => cells(resolving[p.line])[p.col + 1]?.color === '#ff5f5f')).toBe(true) // still finishing up
  const finished = compose(NESTED, [main], [{ ...early, settle: SETTLE_TICKS - 5 }], { width: 60, height: 30, tick: 0 })
  expect(loose(finished)).toBe(0)
  expect(finished.map(lineText).join('\n')).toContain('… 2 folded away')
})

test('the haul paths stay on the mound, clear of the hole and its peek slots, in both orientations', () => {
  for (const shape of [SHAPES.vertical, SHAPES.horizontal]) {
    const blocked = new Set(shape.peeks.map(p => `${p.line},${p.col}`))
    for (let c = shape.hole.start; c <= shape.hole.end; c++) blocked.add(`${shape.hole.line},${c}`)
    for (const p of shape.haul) {
      for (const col of [p.col, p.col + 1]) {
        expect(blocked.has(`${p.line},${col}`)).toBe(false)
        expect(at(shape.mound, p.line, col) ?? ' ').not.toBe(' ')
      }
    }
  }
})

test('a compacting mound and folded tree still fit the width, in both layouts', () => {
  const ants = [ant({ id: 'main', color: '#ff5f5f', task: 'busy', busySeat: 0 })]
  for (const frame of [0, 5, 13, 40, 99]) {
    for (const width of [25, 40, 90]) {
      const v = compose(NESTED, ants, [mainFold({ frame })], { width, height: 30, tick: frame, growth: GROWTH.length - 1 })
      for (const l of v) expect(Array.from(lineText(l)).length <= width).toBe(true)
      const h = compose(NESTED, ants, [mainFold({ frame })], { width, height: 5, tick: frame, orientation: 'horizontal', growth: GROWTH.length - 1 })
      for (const l of h) expect(Array.from(lineText(l)).length <= width).toBe(true)
    }
  }
})
