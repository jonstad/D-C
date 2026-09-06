// Central game state. This is the single object that would get
// serialized for save/load — everything meaningful about "where the
// player is in their playthrough" lives here, not scattered across
// modules. Phase 1 keeps this intentionally small; combat/inventory
// phases will attach `state.player.inventory`, `state.combat`, etc.
// to the same object without changing this shape's contract.

import { bus } from './eventBus.js';

const STORAGE_KEY = 'dc-save-v1';

export const state = {
  screen: 'boot', // 'boot' | 'classSelect' | 'explore' | 'combat'
  player: null,     // Character instance, set on class select
  map: null,         // current MapModel
  turnCount: 0,
  discovered: new Set(), // "x,y" keys of tiles the player has seen
  log: [],
  combat: null, // set by combat/combatEngine.js's startCombat(), null outside combat
};

export function resetGame() {
  state.screen = 'boot';
  state.player = null;
  state.map = null;
  state.turnCount = 0;
  state.discovered = new Set();
  state.log = [];
  state.combat = null;
}

export function addLog(message) {
  state.log.push(message);
  if (state.log.length > 200) state.log.shift();
  bus.emit('log', message);
}

export function markDiscovered(x, y) {
  state.discovered.add(`${x},${y}`);
}

export function isDiscovered(x, y) {
  return state.discovered.has(`${x},${y}`);
}

export function advanceTurn() {
  state.turnCount += 1;
  bus.emit('turn', state.turnCount);
}

// --- Save / load -----------------------------------------------------
// Kept minimal for phase 1 (player + map id + position + turn count).
// As inventory/combat land, extend serialize()/deserialize() rather
// than reworking callers — they only ever touch `state`.

export function saveGame() {
  if (!state.player || !state.map) return false;
  const payload = {
    player: state.player.serialize(),
    mapId: state.map.id,
    playerPos: { ...state.map.playerPos },
    turnCount: state.turnCount,
    discovered: Array.from(state.discovered),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return true;
}

export function hasSaveGame() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function loadSaveRaw() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
