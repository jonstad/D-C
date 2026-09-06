// The starting party: one of each class, in turn order. Phase 1 skips
// party-building UI entirely — main.js creates exactly these four
// Characters on "Enter the Dungeon" (see js/data/classes.js for the
// stats/abilities/portrait each classId pulls in). Add a 5th preset
// slot (or make this user-editable) whenever party customization
// becomes a real feature; nothing else keys off there being exactly
// four, only DEFAULT_PARTY.length itself.

export const DEFAULT_PARTY = [
  { name: 'Brogan', classId: 'warrior' },
  { name: 'Sable', classId: 'thief' },
  { name: 'Ysolde', classId: 'priest' },
  { name: 'Fendrel', classId: 'mage' },
];
