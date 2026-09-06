// Simple top-down minimap: draws only explored tiles (state.discovered)
// plus the player marker with a rotation matching facing, per the plan.
//
// The map itself is drawn north-up and never rotates — only the player
// triangle turns to show facing — so a compass (drawn last, pinned to
// the canvas's own edges rather than any map/world coordinate) is what
// lets a glance at the map be translated into "what's to my left/right
// right now": read off which compass letter is closest to the side of
// the triangle you care about, then match that to the corresponding
// side wall in the first-person view. Without it, "left of the icon on
// the map" only means "your actual left" when you happen to be facing
// north — any other facing and screen-left on this fixed map is really
// some other absolute direction (behind you, if you're facing south).

const CELL = 14; // px per cell on the canvas
const COMPASS_MARGIN = 10; // px in from the canvas edge
const COMPASS_COLOR = '#8a7550'; // matches the wall-line stroke, dimmer than the accent gold used for you-are-here/stairs
const COMPASS_FONT = 'bold 11px Georgia, serif'; // matches the game's own display font family (see base.css)

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

  drawCompass(ctx, canvas, map.playerPos.facing);
}

// Four fixed labels pinned to the canvas's own edges (not the map's
// world coordinates, so they never pan/scroll with the tiles above).
// The one matching current facing is picked out in the brighter accent
// color — a quick way to answer "which of these is forward?" without
// even reading the letters, since it's the same one the triangle points
// at. The other three stay put too, dimmer, so N/E/S/W are always all
// visible for translating any OTHER side of the triangle you care about
// (e.g. "the wall was on the map's west side, and I'm facing north, so
// that's my left").
function drawCompass(ctx, canvas, facing) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const facingLabel = ['N', 'E', 'S', 'W'][facing];
  const labels = [
    { text: 'N', x: cx, y: COMPASS_MARGIN, baseline: 'top' },
    { text: 'S', x: cx, y: canvas.height - COMPASS_MARGIN, baseline: 'bottom' },
    { text: 'E', x: canvas.width - COMPASS_MARGIN, y: cy, baseline: 'middle' },
    { text: 'W', x: COMPASS_MARGIN, y: cy, baseline: 'middle' },
  ];

  ctx.save();
  ctx.font = COMPASS_FONT;
  ctx.textAlign = 'center';
  for (const { text, x, y, baseline } of labels) {
    ctx.textBaseline = baseline;
    ctx.fillStyle = text === facingLabel ? '#c9a24b' : COMPASS_COLOR;
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}
