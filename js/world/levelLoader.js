// The one seam between "where a level's JSON came from" and "the game
// engine". generateDungeon(), a hand-authored level object, and
// parseLevelText() (see levelText.js) all produce the same shape, so
// this function doesn't need to branch on which one it got.

import { mapFromJSON } from './mapModel.js';
import { generateDungeon } from './dungeonGen.js';
import { parseLevelText } from './levelText.js';

export function loadLevelFromJSON(levelJSON) {
  return mapFromJSON(levelJSON);
}

export function loadProceduralLevel(options) {
  const levelJSON = generateDungeon(options);
  return mapFromJSON(levelJSON);
}

// Fetches and parses a hand-authored level written in the friendly
// text format (js/world/levelText.js) — see js/data/levels/level01.txt
// for a real example. `url` is resolved the same way any other fetch()
// URL is, relative to the page (index.html), so a level living in
// js/data/levels/ is passed as e.g. 'js/data/levels/level01.txt'.
export async function loadTextLevel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch level text "${url}": ${res.status} ${res.statusText}`);
  const text = await res.text();
  return mapFromJSON(parseLevelText(text));
}
