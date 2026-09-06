// Data-driven quest definitions, mirroring the CLASS_DATA/MONSTER_DATA
// pattern elsewhere in js/data/ — add a new quest here, no engine
// changes needed (core/questManager.js is the only consumer).
//
// `type` decides how core/questManager.js tracks progress:
//   'reachStairs' — completes the instant the player steps onto the
//     level's stairs-down tile (see world/movement.js's checkTileEvents,
//     which emits the 'stairsReached' bus event questManager listens
//     for).
//   'killCount' — progress increments by 1 on every combat victory (see
//     combat/combatEngine.js's 'combatVictory' bus event); optionally
//     restricted to a specific `monsterId` (omit it for "any monster" —
//     see clear_the_vermin below for the any-monster case; a future
//     quest like "kill 3 Orcs" would just add monsterId: 'orc').
//
// Every quest also carries a flat `target` — the count that completes
// it (reachStairs quests use target: 1 purely so the same
// progress/target rendering works for every quest type without a
// special case in the UI).

export const QUEST_DATA = {
  find_the_stairs: {
    id: 'find_the_stairs',
    name: 'Find the Way Down',
    description: 'Locate the stairs leading deeper into the dungeon.',
    type: 'reachStairs',
    target: 1,
  },
  clear_the_vermin: {
    id: 'clear_the_vermin',
    name: 'Clear the Vermin',
    description: 'Defeat 5 monsters, of any kind.',
    type: 'killCount',
    target: 5,
  },
};

export const QUEST_LIST = Object.values(QUEST_DATA);
