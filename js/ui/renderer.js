// Builds the first-person "scene" for the current cell + facing.
//
// Unlike the earlier version, this renders the corridor as an actual CSS
// 3D scene: each floor/wall panel is a flat div placed in real 3D space
// with `transform: translate3d(...) rotate*(...)`, inside a container
// that has `perspective` set. The browser then does real perspective
// projection (the same math a 3D engine would), which is what makes
// wall textures — brick coursing especially — converge toward the
// vanishing point (screen center) the further they recede, instead of
// running as flat, level rows the way the old 2D-trapezoid approximation
// drew them.

import { FACING_VECTORS } from '../world/mapModel.js';

// How many cells ahead the ray in look() will trace before giving up
// (still stops earlier at a wall, same as always). 5 was tuned for the
// old maze generator, whose 1-wide passages meant you'd almost always
// hit a wall or a turn well before that anyway. Now that
// world/dungeonGen.js drops actual 3-5-cell rooms, a straight sightline
// across an open room can easily run longer than 5 tiles — anything
// past the cutoff isn't dimmed or fogged, it's just never drawn, so it
// read as an abrupt wall of black even though the room kept going. Bumped
// enough to cover the biggest rooms plus a stretch of corridor beyond
// them; more slices costs a handful of extra (cheap) DOM elements per
// render, nothing worth worrying about.
const MAX_DEPTH = 10;

// Tuning knobs, all expressed as multiples of the viewport's own pixel
// size so the scene always fills the frame the same way regardless of
// how big #viewport actually renders (see renderScene for how TILE,
// WALL_HEIGHT and PERSPECTIVE are derived from these each render).
//
// FOV_RATIO: perspective distance as a multiple of viewport width.
// Smaller = wider, more dramatic field of view (walls loom faster as
// you approach them); larger = flatter, more telephoto.
const FOV_RATIO = 1.15;
// WALL_HEIGHT_RATIO: wall height as a multiple of viewport height. Kept
// a bit over 1 so the near wall's top/bottom edges overflow the frame
// (clipped by the viewport's own overflow:hidden) instead of stopping
// short of it and leaving a gap above/below.
const WALL_HEIGHT_RATIO = 1.15;
// How many brick/flagstone tile-repeats fit across one grid cell. Only
// affects texture density, not geometry — TILE and WALL_HEIGHT are
// always rounded to whole multiples of the resulting pitch, so adjacent
// panels (same wall at consecutive depths, a side wall meeting a front
// wall) tile seamlessly across their shared edge with no manual
// position offset needed.
const PITCH_DIVISIONS = 2;

// Wall torches are a purely visual, per-cell decoration (not level data):
// only cells passing this hash get one, on one wall or the other, so
// they read as "a few torches along the corridor" rather than one on
// every panel. Torches beyond this depth aren't worth the DOM cost —
// they'd render too small to read anyway.
const TORCH_MAX_DEPTH = 6;
const TORCH_CHANCE = 3; // roughly 1-in-3 eligible walls gets a torch

// A small, fast, deterministic integer hash — same (x,y,salt) always
// gives the same result, so a torch's presence/absence stays fixed
// rather than re-rolling (and flickering in and out) on every render.
function cellHash(a, b, salt) {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Normalizes a (cell, compass side) wall reference to a canonical form
// that's the same no matter which of its two adjacent cells you're
// looking from — the wall on the north side of (x,y) IS the south side
// of (x,y-1); the west side of (x,y) IS the east side of (x-1,y). Only
// hashing on this canonical form (rather than on "left"/"right", which
// are relative to whichever way the player currently happens to be
// facing) is what makes a given physical wall's torch presence a fixed
// property of the wall itself: the same wall keeps or lacks its torch
// whether it's currently to your left, your right, dead ahead, or (after
// you turn around in place) swapped from one side to the other.
function canonicalWall(x, y, dirIdx) {
  if (dirIdx === 0) return [x, y - 1, 2]; // N side of (x,y) == S side of (x,y-1)
  if (dirIdx === 3) return [x - 1, y, 1]; // W side of (x,y) == E side of (x-1,y)
  return [x, y, dirIdx]; // E (1) and S (2) are already canonical
}

function hasTorchOnWall(x, y, dirIdx, depth) {
  if (depth > TORCH_MAX_DEPTH) return false;
  const [cx, cy, cdir] = canonicalWall(x, y, dirIdx);
  return cellHash(cx, cy, cdir) % TORCH_CHANCE === 0;
}

function look(map, x, y, facing) {
  const slices = [];
  let cx = x, cy = y;
  for (let d = 0; d <= MAX_DEPTH; d++) {
    const cell = map.cellAt(cx, cy);
    if (!cell) break;
    const leftFacing = (facing + 3) % 4;
    const rightFacing = (facing + 1) % 4;
    slices.push({
      depth: d,
      x: cx,
      y: cy,
      hasLeftWall: map.hasWall(cx, cy, leftFacing),
      hasRightWall: map.hasWall(cx, cy, rightFacing),
      hasFrontWall: map.hasWall(cx, cy, facing),
      features: cell.features || [],
    });
    if (map.hasWall(cx, cy, facing)) break;
    const v = FACING_VECTORS[facing];
    cx += v.dx;
    cy += v.dy;
  }
  return slices;
}

function makeEl(className) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

// A flat panel, `w` x `h` in local (pre-transform) pixels, initially
// centered on the scene's visual middle — which is where world (0,0,0)
// projects to, since perspective-origin is 50% 50%. `transform` then
// rotates it in place (around its own center, the default
// transform-origin) and translates the rotated result out to its real
// 3D position: "translate3d(...) rotateX(...)" rotates first (the
// rightmost function applies first) and translates second, so the
// panel tilts on its own axis before being moved to where it belongs.
function panelEl(className, w, h, transform, backgroundSize) {
  const el = makeEl(className);
  el.style.left = `calc(50% - ${w / 2}px)`;
  el.style.top = `calc(50% - ${h / 2}px)`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.transform = transform;
  el.style.backgroundSize = backgroundSize;
  return el;
}

// A wall torch, mounted as a CHILD of a wall-side panel rather than a
// separately-3D-placed object. The wall panel itself already has the
// correct translate3d/rotate transform; giving IT transform-style:
// preserve-3d (done at the call site, only for panels that get a torch)
// is what lets this prop's own translateZ push it forward off the
// wall's surface instead of flattening back onto it like a decal —
// real depth that visibly parallaxes as the player turns or moves,
// rather than a flat sprite that just happens to sit on the brick.
//
// A single flat plane pushed off the wall reads fine head-on, but a
// flat plane viewed near edge-on (a torch on the near-side wall, with
// the camera looking straight down the corridor past it) foreshortens
// to almost nothing — no width left to show a torch shape at all. Real
// wood/iron has volume, so instead of one plane this builds a small
// "cross" of two identical planes sharing the same vertical centerline,
// one facing straight out from the wall and one rotated 90° to face
// along the wall — the same billboard-cross trick sprite-based 3D games
// use for things like torches or foliage. Whichever plane is closer to
// face-on for the camera's current angle reads clearly; there's always
// at least one within about 45° of face-on, so the torch never
// disappears into a sliver.
//
// Position/size are all in the wall panel's own local pixels: local x
// runs along the wall's length (0..TILE), local y is height (0..WALL_HEIGHT,
// with 0 at the ceiling edge and WALL_HEIGHT at the floor edge, since
// that's how the wall-side panel itself is built in renderScene).
function torchEl(tile, wallHeight) {
  const torchHeight = wallHeight * 0.34;
  const torchWidth = torchHeight / 2; // matches torch.png's 160:320 aspect
  const flameAnchorFrac = 104 / 320; // where the flame sits in torch.png
  const flameCenterY = wallHeight * 0.36; // slightly above eye level
  const baseLeft = tile / 2 - torchWidth / 2;
  const baseTop = flameCenterY - flameAnchorFrac * torchHeight;
  // How far the cross's shared centerline sits off the wall, in world
  // px. Positive translateZ always means "toward whatever this wall's
  // own front face points at" (rotate-then-translate order), which for
  // a left wall, a right wall, and a front wall are three different
  // world directions — but all three happen to be "out into the room /
  // toward the camera", exactly where a real torch bracket would stick
  // out.
  const stickOut = wallHeight * 0.07;

  const frag = document.createDocumentFragment();

  // A contact shadow, deliberately left flush on the wall (no Z offset)
  // — it's what actually sells the prop as sticking out in front of it,
  // the way a real protruding object darkens the surface behind it.
  const shadow = makeEl('torch-shadow');
  const shadowW = torchWidth * 1.7;
  const shadowH = torchWidth * 1.1;
  shadow.style.left = `${baseLeft + torchWidth / 2 - shadowW / 2}px`;
  shadow.style.top = `${baseTop + torchHeight * 0.34 - shadowH / 2}px`;
  shadow.style.width = `${shadowW}px`;
  shadow.style.height = `${shadowH}px`;
  frag.appendChild(shadow);

  // The rig positions+sizes the cross as a whole (same box a single flat
  // mount used to occupy) and pushes it off the wall; preserve-3d on it
  // is what lets its two blade children each keep their own rotation
  // instead of both flattening onto the rig's own plane.
  const rig = makeEl('torch-rig');
  rig.style.left = `${baseLeft}px`;
  rig.style.top = `${baseTop}px`;
  rig.style.width = `${torchWidth}px`;
  rig.style.height = `${torchHeight}px`;
  rig.style.transform = `translateZ(${stickOut}px)`;
  rig.style.transformStyle = 'preserve-3d';

  const flameW = torchWidth * 0.3;
  const flameH = torchWidth * 0.48;
  const flameLeft = torchWidth / 2 - flameW / 2;
  const flameTop = flameAnchorFrac * torchHeight - flameH * 0.6;

  function buildBlade(rotateDeg) {
    const blade = makeEl('torch-blade');
    if (rotateDeg) blade.style.transform = `rotateY(${rotateDeg}deg)`;

    const img = document.createElement('img');
    // Unlike CSS url(...) (resolved relative to view.css's own folder),
    // an <img src> set from JS resolves relative to the document
    // (index.html at the repo root), so this path has no leading '../'.
    img.src = 'assets/props/torch.png';
    img.alt = '';
    blade.appendChild(img);

    const flame = makeEl('torch-flame');
    flame.style.width = `${flameW}px`;
    flame.style.height = `${flameH}px`;
    flame.style.left = `${flameLeft}px`;
    flame.style.top = `${flameTop}px`;
    blade.appendChild(flame);

    return blade;
  }

  rig.appendChild(buildBlade(0));
  rig.appendChild(buildBlade(90));

  frag.appendChild(rig);
  return frag;
}

// look() only ever traces straight ahead, so a side wall being absent
// (an opening toward an adjacent cell) used to just peek exactly one
// tile sideways before capping it off — fine for the old maze's 1-wide
// passages, where a "room" was never more than a single cell deep
// anyway, but with world/dungeonGen.js now dropping actual 3-5-cell
// rooms, one tile of peek left most of a room's true width undrawn:
// pure black past that first sliver, even though it was open floor.
//
// This instead traces how many cells you could actually walk sideways
// before hitting a real wall (openSideDepth) and draws a floor/ceiling
// tile for every one of them, capped with a proper wall panel at
// whichever offset the real wall sits — the same wall-side rendering
// used for an immediately-adjacent wall, just positioned farther out.
// A simple rectangular room has no interior walls, so tracing sideways
// from any point inside it walks all the way to the room's actual far
// wall, which is exactly what should be drawn.
const SIDE_MAX_DEPTH = 6; // safety cap, comfortably past dungeonGen.js's largest room (5 cells) so a real far wall is always reached

function openSideDepth(map, x, y, dirIdx) {
  let cx = x, cy = y, depth = 0;
  while (depth < SIDE_MAX_DEPTH) {
    if (map.hasWall(cx, cy, dirIdx)) return { depth, blocked: true };
    const v = FACING_VECTORS[dirIdx];
    cx += v.dx; cy += v.dy;
    depth++;
  }
  return { depth, blocked: false }; // ran out of trace budget without finding a wall — draws the floor/ceiling it found but leaves the far edge open rather than guessing at a wall that isn't there
}

// How many lateral tiles out a wall-side panel can sit before it
// perspective-projects mostly or entirely outside the frame. CSS
// perspective maps a world offset `o` at depth `z` to a screen offset of
// roughly `o * PERSPECTIVE/(PERSPECTIVE+|z|)` — the SAME lateral offset
// swings much further across the screen when |z| is small (a nearby
// slice) than when it's large (a far one), because there's less distance
// over which the perspective divide can shrink it back down. A wall 2+
// tiles to the side of the player's OWN cell (forwardDepth 0) lands
// almost entirely off-screen; the identical 2-tile offset attached to a
// slice 5 tiles down a corridor lands comfortably inside the frame —
// which is exactly what made the wide-room and long-corridor tests look
// right while a room only 2 tiles wide, viewed from right at its edge,
// still came out wrong.
//
// Solving `o * PERSPECTIVE/(PERSPECTIVE+|z|) <= TILE/2` (the frame's own
// half-width, since TILE is defined as the full viewport width) for `o`
// gives the formula below. The wall panel itself sits half a tile
// further out than the tile count it's keyed to (offset
// `depth + 0.5`, matching the wall placement below), so this solves for
// the largest integer depth whose wall still lands at or inside that
// half-width, not for the offset itself.
//
// Used only to decide whether it's worth drawing a wall at all — never
// to decide how much floor/ceiling to draw, which stays harmless even
// off-screen (see renderSideWalls).
function safeSideCapTiles(forwardDepth) {
  const zMagTiles = forwardDepth + 0.5;
  const safeOffsetTiles = 0.5 * (1 + zMagTiles / FOV_RATIO);
  return Math.max(0, Math.floor(safeOffsetTiles - 0.5));
}

// Renders everything to one side (sign -1 = left, +1 = right) of the
// given forward-line slice: a floor/ceiling tile for every cell that's
// actually open that way (openSideDepth), and — only when the real wall
// that stops it is close enough to actually land on screen (see
// safeSideCapTiles) — a wall-side panel there. depth 0 (a wall
// immediately beside the player) collapses to exactly the old single
// wall-side panel — same position, same torch treatment.
//
// The floor/ceiling tiles are always drawn out to the FULL traced depth
// regardless of how far that projects — an extra tile that lands outside
// the frame is simply clipped by the viewport's own overflow:hidden, at
// no cost. A wall panel that lands off-screen isn't just wasted, though:
// an earlier version of this drew one anyway, at some nearer distance
// that WOULD land on screen, and that actively lied about the map
// whenever the real reason the true wall was "too far to show" is that
// there isn't one nearby at all — just an open corridor continuing past
// what this forward-facing glance can represent (a T-junction is exactly
// this: the branch is wide open, it's just not aimed at the camera). So:
// no wall unless the real one is at or inside the safe distance. Where it
// isn't, the floor and ceiling simply recede toward the horizon and off
// the sides of the frame — "this keeps going, you can't see how far from
// here" rather than a fabricated dead end. The tradeoff is that a room
// wider than about 2 tiles, viewed edge-on from right at its threshold,
// shows as open darkness rather than a crisp wall until the view angle
// improves (walking a tile further in, or turning to face it) — better
// than misrepresenting whether a path is open, since the minimap already
// tells the player the truth about that.
function renderSideWalls(scene, trace, slice, sign, dirIdx, zCenter, TILE, WALL_HEIGHT, wallBgSize, wallSideBgSize) {
  const { depth, blocked } = trace;

  for (let i = 1; i <= depth; i++) {
    const offsetX = sign * i * TILE;
    scene.appendChild(panelEl(
      'scene-slice floor-slice',
      TILE, TILE,
      `translate3d(${offsetX}px, ${WALL_HEIGHT / 2}px, ${zCenter}px) rotateX(90deg)`,
      wallBgSize
    ));
    scene.appendChild(panelEl(
      'scene-slice ceiling-slice',
      TILE, TILE,
      `translate3d(${offsetX}px, ${-WALL_HEIGHT / 2}px, ${zCenter}px) rotateX(-90deg)`,
      wallSideBgSize
    ));
  }

  if (!blocked || depth > safeSideCapTiles(slice.depth)) return; // no real wall within safe view range — leave it open, not faked shut

  const wallOffsetX = sign * (depth + 0.5) * TILE;
  const wall = panelEl(
    `scene-slice wall-side ${sign < 0 ? 'left' : 'right'}`,
    TILE, WALL_HEIGHT,
    `translate3d(${wallOffsetX}px, 0px, ${zCenter}px) rotateY(${sign < 0 ? 90 : -90}deg)`,
    wallSideBgSize
  );
  // Only a genuinely adjacent wall (depth 0) ever gets a torch, same as
  // before — a wall several tiles into an open room isn't "along the
  // corridor" in the sense the torch density was tuned for.
  if (depth === 0 && hasTorchOnWall(slice.x, slice.y, dirIdx, slice.depth)) {
    wall.style.transformStyle = 'preserve-3d';
    wall.appendChild(torchEl(TILE, WALL_HEIGHT));
  }
  scene.appendChild(wall);
}

// renderSideWalls only ever looks straight sideways from each forward
// slice's own (x,y) — it has no notion of the DIAGONAL corner between
// one slice's lateral reach and the next slice's, so when a room's
// boundary steps in or out as you look farther down it (a corridor
// widening into a room, an alcove, an irregular room shape — anything
// dungeonGen.js's rectangular rooms connected by corridors produces
// constantly), nothing ever closes that corner. Floor and ceiling still
// render correctly on both sides of the step individually, but the gap
// between them is just empty space, and whatever's beyond it — another
// wall, another room — shows through where solid rock belongs.
//
// This closes that gap: wherever the traced depth to one side differs
// between a slice and the next-nearer one, there's a real perpendicular
// wall segment at that boundary, spanning from the nearer reach to the
// farther one. It renders as a plain forward-facing panel — the same
// unrotated orientation as the main dead-end wall — because the viewer
// is always on the near (smaller-z) side of this boundary and so always
// sees its front face, whichever way the step actually goes.
//
// Both traces have to be genuinely blocked (a real wall found) for this
// to fire. openSideDepth gives up after SIDE_MAX_DEPTH tiles and reports
// that as `depth` even with nothing there (blocked: false) — treating
// that cap as though it were the true wall position, the same mistake
// renderSideWalls avoids for a single wall, is worse here: it draws a
// panel spanning all the way out to that fabricated edge, at whatever
// width and offset that implies, which can be wide enough to swallow
// the entire forward view — including the real, closer geometry (like
// the actual front wall) it has no business standing in front of. Where
// either side is unconfirmed, this leaves the corner open rather than
// guessing at where to close it, same principle as renderSideWalls.
function renderSideStep(scene, nearTrace, farTrace, sign, boundaryDepthIndex, TILE, WALL_HEIGHT, wallBgSize) {
  if (!nearTrace.blocked || !farTrace.blocked) return; // at least one side is an unconfirmed guess, not a real wall — don't fake the corner
  if (nearTrace.depth === farTrace.depth) return; // boundary is flush, no corner to close
  const lo = Math.min(nearTrace.depth, farTrace.depth);
  const hi = Math.max(nearTrace.depth, farTrace.depth);
  const z = -boundaryDepthIndex * TILE;
  const width = (hi - lo) * TILE;
  const centerOffset = sign * ((lo + hi) / 2) * TILE;
  scene.appendChild(panelEl(
    'scene-slice wall-front',
    width, WALL_HEIGHT,
    `translate3d(${centerOffset}px, 0px, ${z}px)`,
    wallBgSize
  ));
}

export function renderScene(viewportEl, map) {
  viewportEl.innerHTML = '';
  const vw = viewportEl.clientWidth || 640;
  const vh = viewportEl.clientHeight || 480;

  // TILE = vw and EYE_Z = 0 together are what make the corridor fill the
  // frame instead of floating in a smaller box with black margins around
  // it. CSS's perspective projection scales a point at depth z by
  // `perspective / (perspective - z)`, which equals exactly 1 (no
  // scaling at all) at z=0 — so a panel placed there renders at its own
  // true local pixel size. Putting the nearest wall's near edge exactly
  // at z=0, sized to exactly vw wide, means that edge lands exactly on
  // the viewport's own left/right edges: no gap, and no need to solve
  // for a scale factor at all. Everything farther in (zFar and beyond)
  // is at z<0 and shrinks normally from there.
  const TILE = vw;
  const PITCH = TILE / PITCH_DIVISIONS;
  const WALL_HEIGHT = Math.ceil((vh * WALL_HEIGHT_RATIO) / PITCH) * PITCH;
  const PERSPECTIVE = TILE * FOV_RATIO;
  const EYE_Z = 0;

  const wallSideBgSize = `100% 100%, ${PITCH}px ${PITCH}px`;
  const wallBgSize = `${PITCH}px ${PITCH}px`;

  const scene = makeEl('scene-3d');
  scene.style.perspective = `${PERSPECTIVE}px`;

  const { x, y, facing } = map.playerPos;
  const slices = look(map, x, y, facing);
  const leftDir = (facing + 3) % 4;
  const rightDir = (facing + 1) % 4;

  // Traced once per slice up front (rather than inside renderSideWalls)
  // so renderSideStep can compare a slice's reach against the very next
  // slice's — see renderSideStep for why that comparison is needed.
  const leftTraces = slices.map((slice) => openSideDepth(map, slice.x, slice.y, leftDir));
  const rightTraces = slices.map((slice) => openSideDepth(map, slice.x, slice.y, rightDir));

  // Draw back-to-front. The browser sorts overlapping 3D geometry within
  // the preserve-3d context on its own, but painting far-to-near keeps
  // things sane for any flat 2D overlay added after (the fog vignette).
  for (let i = slices.length - 1; i >= 0; i--) {
    const slice = slices[i];
    const zNear = -(EYE_Z + slice.depth * TILE);
    const zFar = zNear - TILE;
    const zCenter = zNear - TILE / 2;

    scene.appendChild(panelEl(
      'scene-slice floor-slice',
      TILE, TILE,
      `translate3d(0px, ${WALL_HEIGHT / 2}px, ${zCenter}px) rotateX(90deg)`,
      wallBgSize
    ));

    // Ceiling mirrors the floor (same rotation, opposite Y and sign),
    // closing off the top of the frame. Without it, the walls' top
    // edges — a receding line just like the brick coursing — converge
    // toward the vanishing point and leave a growing black wedge above
    // them instead of a proper vaulted-corridor look.
    scene.appendChild(panelEl(
      'scene-slice ceiling-slice',
      TILE, TILE,
      `translate3d(0px, ${-WALL_HEIGHT / 2}px, ${zCenter}px) rotateX(-90deg)`,
      wallSideBgSize
    ));

    renderSideWalls(scene, leftTraces[i], slice, -1, leftDir, zCenter, TILE, WALL_HEIGHT, wallBgSize, wallSideBgSize);
    renderSideWalls(scene, rightTraces[i], slice, 1, rightDir, zCenter, TILE, WALL_HEIGHT, wallBgSize, wallSideBgSize);

    // The corner between this slice's own lateral reach and the very
    // next (nearer) slice's — see renderSideStep. Compared here rather
    // than in the loop's own i>0 branch below the front-wall handling so
    // it happens once per boundary, keyed to the farther slice of the
    // pair (this one), regardless of draw order.
    if (i > 0) {
      renderSideStep(scene, leftTraces[i - 1], leftTraces[i], -1, i, TILE, WALL_HEIGHT, wallBgSize);
      renderSideStep(scene, rightTraces[i - 1], rightTraces[i], 1, i, TILE, WALL_HEIGHT, wallBgSize);
    }

    if (slice.hasFrontWall) {
      const isDoor = slice.features.includes('door');
      const isStairs = slice.features.includes('stairsDown');
      const front = panelEl(
        `scene-slice ${isDoor ? 'opening-door' : isStairs ? 'opening-stairs' : 'wall-front'}`,
        TILE, WALL_HEIGHT,
        `translate3d(0px, 0px, ${zFar}px)`,
        wallBgSize
      );
      if (isStairs) {
        const label = makeEl('stairs-label');
        label.innerHTML = 'Stairs Down<span class="chevron">&#9660;</span>';
        front.appendChild(label);
      } else if (!isDoor && hasTorchOnWall(slice.x, slice.y, facing, slice.depth)) {
        // torchEl only cares about the panel's own width/height to size
        // and center itself — it doesn't know or care that this panel
        // faces the camera directly instead of receding to the side, so
        // the exact same call works here as it does for a side wall.
        front.style.transformStyle = 'preserve-3d';
        front.appendChild(torchEl(TILE, WALL_HEIGHT));
      }
      scene.appendChild(front);
    }
  }

  viewportEl.appendChild(scene);
  viewportEl.appendChild(makeEl('viewport-fog'));
}
