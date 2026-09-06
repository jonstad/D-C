// Tracks quest progress for the current descent. Each active quest is
// just { ...def, progress, status } (see data/quests.js for the
// definitions) — this module is the only thing that ever mutates
// state.quests. Combat and movement never reach in directly; they just
// emit the bus events this module already listens for below, the same
// decoupled pattern combat/combatEngine.js and world/movement.js use
// with the rest of the UI.

import { state, addLog } from './gameState.js';
import { bus } from './eventBus.js';
import { QUEST_LIST } from '../data/quests.js';

// Called once when a new descent begins (see main.js's startExploring())
// — quests are per-run for now, same as state.map/state.turnCount
// resetting fresh each time; nothing carries a quest over between runs
// yet.
export function initQuests() {
  state.quests = QUEST_LIST.map((def) => ({ ...def, progress: 0, status: 'active' }));
}

function completeQuest(quest) {
  quest.status = 'complete';
  addLog(`Quest complete: ${quest.name}!`);
  bus.emit('questComplete', { quest });
}

function advanceQuest(quest, amount) {
  quest.progress = Math.min(quest.target, quest.progress + amount);
  if (quest.progress >= quest.target) {
    completeQuest(quest);
  } else {
    bus.emit('questProgress', { quest });
  }
}

bus.on('combatVictory', ({ enemy }) => {
  for (const quest of state.quests) {
    if (quest.status !== 'active' || quest.type !== 'killCount') continue;
    if (quest.monsterId && quest.monsterId !== enemy.id) continue;
    advanceQuest(quest, 1);
  }
});

bus.on('stairsReached', () => {
  for (const quest of state.quests) {
    if (quest.status !== 'active' || quest.type !== 'reachStairs') continue;
    advanceQuest(quest, quest.target); // one visit is enough to complete it outright
  }
});
