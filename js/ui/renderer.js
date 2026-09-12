// Builds the first-person "scene" for the current cell + facing.
//
// This renders the corridor as an actual CSS 3D scene: each floor/wall
// panel is a flat div placed in real 3D space with
// `transform: translate3d(...) rotate*(...)`, inside a container that has
// `perspective` set. The browser then does real perspective projection
// (the same math a 3D engine would), which is what makes wall textures —
// brick coursing especially — converge toward the vanishing point (screen
// center) the further they recede, instead of running as flat, level rows
// the way a 2D-trapezoid approximation would draw them.
//
// GEOMETRY MODEL: a wall-respecting flood fill (floodFill, below) walks
// every cell reachable from the player's own cell without crossing a
// wall, out to MAX_DEPTH. For each reachable cell we know its exact
// position in camera space (via a fixed rotation derived from the
// player's facing — see floodFill) and, directly from the map data,
// exactly which of its four sides are real walls. We then emit one floor
// panel, one ceiling panel, and one wall panel per real wall edge, each
// placed by exact grid math — never inferred, capped, or guessed at.
//
// An earlier version of this file instead cast one ray straight ahead
// and patched in independent sideways "peeks" alongside it — a model
// that had no notion of a room at all, only of a single forward line.
// Every bug that came up while that stood (walls not drawn far enough to
// the side; walls drawn off-screen as flat black rectangles; open
// T-junctions misrepresented as sealed; diagonal room corners left as
// gaps you could see through; and finally a fabricated wall spanning the
// whole screen from an unconfirmed "gave up searching" guess) traced
// back to the same root cause: the renderer was trying to reconstruct a
// room's shape from a handful of independent linear probes instead of
// just knowing the shape, which the map already fully specifies. The
// flood fill below has no probes, caps, or corner patches to get wrong —
// every panel it draws corresponds to a real, confirmed wall or floor
// tile the map data says is there.

import { FACING_VECTORS } from '../world/mapModel.js';

// How many cells out the flood fill in floodFill() will explore before
// giving up, in BOTH the forward and lateral directions (still stops
// earlier at a wall, same as always). 5 was tuned for the old maze
// generator, whose 1-wide passages meant you'd almost always hit a wall
// or a turn well before that anyway. Now that world/dungeonGen.js drops
// actual 3-5-cell rooms, a straight sightline (or a wide room) can easily
// run longer than 5 tiles — anything past the cutoff isn't dimmed or
// fogged, it's just never drawn, so it read as an abrupt wall of black
// even though the room kept going. Bumped enough to cover the biggest
// rooms plus a stretch of corridor beyond them; more panels costs a
// handful of extra (cheap) DOM elements per render, nothing worth
// worrying about.
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

// How many lateral (side-to-side) tiles out the flood fill is allowed to
// wander at a given forward depth, before it stops being worth including
// at all. Graph reachability alone (can you walk there without crossing
// a wall) is NOT the same thing as visibility (is there any plausible
// line of sight to it from the camera) — a fully open room connected to
// the player's cell only through a single one-tile-wide gap is, by pure
// reachability, "reachable" across its ENTIRE width the moment you're
// one step past that gap, even though a doorway that narrow could never
// actually show you that much of the room at once. Left unchecked, that
// mismatch floods the scene with geometry the camera could never
// possibly see, which both wastes DOM nodes and gives the browser's
// (approximate, not a true per-pixel depth buffer) 3D depth-sort so much
// overlapping, similarly-angled geometry to sort that it can visibly get
// the paint order wrong.
//
// This isn't a wall-drawing inference (nothing here decides where a
// wall goes — that's still read directly off the map, unconditionally,
// for every cell the fill does keep). It's a scope limit on the fill
// itself, using the exact same screen-projection math the CSS
// perspective transform itself uses: a lateral offset of `o` tiles at
// forward depth `z` tiles projects to a screen offset of roughly
// `o * FOV_RATIO/(FOV_RATIO+z)` viewport-widths. Solving for the largest
// `o` that could still land within (a one-tile-generous margin around)
// the visible frame, evaluated at the FAR edge of the cell (the most
// permissive point along its depth, so nothing that could still peek
// into frame gets cut early), gives how far sideways is even worth
// enumerating at that depth.
function maxLateralReach(forwardDepth) {
  const zFarTiles = forwardDepth + 1;
  return Math.ceil(0.5 * (1 + zFarTiles / FOV_RATIO) + 1);
}

// Wall torches are a purely visual, per-wall decoration (not level
// data): only walls passing this hash get one, so they read as "a few
// torches around the room" rather than one on every panel. Torches
// beyond this depth aren't worth the DOM cost — they'd render too small
// to read anyway.
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
// hashing on this canonical form is what makes a given physical wall's
// torch presence a fixed property of the wall itself, and it's also what
// lets the flood fill below dedupe a wall that's reachable from both of
// its adjacent cells into a single drawn panel.
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

// Wall-respecting flood fill: starting from the player's own cell,
// breadth-first explores every cell reachable WITHOUT crossing a wall
// (map.hasWall already treats a missing neighbor / map edge as a wall,
// so this naturally stops at the map boundary too), out to MAX_DEPTH in
// both the forward and lateral directions.
//
// Each visited cell's map-relative offset (dx, dy) from the player is
// converted to camera-space (right, forward) via one fixed rotation
// built from the player's facing: `fwd` and `right` are the two
// FACING_VECTORS for "the direction the camera is looking" and "the
// direction 90° clockwise from that", so forward = dx·fwd + dy·fwd (dot
// product) is how many cells ahead of the camera this cell is, and
// right = dx·right + dy·right is how many cells to its right. Because
// FACING_VECTORS are all axis-aligned unit vectors, this dot product is
// always an exact integer — no accumulated rounding, no path-dependence
// (a cell reachable by two different routes still gets exactly the same
// camera-space position both times, since it's computed straight from
// its absolute (x,y), not from the route taken to reach it).
//
// forward < 0 (behind the camera) is pruned rather than explored, both
// because nothing behind the player should ever render and because it
// keeps the flood fill from wastefully wandering off into the rest of a
// connected level.
//
// Two more prunes keep "reachable" from drifting away from "visible":
//
// - forward must never DECREASE as the fill expands outward from the
//   player's own cell. A step that only becomes reachable by first
//   moving into the room and doubling back toward the camera's own row
//   or nearer is a step behind whatever's already been seen further
//   out — never something a forward-facing camera could have a sightline
//   to — so it's excluded the same way stepping fully behind the camera
//   is.
// - maxLateralReach(forward) (see above) bounds how far sideways is
//   worth exploring at all at a given depth, so a single-tile gap into a
//   wide-open room doesn't flood the fill across that room's entire
//   width the moment the gap is crossed.
function floodFill(map, px, py, facing) {
  const fwd = FACING_VECTORS[facing];
  const right = FACING_VECTORS[(facing + 1) % 4];

  function project(x, y) {
    const dx = x - px, dy = y - py;
    return {
      forward: dx * fwd.dx + dy * fwd.dy,
      right: dx * right.dx + dy * right.dy,
    };
  }

  const key = (x, y) => x + ',' + y;
  const visited = new Set([key(px, py)]);
  const queue = [{ x: px, y: py, forward: 0 }];
  const cells = [];

  while (queue.length) {
    const { x, y, forward: curForward } = queue.shift();
    const cell = map.cellAt(x, y);
    if (!cell) continue;
    const { forward, right: r } = project(x, y);
    cells.push({ x, y, forward, right: r, cell });

    for (let dirIdx = 0; dirIdx < 4; dirIdx++) {
      if (map.hasWall(x, y, dirIdx)) continue; // real wall — can't cross
      const v = FACING_VECTORS[dirIdx];
      const nx = x + v.dx, ny = y + v.dy;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      const np = project(nx, ny);
      if (
        np.forward < curForward ||
        np.forward > MAX_DEPTH ||
        Math.abs(np.right) > maxLateralReach(np.forward)
      ) continue;
      visited.add(nk);
      queue.push({ x: nx, y: ny, forward: np.forward });
    }
  }
  return cells;
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

// A wall torch, mounted as a CHILD of a wall panel rather than a
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
// that's how the wall panel itself is built in renderScene).
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
  // for a scale factor at all. Everything farther in is at z<0 and
  // shrinks normally from there.
  const TILE = vw;
  const PITCH = TILE / PITCH_DIVISIONS;
  const WALL_HEIGHT = Math.ceil((vh * WALL_HEIGHT_RATIO) / PITCH) * PITCH;
  const PERSPECTIVE = TILE * FOV_RATIO;

  const wallSideBgSize = `100% 100%, ${PITCH}px ${PITCH}px`;
  const wallBgSize = `${PITCH}px ${PITCH}px`;

  const scene = makeEl('scene-3d');
  scene.style.perspective = `${PERSPECTIVE}px`;

  const { x: px, y: py, facing } = map.playerPos;
  const cells = floodFill(map, px, py, facing);

  // Draw farthest-forward first. The browser sorts overlapping 3D
  // geometry within the preserve-3d context on its own regardless of
  // append order, but painting far-to-near keeps things sane for any
  // flat 2D overlay added after (the fog vignette).
  cells.sort((a, b) => b.forward - a.forward);

  // Every physical wall is shared by (up to) two adjacent cells, and the
  // flood fill can legitimately visit both sides of it (a real dungeon
  // can loop around), so track which walls have already had a panel
  // drawn — keyed canonically, so it doesn't matter which of the two
  // cells got there first.
  const drawnWalls = new Set();

  for (const { x, y, forward, right, cell } of cells) {
    const offsetX = right * TILE;
    const zNear = -forward * TILE;
    const zFar = zNear - TILE;
    const zCenter = zNear - TILE / 2;

    scene.appendChild(panelEl(
      'scene-slice floor-slice',
      TILE, TILE,
      `translate3d(${offsetX}px, ${WALL_HEIGHT / 2}px, ${zCenter}px) rotateX(90deg)`,
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
      `translate3d(${offsetX}px, ${-WALL_HEIGHT / 2}px, ${zCenter}px) rotateX(-90deg)`,
      wallSideBgSize
    ));

    for (let dirIdx = 0; dirIdx < 4; dirIdx++) {
      if (!map.hasWall(x, y, dirIdx)) continue; // open — nothing to draw on this side

      const wKey = canonicalWall(x, y, dirIdx).join(',');
      if (drawnWalls.has(wKey)) continue;

      // Direction of this wall relative to the CAMERA, not the map: 0 =
      // the side facing the same way the camera is looking (the far
      // edge of this cell, blocking travel further forward), 1 = right,
      // 2 = the side facing back toward the camera (the near edge of
      // this cell), 3 = left. This is the one fixed rotation the whole
      // renderer needs — everywhere below reasons in these terms
      // instead of raw compass directions.
      const relDir = (dirIdx - facing + 4) % 4;

      // The near edge (relDir 2) of the player's OWN cell (forward 0) is
      // the boundary directly behind the player — literally coincident
      // with the camera plane (z=0). It's never visible (nothing renders
      // behind the camera) and would otherwise show up as a degenerate,
      // screen-filling panel sitting right at the lens, so skip it.
      if (relDir === 2 && forward === 0) continue;

      drawnWalls.add(wKey);

      if (relDir === 0 || relDir === 2) {
        // A wall perpendicular to the view direction: the cell's far
        // edge (relDir 0, blocking travel further forward) or near edge
        // (relDir 2, closing off a recessed nook/step from the near
        // side) — both render the same way, just at different depths.
        // This single case is what used to need a whole separate
        // function (renderSideStep) to patch in after the fact; here
        // it's just "this cell has a wall on that side", no different
        // from any other wall.
        const z = relDir === 0 ? zFar : zNear;
        const isDoor = relDir === 0 && !!cell.features?.includes('door');
        // Same "this is the way through" treatment for both directions —
        // one gold-glowing opening-stairs panel, differing only in the
        // label/chevron below — so stairsUp reads as clearly as
        // stairsDown always has, instead of looking like a plain wall.
        const stairsDir = relDir === 0
          ? (cell.features?.includes('stairsDown') ? 'down' : cell.features?.includes('stairsUp') ? 'up' : null)
          : null;
        const isStairs = !!stairsDir;
        const panel = panelEl(
          `scene-slice ${isDoor ? 'opening-door' : isStairs ? 'opening-stairs' : 'wall-front'}`,
          TILE, WALL_HEIGHT,
          `translate3d(${offsetX}px, 0px, ${z}px)`,
          wallBgSize
        );
        if (isStairs) {
          const label = makeEl('stairs-label');
          label.innerHTML = stairsDir === 'down'
            ? 'Stairs Down<span class="chevron">&#9660;</span>'
            : 'Stairs Up<span class="chevron">&#9650;</span>';
          panel.appendChild(label);
        } else if (!isDoor && hasTorchOnWall(x, y, dirIdx, forward)) {
          panel.style.transformStyle = 'preserve-3d';
          panel.appendChild(torchEl(TILE, WALL_HEIGHT));
        }
        scene.appendChild(panel);
      } else {
        // A wall parallel to the view direction (relDir 1 = right side
        // of this cell, relDir 3 = left side): a vertical panel spanning
        // this cell's own depth, positioned at that edge — half a tile
        // beyond the cell's own center, in whichever direction the wall
        // actually faces (independent of whether `right` itself is
        // positive, negative, or zero — a cell directly on the
        // sightline still has a real left and right edge).
        const sign = relDir === 1 ? 1 : -1;
        const edgeOffsetX = offsetX + sign * (TILE / 2);
        const panel = panelEl(
          `scene-slice wall-side ${sign < 0 ? 'left' : 'right'}`,
          TILE, WALL_HEIGHT,
          `translate3d(${edgeOffsetX}px, 0px, ${zCenter}px) rotateY(${sign < 0 ? 90 : -90}deg)`,
          wallSideBgSize
        );
        if (hasTorchOnWall(x, y, dirIdx, forward)) {
          panel.style.transformStyle = 'preserve-3d';
          panel.appendChild(torchEl(TILE, WALL_HEIGHT));
        }
        scene.appendChild(panel);
      }
    }
  }

  viewportEl.appendChild(scene);
  viewportEl.appendChild(makeEl('viewport-fog'));
}
