// Simple top-down minimap: draws only explored tiles (state.discovered)
// plus the player marker with a rotation matching facing, per the plan.

const CELL = 14; // px per cell on the canvas

export function renderMinimap(canvas, map, discovered) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const offsetX = canvas.width / 2 - (map.playerPos.x + 0.5) * CELL;
  const offsetY = canvas.height / 2 - (map.playerPos.y + 0.5) * CELL;

  for (const key of discovered) {
    const [x, y] = key.split(',').map(Number);
    const cell = map.cellAt(x, y);
    if (!cell) continue;
    const px = offsetX + x * CELL;
    const py = offsetY + y * CELL;

    ctx.fillStyle = '#2a2318';
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);

    ctx.strokeStyle = '#8a7550';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (cell.walls.N) { ctx.moveTo(px, py); ctx.lineTo(px + CELL, py); }
    if (cell.walls.S) { ctx.moveTo(px, py + CELL); ctx.lineTo(px + CELL, py + CELL); }
    if (cell.walls.E) { ctx.moveTo(px + CELL, py); ctx.lineTo(px + CELL, py + CELL); }
    if (cell.walls.W) { ctx.moveTo(px, py); ctx.lineTo(px, py + CELL); }
    ctx.stroke();

    if (cell.features?.includes('stairsDown')) {
      ctx.fillStyle = '#c9a24b';
      ctx.fillRect(px + CELL / 2 - 3, py + CELL / 2 - 3, 6, 6);
    }
  }

  // Player marker: a small triangle rotated to match facing.
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const angleByFacing = { 0: -Math.PI / 2, 1: 0, 2: Math.PI / 2, 3: Math.PI };
  const angle = angleByFacing[map.playerPos.facing];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#e8dfc9';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, 5);
  ctx.lineTo(-5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
