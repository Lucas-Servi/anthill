/**
 * A scratch renderer, not part of the plugin: the plugin's icon (the image plugin.json's
 * `icon` names, for Anthropic's directory), as pixel art in the mound's own palette (mound.ts
 * MOUND_PALETTE): the anthill on a dark tile, an ant peeking out of its summit hole the way a
 * resting ant's antennae do in the pane, and a few agents' dots at work inside it. Prints an
 * HTML page holding the icon as an SVG, one rect per pixel, to capture at 512x512:
 *
 *   npx -y esbuild@0.28.2 scripts/icon.ts --bundle --outfile=/tmp/anthill-icon.js --format=esm --platform=node
 *   mkdir -p /tmp/anthill-icon && node /tmp/anthill-icon.js > /tmp/anthill-icon/index.html
 */
import { MOUND_PALETTE } from '../hooks/mound'

/** The tile behind everything: the pane's own dark window color. */
const TILE = '#1a1613'

/** Each key of GRID to a color; '.' is the tile. */
const PALETTE: Record<string, string> = {
  s: MOUND_PALETTE.s!, // outline
  d: MOUND_PALETTE.d!, // dark terracotta
  o: MOUND_PALETTE.o!, // Claude orange
  l: MOUND_PALETTE.l!, // light shade
  H: MOUND_PALETTE.H!, // the hole
  T: MOUND_PALETTE.T!, // soil
  g: MOUND_PALETTE.g!, // grass
  k: MOUND_PALETTE.k!, // a gold sparkle
  w: MOUND_PALETTE.w!, // a white sparkle
  R: '#ff5f5f', // the peeking ant: main's own red
  E: '#2a1810', // its eyes
  X: '#8a3a24', // a dug tunnel: the pane's own packed tunnel wall (render.ts PASSAGE_COLOR)
  G: '#5fff5f', // other agents' dots, in their palette colors
  Y: '#ffff5f',
  B: '#5f87ff',
}

/** 32 x 32 pixels. */
const GRID: string[] = [
  '................................',
  '................................',
  '................................',
  '................................',
  '.........................k......',
  '........................kkk.....',
  '.........................k......',
  '.....w......R......R............',
  '.............R....R.............',
  '..............R..R..............',
  '..............RRRR..........w...',
  '.............RERRER.............',
  '.............RRRRRR.............',
  '...........sHRRRRRRHs...........',
  '.........ssHHRRRRRRHHss.........',
  '........ssddooooooooddss........',
  '.......ssdoololXlllloodss.......',
  '......ssdoollllXolllloodss......',
  '.....ssdoollollXXYlolloodss.....',
  '....ssdoolllllXollXXllooodss....',
  '....ssdoolloXXllllolXXXoodss....',
  '...ssdooXXXXllollllllXBXoodss...',
  '...ssdoXGXollllllollllXloodss...',
  '..gssdooXllllollllllollloodssg..',
  '.gssdoooooooooooooooooooooodssg.',
  '.TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.',
  '.TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
]

const SIZE = 512
const PX = SIZE / GRID.length

const rects = GRID.flatMap((line, y) =>
  Array.from(line).flatMap((key, x) => {
    const color = PALETTE[key]
    return color ? [`<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${color}"/>`] : []
  }),
)

console.log(`<!doctype html>
<html><head><meta charset="utf-8"><title>anthill icon</title><style>
  html, body { margin: 0; background: ${TILE}; overflow: hidden; }
  svg { display: block; }
</style></head><body>
<svg id="icon" xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">
  <rect width="${SIZE}" height="${SIZE}" fill="${TILE}"/>
  ${rects.join('\n  ')}
</svg>
</body></html>`)
