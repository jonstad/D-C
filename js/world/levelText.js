// Parses the human-friendly text format hand-authored levels are
// written in (see js/data/levels/level01.txt for a real example) into
// the same plain JSON shape mapFromJSON()/loadLevelFromJSON() already
// consume — this is purely a friendlier *source* for that same
// schema, not a new runtime representation. Nothing about how the
// game loads or plays a level changes; only how a human writes one.
//
// Format, three sections in order (blank lines between them are
// optional and ignored):
//
//   id: my-level          <- a few "key: value" meta lines
//   facing: N             <- which way the party faces at the start
//
//   map:
//   #.X.#                 <- one character per cell; row 0 is y=0
//   ##.##                     (north/top), each row is one y, each
//   ##.##                     column one x. Rows must all be the same
//   ##..1                     length — that length is the level's width,
//   ...##                     the row count is its height.
//   12###
//   ##@##
//
//   legend:
//   1 = item potion_minor_heal      <- extra params for marker chars
//   2 = encounter slime 0.4            used in the map (see below)
//
// Map characters:
//   .   plain floor
//   #   void — not part of the level, solid on every side, never
//       reachable (everything outside the rooms/corridors you draw)
//   @   the party's starting cell (exactly one required) — which
//       direction they face is the separate `facing:` meta line, since
//       a single character can't also carry a direction
//   X   stairs down (exactly one required) — also becomes the level's
//       one exits[] entry
//   any other character: looked up in the legend section below the
//       map, which says what it means (an item to place there, or a
//       monster encounter) — the same character can be reused at
//       multiple cells if you want the same thing in several places
//
// Walls are never written explicitly: any two orthogonally-adjacent
// floor cells (anything that isn't '#') are automatically open to each
// other, and every floor cell bordering a '#' or the edge of the grid
// is automatically walled on that side. There's deliberately no way to
// wall off two adjacent floor cells from each other — every hand-built
// level so far is rooms-and-corridors, not a true maze (that's what
// world/dungeonGen.js's procedural generator is for), so this covers
// everything actually needed while staying simple to draw and read.
//
// The starting cell always gets a 'door' feature and a forced solid
// wall on whichever side is directly behind the party's starting
// facing (so turning around in the opening room shows the door they
// just walked through) — this isn't written in the map text, it's
// applied automatically from the `facing:` meta line.

const FACING_FROM_LETTER = { N: 0, E: 1, S: 2, W: 3 };
const DIR_NAMES = ['N', 'E', 'S', 'W'];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE = [2, 3, 0, 1];

function parseLegendLine(line, lineNo) {
  const eq = line.indexOf('=');
  if (eq === -1) throw new Error(`Level text legend line ${lineNo}: expected "<char> = <spec>", got "${line}"`);
  const marker = line.slice(0, eq).trim();
  const spec = line.slice(eq + 1).trim().split(/\s+/);
  if (marker.length !== 1) throw new Error(`Level text legend line ${lineNo}: marker must be one character, got "${marker}"`);
  const [kind, ...params] = spec;
  if (kind === 'item') {
    const [itemId] = params;
    if (!itemId) throw new Error(`Level text legend line ${lineNo}: "item" needs an itemId, got "${line}"`);
    return { marker, kind, itemId };
  }
  if (kind === 'encounter') {
    const [monsterGroup, chanceStr] = params;
    const chance = Number(chanceStr);
    if (!monsterGroup || Number.isNaN(chance)) {
      throw new Error(`Level text legend line ${lineNo}: "encounter" needs "<monsterGroup> <chance>", got "${line}"`);
    }
    return { marker, kind, monsterGroup, chance };
  }
  throw new Error(`Level text legend line ${lineNo}: unknown kind "${kind}" (expected "item" or "encounter")`);
}

export function parseLevelText(text) {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');

  const meta = {};
  const mapRows = [];
  const legendLines = [];
  let section = 'meta';

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;

    if (section === 'meta') {
      if (trimmed === '') continue;
      if (trimmed === 'map:') { section = 'map'; continue; }
      const colon = trimmed.indexOf(':');
      if (colon === -1) throw new Error(`Level text line ${lineNo}: expected "key: value" before the map, got "${trimmed}"`);
      meta[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
      continue;
    }

    if (section === 'map') {
      if (trimmed === '' || trimmed === 'legend:') { section = trimmed === 'legend:' ? 'legend' : 'gap'; continue; }
      mapRows.push(line.replace(/\s+$/, '')); // keep leading chars exact, only trim trailing junk
      continue;
    }

    if (section === 'gap') {
      if (trimmed === '') continue;
      if (trimmed === 'legend:') { section = 'legend'; continue; }
      throw new Error(`Level text line ${lineNo}: expected "legend:" or a blank line after the map, got "${trimmed}"`);
    }

    if (section === 'legend') {
      if (trimmed === '') continue;
      legendLines.push({ text: trimmed, lineNo });
    }
  }

  if (!mapRows.length) throw new Error('Level text has no map: section');
  const width = mapRows[0].length;
  const height = mapRows.length;
  mapRows.forEach((row, i) => {
    if (row.length !== width) {
      throw new Error(`Level text map row ${i + 1} is ${row.length} characters wide, expected ${width} (row 1's width) — every row must match`);
    }
  });

  const legend = new Map();
  for (const { text: line, lineNo } of legendLines) {
    const entry = parseLegendLine(line, lineNo);
    legend.set(entry.marker, entry);
  }

  const facingLetter = (meta.facing || 'N').toUpperCase();
  if (!(facingLetter in FACING_FROM_LETTER)) {
    throw new Error(`Level text "facing:" must be one of N/E/S/W, got "${meta.facing}"`);
  }
  const startFacing = FACING_FROM_LETTER[facingLetter];

  const isVoid = (ch) => ch === '#';
  const idx = (x, y) => y * width + x;
  const tiles = Array.from({ length: width * height }, () => ({
    type: 'floor', walls: { N: true, E: true, S: true, W: true }, features: [],
  }));

  let start = null;
  let stairsAt = null;
  const encounters = [];
  const items = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = mapRows[y][x];
      if (isVoid(ch)) continue; // stays fully walled, never visited below

      const cell = tiles[idx(x, y)];
      // Open toward any orthogonally-adjacent floor cell; leave the
      // default solid wall in place toward void or the grid's edge.
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (isVoid(mapRows[ny][nx])) continue;
        cell.walls[DIR_NAMES[d]] = false;
      }

      if (ch === '@') {
        if (start) throw new Error(`Level text has more than one '@' start marker (already found one at ${JSON.stringify(start)})`);
        start = { x, y, facing: startFacing };
      } else if (ch === 'X') {
        if (stairsAt) throw new Error(`Level text has more than one 'X' stairs marker (already found one at ${JSON.stringify(stairsAt)})`);
        stairsAt = [x, y];
        cell.features.push('stairsDown');
      } else if (ch !== '.') {
        const entry = legend.get(ch);
        if (!entry) throw new Error(`Level text map uses marker "${ch}" at (${x},${y}) with no matching legend entry`);
        if (entry.kind === 'item') items.push({ at: [x, y], itemId: entry.itemId });
        else encounters.push({ at: [x, y], monsterGroup: entry.monsterGroup, chance: entry.chance });
      }
    }
  }

  if (!start) throw new Error("Level text has no '@' start marker");
  if (!stairsAt) throw new Error("Level text has no 'X' stairs marker");

  // The entrance door: always on the wall directly behind the party's
  // starting facing, so turning around shows the door they just came
  // through. Forced solid regardless of what the auto-open pass above
  // did (harmless — it'd already be solid unless '@' sits directly
  // beside another floor cell on that exact side, which would be an
  // odd level to draw, but this keeps the door reliable either way).
  const backDir = OPPOSITE[start.facing];
  const startCell = tiles[idx(start.x, start.y)];
  startCell.walls[DIR_NAMES[backDir]] = true;
  startCell.features.push('door');

  return {
    id: meta.id || 'level-from-text',
    width,
    height,
    start,
    tiles,
    exits: [{ at: stairsAt, to: null, type: 'stairsDown' }],
    encounters,
    items,
  };
}
