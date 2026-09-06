// Drives the "everything is a turn" rule from the plan: movement,
// resting, and (later) combat rounds all funnel through here so that
// status-effect ticks, regen, and wandering-monster checks only need
// to be wired up once.
//
// Phase 1 only has exploration turns; combatEngine.js's own turns
// (attack/defend/spell/run) don't route back through here — only
// exploration movement/turning does, which is also where the wandering
// monster roll below belongs (a turn spent already fighting shouldn't
// start a second fight).

import { advanceTurn } from './gameState.js';
import { bus } from './eventBus.js';
import { maybeTriggerWanderingEncounter } from '../combat/combatEngine.js';

export function tickWorldTurn() {
  advanceTurn();
  // Future hooks, in order, once those systems exist:
  //   1. statusEffects.tickAll(state.party)
  //   2. regen (HP/MP trickle if resting)
  maybeTriggerWanderingEncounter();
  bus.emit('worldTurnTick');
}
