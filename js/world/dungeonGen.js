// Procedural dungeon generator (MVP). Produces the exact same JSON
// shape that a hand-authored level file uses (see js/data/levels for
// an authored example) — levelLoader.js doesn't need to know or care
// which one it's looking at.
//
// Algorithm: randomized depth-first "recursive backtracker" maze carve,
// which guarantees every cell is reachable from the start (i.e. a
// guaranteed path always exists to wherever we place the exit).

function mulberry32(seed) {
  // Small deterministic PRNG so a seed can be shared/replayed.
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  { name: 'N', dx: 0, dy: -1, opposite: 'S' },
  { name: 'E', dx: 1, dy: 0, opposite: 'W' },
  { name: 'S', dx: 0, dy: 1, opposite: 'N' },
  { name: 'W', dx: -1, dy: 0, opposite: 'E' },
];

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateDungeon({
  id = 'generated',
  width = 12,
  height = 12,
  seed = Date.now() & 0xffffffff,
  monsterGroups = ['slime', 'orc', 'skeleton'],
  itemPool = ['potion_minor_heal'],
} = {}) {
  const rand = mulberry32(seed);

  // Every side starts as a wall; carving removes the wall between two cells.
  const tiles = Array.from({ length: width * height }, () => ({
    type: 'floor',
    walls: { N: true, E: true, S: true, W: true },
    features: [],
  }));

  const idx = (x, y) => y * width + x;
  const visited = new Array(width * height).fill(false);

  const startX = 0;
  const startY = 0;
  const stack = [{ x: startX, y: startY }];
  visited[idx(startX, startY)] = true;
  let farthest = { x: startX, y: startY, dist: 0 };

  while (stack.length) {
    const current = stack[stack.length - 1];
    const dirs = shuffle([...DIRS], rand);
    let carved = false;

    for (const dir of dirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (visited[idx(nx, ny)]) continue;

      // Knock down the wall between current and neighbor, both directions.
      tiles[idx(current.x, current.y)].walls[dir.name] = false;
      tiles[idx(nx, ny)].walls[dir.opposite] = false;

      visited[idx(nx, ny)] = true;
      stack.push({ x: nx, y: ny });
      carved = true;

      const dist = Math.abs(nx - startX) + Math.abs(ny - startY);
      if (dist > farthest.dist) farthest = { x: nx, y: ny, dist };
      break;
    }

    if (!carved) stack.pop();
  }

  // Guaranteed-reachable exit at the cell farthest from the start.
  tiles[idx(farthest.x, farthest.y)].features.push('stairsDown');
  const exits = [{ at: [farthest.x, farthest.y], to: null, type: 'stairsDown' }];

  // Scatter a handful of encounters and items on open floor cells
  // (never on the start cell), weighted lightly by distance from start.
  const encounters = [];
  const items = [];
  const cellCount = width * height;
  const encounterCount = Math.max(1, Math.floor(cellCount * 0.06));
  const itemCount = Math.max(1, Math.floor(cellCount * 0.08));

  function randomOpenCell() {
    let x, y;
    do {
      x = Math.floor(rand() * width);
      y = Math.floor(rand() * height);
    } while (x === startX && y === startY);
    return { x, y };
  }

  for (let i = 0; i < encounterCount; i++) {
    const { x, y } = randomOpenCell();
    encounters.push({
      at: [x, y],
      monsterGroup: monsterGroups[Math.floor(rand() * monsterGroups.length)],
      chance: 0.35,
    });
  }

  for (let i = 0; i < itemCount; i++) {
    const { x, y } = randomOpenCell();
    items.push({ at: [x, y], itemId: itemPool[Math.floor(rand() * itemPool.length)] });
  }

  return {
    id,
    width,
    height,
    start: { x: startX, y: startY, facing: 'N' },
    tiles,
    exits,
    encounters,
    items,
    seed,
  };
}
