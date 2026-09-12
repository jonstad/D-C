// Data-driven monster definitions, mirroring the CLASS_DATA pattern in
// js/data/classes.js — add a 4th monster or rebalance one here, no
// engine changes needed (see combat/combatEngine.js's only consumer,
// spawnEnemy()). Stats reuse the same STR/AGI/VIT axes as Character so
// combat math can treat player and enemy the same way.
//
// flavorHit is a bare verb phrase — combatEngine.js's enemyTurn() logs
// it as `${enemy.name} ${flavorHit} ${target.name} for ${amount}
// damage`, so it must read correctly with a party member's NAME right
// after it (not "you" — combat can hit any of four different people).
//
// minFloor/maxFloor gate which dungeon depths (state.level) a monster
// can appear on — both inclusive, both optional (an omitted minFloor
// means "from floor 1", an omitted maxFloor means "no lower bound").
// This is THE place to retune "what can I run into on floor N": nothing
// in world/dungeonGen.js (map-placed encounters) or
// combat/combatEngine.js (wandering encounters) hardcodes monster ids —
// both just call monstersForFloor() below. Widen/narrow a range, or add
// a brand-new monster with its own range, and both systems pick it up
// automatically.

export const MONSTER_DATA = {
  slime: {
    id: 'slime',
    name: 'Slime',
    description: 'A wobbling ooze. Slow and weak, but there are always more.',
    sprite: 'assets/monsters/slime.png',
    hp: 14,
    stats: { STR: 4, AGI: 4, VIT: 2 },
    xpReward: 8,
    flavorHit: 'splatters against',
    flavorDefeat: 'collapses into a puddle',
    minFloor: 1,
    maxFloor: 4,
  },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    description: 'Animated bones — fast and brittle.',
    sprite: 'assets/monsters/skeleton.png',
    hp: 20,
    stats: { STR: 7, AGI: 11, VIT: 3 },
    xpReward: 14,
    flavorHit: 'rattles forward and strikes',
    flavorDefeat: 'crumbles to bone fragments',
    minFloor: 2,
    maxFloor: 6,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    description: 'Brutish and heavily armed. Hits hard.',
    sprite: 'assets/monsters/orc.png',
    hp: 28,
    stats: { STR: 10, AGI: 6, VIT: 6 },
    xpReward: 18,
    flavorHit: 'clubs',
    flavorDefeat: 'falls with a heavy thud',
    minFloor: 4,
    maxFloor: 10,
  },
};

export const MONSTER_LIST = Object.values(MONSTER_DATA);

// Every monster whose [minFloor, maxFloor] range includes `floor`, as a
// plain array of ids (the shape world/dungeonGen.js's monsterGroups and
// combat/combatEngine.js's wandering-encounter roll both already expect).
// A floor past every monster's maxFloor (or before any minFloor) yields
// an empty array — callers are expected to treat that as "no encounters
// available here" rather than throwing.
export function monstersForFloor(floor) {
  return MONSTER_LIST
    .filter((m) => floor >= (m.minFloor ?? 1) && floor <= (m.maxFloor ?? Infinity))
    .map((m) => m.id);
}
