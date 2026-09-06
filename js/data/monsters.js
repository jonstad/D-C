// Data-driven monster definitions, mirroring the CLASS_DATA pattern in
// js/data/classes.js — add a 4th monster or rebalance one here, no
// engine changes needed (see combat/combatEngine.js's only consumer,
// spawnEnemy()). Stats reuse the same STR/AGI/VIT axes as Character so
// combat math can treat player and enemy the same way.

export const MONSTER_DATA = {
  slime: {
    id: 'slime',
    name: 'Slime',
    description: 'A wobbling ooze. Slow and weak, but there are always more.',
    sprite: 'assets/monsters/slime.png',
    hp: 14,
    stats: { STR: 4, AGI: 4, VIT: 2 },
    xpReward: 8,
    flavorHit: 'splatters against you for',
    flavorDefeat: 'collapses into a puddle',
  },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    description: 'Animated bones — fast and brittle.',
    sprite: 'assets/monsters/skeleton.png',
    hp: 20,
    stats: { STR: 7, AGI: 11, VIT: 3 },
    xpReward: 14,
    flavorHit: 'rattles forward and strikes you for',
    flavorDefeat: 'crumbles to bone fragments',
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    description: 'Brutish and heavily armed. Hits hard.',
    sprite: 'assets/monsters/orc.png',
    hp: 28,
    stats: { STR: 10, AGI: 6, VIT: 6 },
    xpReward: 18,
    flavorHit: 'clubs you for',
    flavorDefeat: 'falls with a heavy thud',
  },
};

export const MONSTER_LIST = Object.values(MONSTER_DATA);
