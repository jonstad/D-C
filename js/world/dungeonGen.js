// Procedural dungeon generator. Produces the exact same JSON shape a
// hand-authored level file uses (see js/data/levels for an authored
// example, and js/world/levelText.js for the friendlier text format
// that compiles down to it) — levelLoader.js doesn't need to know or
// care which one it's looking at.
//
// Algorithm: rooms-and-corridors, not a maze. Earlier versions carved
// every single grid cell into one sprawling, fully-connected maze (a
// classic recursive-backtracker), which guaranteed reachability but
// meant constant turning through narrow 1-wide passages — nothing but
// bends, no open space, and most of a level felt the same. This
// version instead drops a handful of variously-sized rectangular
// rooms onto the grid, connects them in a chain with 1-wide corridors,
// and leaves everything else as solid, unreachable rock. Most of the
// grid is deliberately empty; what's left is a short, readable path
// of rooms linked by hallways instead of a sprawling warren.
//
// Connectivity is still guaranteed the same way it always was — the
// rooms are linked one after another (nearest-neighbor order, so
// corridors tend to run between rooms that are actually close by
// rather than zig-zagging across the whole map) into a single chain,
// so every room is reachable from the start and the exit sits at
// whichever room ended up last in that chain.

function mulberry32(seed) {
  // Small deterministic PRNG so a seed can be shared/replayed.
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Room interior size range, in cells (so a room spans ROOM_MIN..ROOM_MAX
// cells in each dimension) — deliberately bigger than the old maze's
// 1-wide passages so rooms read as actual open spaces to stand in.
const ROOM_MIN = 3;
const ROOM_MAX = 5;
// How many rooms to try to place, and how many random positions to
// attempt before giving up on placing the next one (overlap rejection
// — see placeRooms() — can waste a lot of attempts once the grid
// starts filling up).
const ROOM_ATTEMPTS = 250;

function openBetween(tiles, width, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const idx = (x, y) => y * width + x;
  if (dx === 1) { tiles[idx(x1, y1)].walls.E = false; tiles[idx(x2, y2)].walls.W = false; }
  else if (dx === -1) { tiles[idx(x1, y1)].walls.W = false; tiles[idx(x2, y2)].walls.E = false; }
  else if (dy === 1) { tiles[idx(x1, y1)].walls.S = false; tiles[idx(x2, y2)].walls.N = false; }
  else if (dy === -1) { tiles[idx(x1, y1)].walls.N = false; tiles[idx(x2, y2)].walls.S = false; }
}

// Drops up to `desiredCount` non-overlapping rectangular rooms
// (interior bounds, 1-cell margin kept from the grid edge so a
// corridor can always reach every side of every room). Rejects a
// candidate that would sit adjacent to or overlapping an existing
// room — the 1-cell gap it enforces is what keeps two rooms from
// fusing into one oddly-shaped blob.
function placeRooms(rand, width, height, desiredCount) {
  const rooms = [];
  for (let attempt = 0; attempt < ROOM_ATTEMPTS && rooms.length < desiredCount; attempt++) {
    const rw = ROOM_MIN + Math.floor(rand() * (ROOM_MAX - ROOM_MIN + 1));
    const rh = ROOM_MIN + Math.floor(rand() * (ROOM_MAX - ROOM_MIN + 1));
    if (rw > width - 2 || rh > height - 2) continue; // grid too small for this roll
    const x0 = 1 + Math.floor(rand() * (width - rw - 2));
    const y0 = 1 + Math.floor(rand() * (height - rh - 2));
    const x1 = x0 + rw - 1;
    const y1 = y0 + rh - 1;

    const overlaps = rooms.some((r) => x0 - 1 <= r.x1 + 1 && x1 + 1 >= r.x0 - 1 && y0 - 1 <= r.y1 + 1 && y1 + 1 >= r.y0 - 1);
    if (overlaps) continue;

    rooms.push({ x0, y0, x1, y1, cx: Math.round((x0 + x1) / 2), cy: Math.round((y0 + y1) / 2) });
  }
  return rooms;
}

// Carves a 1-wide L-shaped corridor between two rooms' centers —
// horizontal-then-vertical or vertical-then-horizontal, chosen at
// random per corridor purely for visual variety. If the path happens
// to cross a third room's interior, opening those (already-open)
// walls again is a harmless no-op.
function carveCorridor(tiles, width, rand, a, b) {
  let x = a.cx;
  let y = a.cy;
  const horizontalFirst = rand() < 0.5;

  function stepToward(axis, target) {
    while ((axis === 'x' ? x : y) !== target) {
      const cur = axis === 'x' ? x : y;
      const next = cur + Math.sign(target - cur);
      if (axis === 'x') { openBetween(tiles, width, x, y, next, y); x = next; }
      else { openBetween(tiles, width, x, y, x, next); y = next; }
    }
  }

  if (horizontalFirst) { stepToward('x', b.cx); stepToward('y', b.cy); }
  else { stepToward('y', b.cy); stepToward('x', b.cx); }
}

export function generateDungeon({
  id = 'generated',
  width = 16,
  height = 16,
  seed = Date.now() & 0xffffffff,
  monsterGroups = ['slime', 'orc', 'skeleton'],
  itemPool = ['potion_minor_heal'],
} = {}) {
  const rand = mulberry32(seed);
  const idx = (x, y) => y * width + x;

  // Every cell starts fully walled — most stay that way (solid,
  // unreachable rock); only room interiors and the corridors between
  // them get opened up below.
  const tiles = Array.from({ length: width * height }, () => ({
    type: 'floor',
    walls: { N: true, E: true, S: true, W: true },
    features: [],
  }));

  const desiredRooms = Math.max(3, Math.min(7, Math.round((width * height) / 24)));
  let rooms = placeRooms(rand, width, height, desiredRooms);
  if (!rooms.length) {
    // Pathological fallback (a grid too small for even one room to
    // fit at ROOM_MIN) — a single room filling most of the grid beats
    // generating an unplayable, entirely solid level.
    const x1 = Math.max(1, width - 2);
    const y1 = Math.max(1, height - 2);
    rooms = [{ x0: 1, y0: 1, x1, y1, cx: Math.round((1 + x1) / 2), cy: Math.round((1 + y1) / 2) }];
  }

  // Carve every room's interior: open every internal wall between
  // adjacent cells so the whole rectangle is one connected floor.
  const roomFloorCells = [];
  for (const room of rooms) {
    for (let y = room.y0; y <= room.y1; y++) {
      for (let x = room.x0; x <= room.x1; x++) {
        if (x < room.x1) openBetween(tiles, width, x, y, x + 1, y);
        if (y < room.y1) openBetween(tiles, width, x, y, x, y + 1);
        roomFloorCells.push({ x, y });
      }
    }
  }

  // Chain the rooms together nearest-neighbor style starting from
  // rooms[0] (rather than in their random placement order) — keeps
  // corridors short and local instead of criss-crossing the map, and
  // conveniently tends to leave the single farthest-flung room for
  // last, which is where the exit ends up.
  const chain = [rooms[0]];
  const remaining = rooms.slice(1);
  while (remaining.length) {
    const last = chain[chain.length - 1];
    let bestIndex = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].cx - last.cx;
      const dy = remaining[i].cy - last.cy;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; bestIndex = i; }
    }
    chain.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }
  for (let i = 0; i < chain.length - 1; i++) carveCorridor(tiles, width, rand, chain[i], chain[i + 1]);

  const startRoom = chain[0];
  const endRoom = chain[chain.length - 1];
  const start = { x: startRoom.cx, y: startRoom.cy, facing: 'N' };

  // Face whichever cardinal direction stays inside the start room
  // (guaranteed open, since the whole room's interior is connected) —
  // picking a direction that just opens onto a wall one step away
  // would make the very first view feel cramped, so prefer one that
  // has some room to actually walk into.
  const FACING_CHECK_ORDER = [
    ['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0],
  ];
  for (const [name, dx, dy] of FACING_CHECK_ORDER) {
    const nx = start.x + dx;
    const ny = start.y + dy;
    if (nx >= startRoom.x0 && nx <= startRoom.x1 && ny >= startRoom.y0 && ny <= startRoom.y1) {
      start.facing = name;
      break;
    }
  }

  tiles[idx(endRoom.cx, endRoom.cy)].features.push('stairsDown');
  const exits = [{ at: [endRoom.cx, endRoom.cy], to: null, type: 'stairsDown' }];

  // Scatter encounters/items across room floors only (corridors are
  // just connective tissue, not a natural home for either) — roughly
  // one of each per room, excluding the exact start tile. Extremely
  // small grids that only fit one room still get at least one of
  // each rather than rounding down to zero.
  const encounters = [];
  const items = [];
  const encounterCount = Math.max(1, rooms.length - 1);
  const itemCount = Math.max(1, rooms.length);

  function randomRoomCell() {
    let cell;
    do {
      cell = roomFloorCells[Math.floor(rand() * roomFloorCells.length)];
    } while (cell.x === start.x && cell.y === start.y);
    return cell;
  }

  for (let i = 0; i < encounterCount; i++) {
    const { x, y } = randomRoomCell();
    encounters.push({
      at: [x, y],
      monsterGroup: monsterGroups[Math.floor(rand() * monsterGroups.length)],
      chance: 0.35,
    });
  }

  for (let i = 0; i < itemCount; i++) {
    const { x, y } = randomRoomCell();
    items.push({ at: [x, y], itemId: itemPool[Math.floor(rand() * itemPool.length)] });
  }

  return {
    id,
    width,
    height,
    start,
    tiles,
    exits,
    encounters,
    items,
    seed,
  };
}
