// Central game state. This is the single object that would get
// serialized for save/load — everything meaningful about "where the
// party is in their playthrough" lives here, not scattered across
// modules. `party` is a fixed-order array of Character instances (see
// js/data/partyPresets.js for the starting four) — turn order in
// combat/combatEngine.js is simply array order, skipping anyone with
// hp <= 0.

import { bus } from './eventBus.js';

const STORAGE_KEY = 'dc-save-v1';

export const state = {
  screen: 'boot', // 'boot' | 'classSelect' | 'explore' | 'combat'
  party: [],         // Character instances, set on "Enter the Dungeon"
  map: null,         // current MapModel
  turnCount: 0,
  discovered: new Set(), // "x,y" keys of tiles the player has seen
  log: [],
  combat: null, // set by combat/combatEngine.js's startCombat(), null outside combat
};

export function resetGame() {
  state.screen = 'boot';
  state.party = [];
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
// Kept minimal for phase 1 (party + map id + position + turn count).
// As inventory/combat land, extend serialize()/deserialize() rather
// than reworking callers — they only ever touch `state`.

export function saveGame() {
  if (!state.party.length || !state.map) return false;
  const payload = {
    party: state.party.map((c) => c.serialize()),
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
