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
  quests: [], // set by core/questManager.js's initQuests(), one run's worth of { ...def, progress, status }
  level: 1, // current dungeon depth — bumped/dropped by goToLevel() below, never reset mid-level
  encounterCount: 0, // encounters fired on this level so far; combat/combatEngine.js caps this at MAX_ENCOUNTERS_PER_LEVEL and goToLevel() resets it to 0 for a brand-new level
  levels: new Map(), // depth -> { map, discovered, encounterCount } snapshot of every level visited this run — see goToLevel()
  pendingStairs: null, // { type: 'stairsDown'|'stairsUp', x, y } while a descend/ascend confirmation is awaiting the player's answer, else null
};

export function resetGame() {
  state.screen = 'boot';
  state.party = [];
  state.map = null;
  state.turnCount = 0;
  state.discovered = new Set();
  state.log = [];
  state.combat = null;
  state.quests = [];
  state.level = 1;
  state.encounterCount = 0;
  state.levels = new Map();
  state.pendingStairs = null;
}

// Moves the party to `newDepth`, keeping every level visited this run
// alive in memory so leaving one (by descending or ascending) and
// coming back later restores the exact same layout, monster/encounter
// state, and fog-of-war rather than regenerating something new.
//
// The current level's live map/discovered/encounterCount are snapshot
// into state.levels under the depth we're LEAVING before we touch
// anything else. Then: if `newDepth` was already visited this run, its
// snapshot is restored as-is (including playerPos, which was sitting on
// the connecting stairs tile the moment we left it, so the party
// re-arrives exactly where they'd expect). Otherwise `generateMapFn()`
// builds a brand-new level for that depth, with a fresh discovered set
// and encounter budget, which is itself immediately snapshot so a later
// return trip finds it too.
//
// Quests are NOT touched here — they're a per-run thing (like
// state.party), not a per-level one, same as the comment on
// QUEST_DATA's reachStairs type already implies ("one visit is enough
// to complete it outright").
export function goToLevel(newDepth, generateMapFn) {
  state.levels.set(state.level, {
    map: state.map,
    discovered: state.discovered,
    encounterCount: state.encounterCount,
  });

  const cached = state.levels.get(newDepth);
  if (cached) {
    state.map = cached.map;
    state.discovered = cached.discovered;
    state.encounterCount = cached.encounterCount;
  } else {
    state.map = generateMapFn();
    state.discovered = new Set();
    state.encounterCount = 0;
    state.levels.set(newDepth, {
      map: state.map,
      discovered: state.discovered,
      encounterCount: state.encounterCount,
    });
  }
  state.level = newDepth;
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
