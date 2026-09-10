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

// Renders everything to one side (sign -1 = left, +1 = right) of the
// given forward-line slice: zero or more floor/ceiling tiles reaching
// out to however far that side is actually open, then a wall-side
// panel where it's finally blocked. depth 0 (a wall immediately
// beside the player) collapses to exactly the old single wall-side
// panel — same position, same torch treatment — so this replaces both
// the old direct wall-side render and the old opening-peek fallback
// with one path.
function renderSideWalls(scene, map, slice, sign, dirIdx, zCenter, TILE, WALL_HEIGHT, wallBgSize, wallSideBgSize) {
  const { depth, blocked } = openSideDepth(map, slice.x, slice.y, dirIdx);

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

  if (!blocked) return; // hit the trace budget with no wall found — extremely unlikely given room sizes, just leave the far edge open

  const wallOffsetX = sign * (depth + 0.5) * TILE;
  const wall = panelEl(
    `scene-slice wall-side ${sign < 0 ? 'left' : 'right'}`,
    TILE, WALL_HEIGHT,
    `translate3d(${wallOffsetX}px, 0px, ${zCenter}px) rotateY(${sign < 0 ? 90 : -90}deg)`,
    wallSideBgSize
  );
  // Only the immediately-adjacent wall (depth 0) ever gets a torch,
  // same as before — a wall several tiles into an open room isn't
  // "along the corridor" in the sense the torch density was tuned for.
  if (depth === 0 && hasTorchOnWall(slice.x, slice.y, dirIdx, slice.depth)) {
    wall.style.transformStyle = 'preserve-3d';
    wall.appendChild(torchEl(TILE, WALL_HEIGHT));
  }
  scene.appendChild(wall);
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

    renderSideWalls(scene, map, slice, -1, leftDir, zCenter, TILE, WALL_HEIGHT, wallBgSize, wallSideBgSize);
    renderSideWalls(scene, map, slice, 1, rightDir, zCenter, TILE, WALL_HEIGHT, wallBgSize, wallSideBgSize);

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
