// Player movement/turn actions. Each exported function is one discrete
// "turn" — it either succeeds and advances the world turn counter, or
// fails (bumped a wall) and logs that instead, per the exploration
// turn loop in the plan.

import { state, addLog, markDiscovered, goToLevel } from '../core/gameState.js';
import { tickWorldTurn } from '../core/turnManager.js';
import { FACING_VECTORS } from './mapModel.js';
import { bus } from '../core/eventBus.js';
import { maybeTriggerTileEncounter } from '../combat/combatEngine.js';
import { loadProceduralLevel } from './levelLoader.js';

function stepInto(dx, dy) {
  const map = state.map;
  const pos = map.playerPos;
  const nx = pos.x + dx;
  const ny = pos.y + dy;
  if (!map.cellAt(nx, ny)) return false;
  pos.x = nx;
  pos.y = ny;
  markDiscovered(nx, ny);
  return true;
}

function forwardVector() {
  return FACING_VECTORS[state.map.playerPos.facing];
}

function rightVector() {
  const f = FACING_VECTORS[(state.map.playerPos.facing + 1) % 4];
  return f;
}

function tryMove(dx, dy, blockedMessage) {
  const map = state.map;
  const pos = map.playerPos;
  // Determine which wall we'd be crossing: figure out the facing index
  // implied by (dx,dy) and check both the current cell's wall on that
  // side and the destination cell existing.
  const facingIndex = FACING_VECTORS.findIndex((v) => v.dx === dx && v.dy === dy);
  if (map.hasWall(pos.x, pos.y, facingIndex)) {
    addLog(blockedMessage);
    return;
  }
  stepInto(dx, dy);
  onArrive();
}

function onArrive() {
  tickWorldTurn();
  // A wandering-monster roll inside tickWorldTurn() may have already
  // dropped us into combat — don't also log stairs/items on top of it,
  // and don't tell explore-only listeners the player "moved" this turn.
  if (state.screen === 'combat') return;
  checkTileEvents();
  bus.emit('playerMoved');
}

// Generates the next floor down (or restores it, if this run already
// visited it before) and swaps it in — see core/gameState.js's
// goToLevel() for exactly what that snapshots/restores/resets. Called
// only once the player has confirmed the stairs-down prompt (see
// confirmStairs below) — checkTileEvents() itself no longer descends
// automatically.
function descendLevel() {
  goToLevel(state.level + 1, (depth) => loadProceduralLevel({ width: 16, height: 16, seed: Date.now() & 0xffffffff, depth }));
  markDiscovered(state.map.playerPos.x, state.map.playerPos.y);
  addLog(`You descend to level ${state.level}.`);
  bus.emit('levelChanged', { level: state.level });
}

// Mirror of descendLevel() for the trip back up. In practice the level
// above is always already cached in state.levels (you can only ever be
// standing on a stairsUp tile at depth N having previously come down
// from depth N-1), so the generator passed here is only a defensive
// fallback and shouldn't ever actually run.
function ascendLevel() {
  goToLevel(state.level - 1, (depth) => loadProceduralLevel({
    width: 16, height: 16, seed: Date.now() & 0xffffffff, withStairsUp: false, depth,
  }));
  markDiscovered(state.map.playerPos.x, state.map.playerPos.y);
  addLog(`You climb back up to level ${state.level}.`);
  bus.emit('levelChanged', { level: state.level });
}

function checkTileEvents() {
  const map = state.map;
  const { x, y } = map.playerPos;
  if (maybeTriggerTileEncounter(map, x, y)) return;
  const exit = map.exitAt(x, y);
  if (exit && (exit.type === 'stairsDown' || exit.type === 'stairsUp')) {
    const isDown = exit.type === 'stairsDown';
    addLog(`You see stairs leading ${isDown ? 'down' : 'back up'} here.`);
    // core/questManager.js listens for this to complete any active
    // 'reachStairs' quest — emitted every time you're on the stairsDown
    // tile (simpler than tracking "have we already told quests about
    // this" here), but that's harmless: a quest that's already complete
    // just ignores it. Only stairsDown counts for that quest, matching
    // its original "descend to progress" intent.
    if (isDown) bus.emit('stairsReached', { x, y });
    // Don't act yet — ui/main.js shows a Yes/No prompt and calls
    // confirmStairs()/cancelStairs() below once the player answers.
    state.pendingStairs = { type: exit.type, x, y };
    bus.emit('stairsPrompt', { type: exit.type });
  }
  const items = map.itemsAt(x, y);
  if (items.length) addLog(`There is something here: ${items.map((i) => i.itemId).join(', ')}.`);
}

// Called by main.js when the player answers "Yes" to the stairs prompt.
export function confirmStairs() {
  const pending = state.pendingStairs;
  if (!pending) return;
  state.pendingStairs = null;
  if (pending.type === 'stairsDown') descendLevel();
  else ascendLevel();
}

// Called by main.js when the player answers "No" (or dismisses) the
// stairs prompt — nothing to undo, the party just stays put.
export function cancelStairs() {
  if (!state.pendingStairs) return;
  state.pendingStairs = null;
  bus.emit('stairsPromptCancel');
}

export function moveForward() {
  const v = forwardVector();
  tryMove(v.dx, v.dy, 'A wall blocks your path.');
}

export function moveBackward() {
  const v = forwardVector();
  tryMove(-v.dx, -v.dy, 'A wall blocks your retreat.');
}

export function strafeLeft() {
  const v = rightVector();
  tryMove(-v.dx, -v.dy, 'A wall blocks your step.');
}

export function strafeRight() {
  const v = rightVector();
  tryMove(v.dx, v.dy, 'A wall blocks your step.');
}

export function turnLeft() {
  state.map.playerPos.facing = (state.map.playerPos.facing + 3) % 4;
  tickWorldTurn();
  if (state.screen === 'combat') return;
  bus.emit('playerTurned');
}

export function turnRight() {
  state.map.playerPos.facing = (state.map.playerPos.facing + 1) % 4;
  tickWorldTurn();
  if (state.screen === 'combat') return;
  bus.emit('playerTurned');
}
