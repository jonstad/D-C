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
//     a quest like "kill 3 Orcs" just adds monsterId: 'orc', as below).
//
// Every quest also carries a flat `target` — the count that completes
// it (reachStairs quests use target: 1 purely so the same
// progress/target rendering works for every quest type without a
// special case in the UI).
//
// `after` (optional) chains one quest behind another: a quest with an
// `after` starts out with status 'locked' instead of 'active' (see
// core/questManager.js's initQuests()) and stays invisible in the
// quest log (js/ui/questUI.js filters locked quests out) until the
// quest it names completes, at which point questManager.js's
// completeQuest() flips it to 'active' on its own — no engine changes
// needed to chain further quests, just point `after` at whichever
// quest should come first.

export const QUEST_DATA = {
  find_the_stairs: {
    id: 'find_the_stairs',
    name: 'Find the Way Down',
    description: 'Locate the stairs leading deeper into the dungeon.',
    type: 'reachStairs',
    target: 1,
  },
  clear_the_slimes: {
    id: 'clear_the_slimes',
    name: 'Clear the Slimes',
    description: 'Defeat 3 Slimes.',
    type: 'killCount',
    monsterId: 'slime',
    target: 3,
  },
  clear_the_skeletons: {
    id: 'clear_the_skeletons',
    name: 'Clear the Skeletons',
    description: 'Defeat 4 Skeletons.',
    type: 'killCount',
    monsterId: 'skeleton',
    target: 4,
    after: 'clear_the_slimes',
  },
  clear_the_orcs: {
    id: 'clear_the_orcs',
    name: 'Clear the Orcs',
    description: 'Defeat 5 Orcs.',
    type: 'killCount',
    monsterId: 'orc',
    target: 5,
    after: 'clear_the_skeletons',
  },
};

export const QUEST_LIST = Object.values(QUEST_DATA);
