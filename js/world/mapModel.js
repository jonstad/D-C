// Grid-based dungeon map. Matches the level JSON schema from the plan:
// each cell records which of its four sides are walls, plus optional
// features (door, stairs, torch). Facing is a compass index so
// rotation math stays simple: 0=N, 1=E, 2=S, 3=W.

export const FACING = { N: 0, E: 1, S: 2, W: 3 };
export const FACING_NAMES = ['N', 'E', 'S', 'W'];
export const FACING_VECTORS = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 },  // E
  { dx: 0, dy: 1 },  // S
  { dx: -1, dy: 0 }, // W
];

export class MapModel {
  constructor({ id, width, height, tiles, start, exits = [], encounters = [], items = [] }) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.tiles = tiles; // flat array, index = y * width + x
    this.exits = exits;
    this.encounters = encounters;
    this.items = items;
    this.playerPos = { x: start.x, y: start.y, facing: FACING[start.facing] ?? start.facing };
  }

  cellAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.tiles[y * this.width + x];
  }

  currentCell() {
    return this.cellAt(this.playerPos.x, this.playerPos.y);
  }

  // Is there a wall on `facing` side of the cell at (x,y)?
  hasWall(x, y, facing) {
    const cell = this.cellAt(x, y);
    if (!cell) return true; // out of bounds counts as a wall
    return !!cell.walls[FACING_NAMES[facing]];
  }

  exitAt(x, y) {
    return this.exits.find((e) => e.at[0] === x && e.at[1] === y) || null;
  }

  itemsAt(x, y) {
    return this.items.filter((it) => it.at[0] === x && it.at[1] === y && !it.taken);
  }
}

// Loads a MapModel from a plain JSON object (whether it came from the
// procedural generator or a hand-authored file — both produce the
// same shape, per the plan).
export function mapFromJSON(json) {
  return new MapModel(json);
}
