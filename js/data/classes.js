// Data-driven class definitions. This is the file you edit to add a
// 5th class or rebalance an existing one — no engine code changes
// needed (see CLASS_DATA consumers in Character.js).
//
// NOTE: this is plain JS data (not classes.json fetched over HTTP) so
// the game runs from a double-clicked index.html with no local server
// and no CORS issues. If you later add a build step / dev server, this
// can be swapped for a fetch('data/classes.json') without touching
// any calling code — same shape either way.

export const CLASS_DATA = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    description: 'Melee damage and durability. Front-line fighter.',
    baseStats: { STR: 14, AGI: 9, VIT: 13, INT: 5, WIS: 6, LUK: 7 },
    growth: { STR: 2.2, AGI: 1.0, VIT: 2.0, INT: 0.4, WIS: 0.5, LUK: 0.8 },
    startingHP: 32,
    startingMP: 6,
    startingGear: ['weapon_shortsword', 'armor_leather', 'shield_wooden'],
    abilities: [
      { id: 'power_strike', name: 'Power Strike', mpCost: 0, unlockLevel: 1 },
      { id: 'shield_bash', name: 'Shield Bash', mpCost: 3, unlockLevel: 3 },
      { id: 'taunt', name: 'Taunt', mpCost: 2, unlockLevel: 5 },
    ],
  },
  thief: {
    id: 'thief',
    name: 'Thief',
    description: 'Speed, critical hits, and utility.',
    baseStats: { STR: 9, AGI: 15, VIT: 9, INT: 7, WIS: 6, LUK: 10 },
    growth: { STR: 1.0, AGI: 2.4, VIT: 1.2, INT: 0.6, WIS: 0.5, LUK: 1.6 },
    startingHP: 24,
    startingMP: 10,
    startingGear: ['weapon_dagger', 'armor_padded'],
    abilities: [
      { id: 'backstab', name: 'Backstab', mpCost: 0, unlockLevel: 1 },
      { id: 'steal', name: 'Steal', mpCost: 2, unlockLevel: 2 },
      { id: 'disarm_trap', name: 'Disarm Trap', mpCost: 0, unlockLevel: 1 },
      { id: 'evade', name: 'Evade', mpCost: 3, unlockLevel: 4 },
    ],
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    description: 'Healing and support magic.',
    baseStats: { STR: 8, AGI: 8, VIT: 11, INT: 8, WIS: 15, LUK: 8 },
    growth: { STR: 0.8, AGI: 0.8, VIT: 1.4, INT: 1.0, WIS: 2.3, LUK: 1.0 },
    startingHP: 22,
    startingMP: 24,
    startingGear: ['weapon_mace', 'armor_robe'],
    abilities: [
      { id: 'heal', name: 'Heal', mpCost: 4, unlockLevel: 1 },
      { id: 'cure_poison', name: 'Cure Poison', mpCost: 3, unlockLevel: 2 },
      { id: 'bless', name: 'Bless', mpCost: 5, unlockLevel: 3 },
      { id: 'smite', name: 'Smite', mpCost: 6, unlockLevel: 4 },
    ],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    description: 'Offensive and utility spells. Fragile.',
    baseStats: { STR: 6, AGI: 9, VIT: 7, INT: 16, WIS: 10, LUK: 8 },
    growth: { STR: 0.5, AGI: 1.0, VIT: 0.9, INT: 2.5, WIS: 1.2, LUK: 1.0 },
    startingHP: 18,
    startingMP: 28,
    startingGear: ['weapon_staff', 'armor_robe'],
    abilities: [
      { id: 'firebolt', name: 'Firebolt', mpCost: 4, unlockLevel: 1 },
      { id: 'magic_missile', name: 'Magic Missile', mpCost: 3, unlockLevel: 1 },
      { id: 'frost_armor', name: 'Frost Armor', mpCost: 5, unlockLevel: 3 },
      { id: 'teleport_short', name: 'Teleport (short)', mpCost: 8, unlockLevel: 5 },
    ],
  },
};

export const CLASS_LIST = Object.values(CLASS_DATA);
