// The one seam between "where a level's JSON came from" and "the game
// engine". generateDungeon() and a hand-authored level object both
// produce the same shape, so this function doesn't need to branch on
// which one it got.

import { mapFromJSON } from './mapModel.js';
import { generateDungeon } from './dungeonGen.js';

export function loadLevelFromJSON(levelJSON) {
  return mapFromJSON(levelJSON);
}

export function loadProceduralLevel(options) {
  const levelJSON = generateDungeon(options);
  return mapFromJSON(levelJSON);
}
