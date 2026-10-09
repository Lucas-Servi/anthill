import type { Row } from '../types'

/** Directory/file names never shown in the tree. */
export const IGNORED: Set<string> = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.godot',
  '.import',
  'dist',
  'build',
  '.next',
  '.cache',
  '.DS_Store',
  '.mypy_cache',
  '.pytest_cache',
  '.idea',
  '.vscode',
])

/** How many ticks it takes an ant to fully build a new file's branch. */
export const BUILD_STEPS = 4

export type Entry = { name: string; kind: 'file' | 'dir' | 'other' }

/** Dirs first, then case-insensitive alphabetical within each group. */
function compare(a: { isDir: boolean; name: string }, b: { isDir: boolean; name: string }): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function childRows(parentPath: string, depth: number, entries: Entry[]): Row[] {
  const kept = entries.filter((e) => e.kind !== 'other' && !IGNORED.has(e.name))
  const sorted = [...kept].sort((a, b) => compare({ isDir: a.kind === 'dir', name: a.name }, { isDir: b.kind === 'dir', name: b.name }))
  return sorted.map((e) => {
    const isDir = e.kind === 'dir'
    const path = parentPath ? `${parentPath}/${e.name}` : e.name
    const row: Row = { path, name: e.name, depth, isDir }
    if (isDir) row.isOpen = false
    return row
  })
}

export function indexOf(rows: Row[], path: string): number {
  return rows.findIndex((r) => r.path === path)
}

/** End (exclusive) of the subtree rooted at rows[index]. */
function subtreeEnd(rows: Row[], index: number): number {
  const depth = rows[index]!.depth
  let j = index + 1
  while (j < rows.length && rows[j]!.depth > depth) j++
  return j
}

export function openDir(rows: Row[], dirPath: string, children: Row[]): Row[] {
  if (dirPath === '') {
    if (rows.length > 0) return rows
    return children
  }
  const idx = indexOf(rows, dirPath)
  if (idx === -1) return rows
  const dirRow = rows[idx]!
  if (dirRow.isOpen) return rows
  const openedDir: Row = { ...dirRow, isOpen: true }
  return [...rows.slice(0, idx), openedDir, ...children, ...rows.slice(idx + 1)]
}

export function insertRow(rows: Row[], row: Row): { rows: Row[]; index: number } {
  const existing = indexOf(rows, row.path)
  if (existing !== -1) return { rows, index: existing }

  const parentPath = parentOf(row.path)
  let rangeStart: number
  let rangeEnd: number
  let siblingDepth: number
  if (parentPath === '') {
    rangeStart = 0
    rangeEnd = rows.length
    siblingDepth = 0
  } else {
    const pIdx = indexOf(rows, parentPath)
    if (pIdx === -1) return { rows, index: -1 }
    rangeStart = pIdx + 1
    rangeEnd = subtreeEnd(rows, pIdx)
    siblingDepth = rows[pIdx]!.depth + 1
  }

  let insertAt = rangeStart
  let i = rangeStart
  while (i < rangeEnd) {
    if (rows[i]!.depth === siblingDepth) {
      if (compare(row, rows[i]!) < 0) break
      insertAt = subtreeEnd(rows, i)
      i = insertAt
    } else {
      i++
    }
  }

  return { rows: [...rows.slice(0, insertAt), row, ...rows.slice(insertAt)], index: insertAt }
}

export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

export function ancestors(path: string): string[] {
  const parts = path.split('/')
  const result: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    result.push(parts.slice(0, i + 1).join('/'))
  }
  return result
}

/** Whether a row's name should render (fully built, or not under construction at all). */
export function isBuilt(row: Row): boolean {
  return row.built === undefined || row.built >= BUILD_STEPS
}

function connector(isLastRow: boolean, built: number | undefined): string {
  const ch = isLastRow ? '└' : '├'
  const stages = ['', ch, `${ch}─`, `${ch}──`, `${ch}── `]
  const step = built === undefined ? BUILD_STEPS : built
  return stages[Math.min(step, BUILD_STEPS)]!
}

/** A row is "last" if no later row at its depth occurs before a shallower one. */
function computeIsLast(rows: Row[]): boolean[] {
  return rows.map((row, i) => {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j]!.depth < row.depth) return true
      if (rows[j]!.depth === row.depth) return false
    }
    return true
  })
}

/**
 * branchPrefixes(rows)[i], but as the per-ancestor-depth strings it's built from
 * instead of joined: steps[d] for d < row.depth is that ancestor's own `'    '`/`'│   '`
 * segment, and the last element is the row's own connector. Lets a climbing ant's
 * glyph be placed over a shallower ancestor's trunk column (render.ts) without
 * re-deriving the indent stack a second time.
 */
export function branchPrefixSteps(rows: Row[]): string[][] {
  const isLast = computeIsLast(rows)
  const stack: boolean[] = []
  return rows.map((row, i) => {
    stack[row.depth] = isLast[i]!
    stack.length = row.depth + 1
    const steps: string[] = []
    for (let d = 0; d < row.depth; d++) {
      steps.push(stack[d] ?? false ? '    ' : '│   ')
    }
    steps.push(connector(isLast[i]!, row.built))
    return steps
  })
}

export function branchPrefixes(rows: Row[]): string[] {
  return branchPrefixSteps(rows).map((steps) => steps.join(''))
}

/** Drops a trailing slash: a Grep/Glob `path` naming a directory often has one. */
function dropTrailingSlash(p: string): string {
  while (p.length > 0 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export function relativize(cwd: string, filePath: string): string | null {
  let base = cwd
  while (base.length > 1 && base.endsWith('/')) base = base.slice(0, -1)

  if (!filePath.startsWith('/')) {
    let p = filePath
    while (p.startsWith('./')) p = p.slice(2)
    return dropTrailingSlash(p)
  }

  if (filePath === base) return ''
  const prefix = base === '/' ? '/' : `${base}/`
  if (filePath.startsWith(prefix)) return dropTrailingSlash(filePath.slice(prefix.length))
  return null
}
