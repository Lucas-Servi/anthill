import type { ClientModule } from 'claude-code'
import type { Ant, Fold, Row } from '../types'
import { compose, hitAt, type Opts } from './render'
import { MOUND } from './mound'

/**
 * Plain data the Pane's `ui.render` hook hands this module each redraw: exactly what
 * `compose()` itself takes, so this module's own drawing is pixel-identical to what the
 * Pane drew directly before — only now, drawn here, a click over it can be hit-tested.
 */
export type MoundClientProps = { rows: Row[]; ants: Ant[]; folds: Fold[]; opts: Opts }

/**
 * Draws the mound, the tree and the legend, exactly as compose() always has, and reports
 * a click's hit (an ant, by id, or a plain mound cell) back to the real hooks module via
 * `surface.post`. This module has no `$`: it never decides what a click means, only where
 * it landed, against the very lines it just drew — `MOUND.length` is every growth stage's
 * own line count (an invariant the mound's own tests hold), so it never needs stage/shape
 * details to tell a mound row from a tree one.
 */
const draw: ClientModule<MoundClientProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  const lines = compose(props.rows, props.ants, props.folds, props.opts)

  surface.onPointer(e => {
    if (e.type !== 'down') return
    const hit = hitAt(lines, props.ants, MOUND.length, e.x, e.y)
    if (hit) surface.post({ hit, x: e.x, y: e.y })
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
}

export default draw
