import { test, expect } from 'claude-code/testing'
import type { Row, Ant, Breed, Fold } from '../types'
import { assign, markBusy, seatOrbits, seatPeeks } from './ants'
import { MOUND, PEEK, antGlyph, workFx, compose, lineText, type Line } from './render'
import {
  HOLE,
  HOME,
  MOUND_MASK,
  MOUND_PALETTE,
  ORBIT,
  ORBIT_SEATS,
  PEEKS,
  SPARKLE_LINE,
  TRAIL,
  TRAIL_STEPS,
  TREE_INDENT,
  glyphStart,
} from './mound'

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

test('ORBIT cells are all light-shade and disjoint from TRAIL, PEEKS, HOLE and the sparkle line', () => {
  const occupied = new Set<string>()
  for (const p of TRAIL) occupied.add(`${p.line},${p.col}`)
  for (const p of PEEKS) occupied.add(`${p.line},${p.col}`)
  for (let c = HOLE.start; c <= HOLE.end; c++) occupied.add(`${HOLE.line},${c}`)

  expect(ORBIT.length % ORBIT_SEATS).toBe(0)
  for (const p of ORBIT) {
    expect(p.line).not.toBe(SPARKLE_LINE)
    expect(occupied.has(`${p.line},${p.col}`)).toBe(false)
    expect(Array.from(MOUND_MASK[p.line]!)[p.col]).toBe('l')
  }
})

test('a busy ant draws a dot inside the mound, in its own color, with no peeking antennae', () => {
  const busy = seatOrbits([markBusy(ant({ color: '#5f87ff' }))])[0]!
  const lines = compose(TREE, [busy], [], { width: 40, height: 20, tick: 0 })
  const dots = ORBIT.filter(p => cells(lines[p.line])[p.col]?.color === '#5f87ff')
  expect(dots.length).toBe(1)
  // no antennae anywhere: a busy ant never holds a peek seat
  for (const p of PEEKS) expect(cells(lines[p.line])[p.col]?.ch).not.toBe(PEEK)
})

test('two busy ants show two dots that never overlap, each in its own color', () => {
  const busy = seatOrbits(['#ff5f5f', '#5fff5f'].map(color => markBusy(ant({ id: color, color }))))
  for (let f = 0; f < ORBIT.length; f++) {
    const lines = compose(TREE, busy.map(a => ({ ...a, frame: f })), [], { width: 40, height: 20, tick: 0 })
    const found = busy.map(a => {
      const hit = ORBIT.filter(p => cells(lines[p.line])[p.col]?.color === a.color)
      expect(hit.length).toBe(1)
      return hit[0]!
    })
    expect(found[0]!.line === found[1]!.line && found[0]!.col === found[1]!.col).toBe(false)
  }
})

test('a busy ant that gets a real file job stops orbiting and starts walking that same tick', () => {
  const busy = seatOrbits([markBusy(ant({ color: '#ff8700' }))])[0]!
  const walking = assign(busy, { id: 'j', path: 'README.md', kind: 'work' })
  expect(walking.task).toBe('walking')
  const lines = compose(TREE, [walking], [], { width: 40, height: 20, tick: 0 })
  for (const p of ORBIT) expect(cells(lines[p.line])[p.col]?.color).not.toBe('#ff8700')
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

test('an unresolved fold shows a generic collapsing block, never (summarized ...); a resolved one shows the real counts', () => {
  const running: Fold = { id: 'main', label: 'main', before: 9, frame: 0 }
  const runningText = compose(TREE, [], [running], { width: 40, height: 20, tick: 0 }).map(lineText).join('\n')
  expect(runningText.includes('folding its memory')).toBe(true)
  expect(runningText.includes('summarized')).toBe(false)

  const settled: Fold = { id: 'main', label: 'main', before: 9, after: 2, frame: 0, settle: 3 }
  const settledText = compose(TREE, [], [settled], { width: 40, height: 20, tick: 0 }).map(lineText).join('\n')
  expect(settledText.includes('(summarized, 9 → 2)')).toBe(true)
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
