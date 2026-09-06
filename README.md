# D-C — Dungeon Crawler (Phase 1 scaffold)

First-person, turn-based dungeon crawler. Vanilla HTML/CSS/JS, no build
step. See `implementation-plan.md`-style overview in the project notes
for the full design; this README covers just what's built so far and
how to keep extending it.

## Running it

**Do not just double-click `index.html`.** `js/main.js` is loaded as an
ES module (`<script type="module">`), and Chrome/Edge/Vivaldi (and most
other browsers) block ES modules from loading over the `file://`
protocol for security reasons — the script silently fails to load, so
none of the buttons (including "Begin Descent") do anything, with no
visible error unless you open DevTools (F12) and check the Console tab,
where you'd see a CORS/module-loading error referencing `file://`.

The fix is just to serve the folder over `http://` instead of opening
the file directly:

- **Easiest (Windows):** double-click `start-server.bat` in this
  folder. It starts a local server and opens the game in your default
  browser automatically. Leave the server window open while you play;
  close it when you're done.
- **Manually, if you have Python installed:** open a terminal in this
  folder and run `python -m http.server 8000` (or `py -m http.server
  8000`), then visit `http://localhost:8000/index.html`.
- **Manually, if you have Node.js installed:** run `npx serve` in this
  folder, then open the URL it prints.
- **VS Code users:** the "Live Server" extension gives you a
  right-click "Open with Live Server" option instead.

No build step is needed either way — this is just a local static
file server, not a bundler.

## What's implemented (Phase 1: skeleton & state machine)

- Boot screen → class select → explore state machine (`js/main.js`).
- Four classes (Warrior/Thief/Priest/Mage), fully data-driven from
  `js/data/classes.js` — add a class or rebalance one by editing data,
  not code.
- Procedural dungeon generator (`js/world/dungeonGen.js`) using a
  seeded recursive-backtracker maze carve, guaranteeing a reachable
  exit. Produces the same JSON shape a hand-authored level would
  (see `js/data/levels/level01.example.json` for a worked example of
  that shape).
- First-person viewport rendered from composable CSS layers (front
  wall / side walls / doors / stairs) rather than pre-made images —
  `js/ui/renderer.js`. Swapping in real art later means changing what
  a layer renders, not the layout math.
- Turn-based movement (move forward/back, strafe, turn) via keyboard
  (arrows/WASD/Q-E) or the on-screen control pad, all funneled through
  one world-turn tick (`js/core/turnManager.js`) so future systems
  (status effects, regen, wandering monsters) have one place to hook
  in.
- Minimap of explored tiles with a rotating player marker.
- HUD showing HP/MP bars, stats, and a scrolling message log.
- `gameState.js` save/load groundwork (serializes player + map id +
  position + turn count to `localStorage`) — not yet wired to a UI
  button, but the shape is there for phase 9.

## Not implemented yet (see plan phases 2–10)

- Combat (encounters currently log a message but don't trigger a
  battle — `js/combat/` doesn't exist yet).
- Abilities/spells actually doing anything (`js/combat/abilities.js`).
- Inventory/equipment UI and item pickups actually being added to the
  player (`js/items/`).
- Status effects, loot tables, hand-authored level loading in the UI,
  multi-floor descent (currently one generated floor, no fetch/back
  action once stairs are used).

## Project layout

```
index.html
css/            base.css, view.css, hud.css
js/
  core/         eventBus.js, gameState.js, turnManager.js
  world/        mapModel.js, movement.js, dungeonGen.js, levelLoader.js
  entities/     Character.js  (classes/ folder has a design-choice note)
  data/         classes.js, levels/level01.example.json
  ui/           renderer.js, minimap.js
  main.js       state machine + DOM wiring
```

## Design notes worth knowing before extending

- **Everything class-specific is data**, consumed by one `Character`
  class. Resist the urge to add per-class subclasses unless a class
  needs bespoke *behavior* the data + effect-function pattern can't
  express (see `js/entities/classes/README.md`).
- **Level JSON shape is the seam.** `levelLoader.js` doesn't care if a
  map came from the generator or a hand-authored file — keep it that
  way when wiring up authored levels in the UI.
- **`eventBus.js`** decouples systems: movement emits `playerMoved`/
  `playerTurned`, `main.js` just listens and re-renders. Combat/
  inventory should emit events the same way rather than reaching into
  `main.js` directly.
- **`tickWorldTurn()`** is the one place "a turn happened" is recorded.
  When combat rounds and status-effect ticks land, route them through
  here (or a sibling function combat calls) so regen/poison/wandering
  monsters stay consistent between exploring and fighting, per the
  plan.
