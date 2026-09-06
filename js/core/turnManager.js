// Drives the "everything is a turn" rule from the plan: movement,
// resting, and (later) combat rounds all funnel through here so that
// status-effect ticks, regen, and wandering-monster checks only need
// to be wired up once.
//
// Phase 1 only has exploration turns; combatEngine.js (phase 4) will
// call tickWorldTurn() the same way movement.js does, so status
// effects and regen stay consistent between exploring and fighting.

import { advanceTurn } from './gameState.js';
import { bus } from './eventBus.js';

export function tickWorldTurn() {
  advanceTurn();
  // Future hooks, in order, once those systems exist:
  //   1. statusEffects.tickAll(state.player)
  //   2. regen (HP/MP trickle if resting)
  //   3. wandering monster encounter roll
  bus.emit('worldTurnTick');
}
