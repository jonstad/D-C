// Player movement/turn actions. Each exported function is one discrete
// "turn" — it either succeeds and advances the world turn counter, or
// fails (bumped a wall) and logs that instead, per the exploration
// turn loop in the plan.

import { state, addLog, markDiscovered } from '../core/gameState.js';
import { tickWorldTurn } from '../core/turnManager.js';
import { FACING_VECTORS } from './mapModel.js';
import { bus } from '../core/eventBus.js';
import { maybeTriggerTileEncounter } from '../combat/combatEngine.js';

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

function checkTileEvents() {
  const map = state.map;
  const { x, y } = map.playerPos;
  if (maybeTriggerTileEncounter(map, x, y)) return;
  const exit = map.exitAt(x, y);
  if (exit) {
    addLog(`You see ${exit.type === 'stairsDown' ? 'stairs leading down' : 'an exit'} here.`);
    // core/questManager.js listens for this to complete any active
    // 'reachStairs' quest — emitted every time you're on the tile
    // (simpler than tracking "have we already told quests about this"
    // here), but that's harmless: a quest that's already complete just
    // ignores it.
    if (exit.type === 'stairsDown') bus.emit('stairsReached', { x, y });
  }
  const items = map.itemsAt(x, y);
  if (items.length) addLog(`There is something here: ${items.map((i) => i.itemId).join(', ')}.`);
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
