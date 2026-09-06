// Turn-based combat, triggered by a random encounter (see
// world/movement.js's checkTileEvents() and core/turnManager.js's
// tickWorldTurn()). Round structure: every LIVING party member (array
// order, state.party) gets one action — attack, defend, spell, or run
// — then, once the last one has acted, the enemy attacks a single
// randomly-chosen living party member and a new round begins. A downed
// member (hp <= 0) is skipped both when picking the next actor and
// when the enemy picks its target; if that leaves no one standing,
// it's a party wipe. Everything the UI needs to know is emitted on the
// shared bus (core/eventBus.js); js/ui/combatUI.js never reaches into
// this module's internals.
//
// Spell is a sub-state, not always a single click: an ability whose
// classes.js `target` is 'ally' (currently just Heal) doesn't resolve
// immediately — playerSpell() instead stashes it on combat.pendingSpell
// and waits for the UI to call selectSpellTarget() with whichever
// living party member got clicked (cancelSpellTarget() backs out for
// free, no MP spent, turn not consumed). An ability with no `target`
// (or 'enemy') resolves at once against combat.enemy, same as before.

import { state, addLog } from '../core/gameState.js';
import { bus } from '../core/eventBus.js';
import { MONSTER_DATA } from '../data/monsters.js';
import { resolveAbility } from './abilities.js';

const ENEMY_TURN_DELAY = 550; // ms — purely presentational pacing, see scheduleEnemyTurn
const VICTORY_SCREEN_DELAY = 700; // ms — lets the enemy's defeat animation play before the screen switches back

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function spawnEnemy(monsterId) {
  const def = MONSTER_DATA[monsterId];
  if (!def) throw new Error(`Unknown monster: ${monsterId}`);
  // Clone def's hp/stats — combat mutates enemy.hp, and MONSTER_DATA is
  // the shared template every future encounter of this type reuses.
  return { ...def, hp: def.hp, maxHp: def.hp, stats: { ...def.stats } };
}

// --- Turn-order helpers ---------------------------------------------------

function aliveIndices() {
  const out = [];
  for (let i = 0; i < state.party.length; i++) if (state.party[i].isAlive()) out.push(i);
  return out;
}

function firstAliveIndex() {
  const alive = aliveIndices();
  return alive.length ? alive[0] : null;
}

function nextAliveAfter(idx) {
  const alive = aliveIndices().filter((i) => i > idx);
  return alive.length ? alive[0] : null;
}

function actingChar() {
  return state.party[state.combat.actingIndex];
}

function setLocked(combat, locked) {
  combat.locked = locked;
  bus.emit('combatLocked', locked);
}

function applyDamageToEnemy(amount) {
  state.combat.enemy.hp = Math.max(0, state.combat.enemy.hp - amount);
}

export function startCombat(monsterId) {
  const first = firstAliveIndex();
  if (first === null) return null; // safety: nobody able to fight (shouldn't happen)
  const enemy = spawnEnemy(monsterId);
  state.combat = {
    enemy, actingIndex: first, defendingIndices: new Set(), locked: false, over: false,
    pendingSpell: null, // set while waiting on selectSpellTarget() for an ally-targeted ability
  };
  state.screen = 'combat';
  addLog(`A ${enemy.name} blocks your way!`);
  bus.emit('combatStart', { enemy });
  return enemy;
}

function endCombat(result) {
  const combat = state.combat;
  combat.over = true;
  state.screen = 'explore';
  bus.emit('combatEnd', { result, enemy: combat.enemy });
  state.combat = null;
}

// The enemy's own turn: always resolves synchronously once called (the
// delay, when there is one, happens beforehand in scheduleEnemyTurn).
// Picks one random living party member as its target.
function enemyTurn() {
  const combat = state.combat;
  const { enemy } = combat;
  const alive = aliveIndices();
  if (!alive.length) return; // safety — shouldn't be reachable

  const targetIdx = alive[Math.floor(Math.random() * alive.length)];
  const target = state.party[targetIdx];
  bus.emit('enemyActing', { enemy, targetIndex: targetIdx });

  const stats = target.getDerivedStats();
  let amount = Math.max(1, Math.round(enemy.stats.STR * rand(0.8, 1.2) - stats.VIT * 0.5));
  if (combat.defendingIndices.has(targetIdx)) amount = Math.round(amount * 0.5);
  combat.defendingIndices.clear(); // defending only guards against this one incoming attack

  target.hp = Math.max(0, target.hp - amount);
  addLog(`The ${enemy.name} ${enemy.flavorHit} ${target.name} for ${amount} damage.`);
  bus.emit('enemyAttack', { enemy, amount, targetIndex: targetIdx });

  if (!aliveIndices().length) {
    addLog('Your party has fallen! You wake up back near the entrance, battered but alive.');
    for (const c of state.party) c.hp = Math.max(c.hp, 1); // revive everyone to at least 1 HP
    bus.emit('combatDefeat', { enemy });
    endCombat('defeat');
    return;
  }

  // Survived — start the next round back at the first living member.
  combat.actingIndex = firstAliveIndex();
  setLocked(combat, false);
  bus.emit('roundStart', {});
}

// Schedules the enemy's turn a beat after whichever party member just
// acted, purely so that action's own popup/animation is visible before
// the enemy's reply lands — the actual game state is already fully
// resolved by the time this fires; only the *presentation* is delayed.
function scheduleEnemyTurn() {
  const combat = state.combat;
  setLocked(combat, true);
  setTimeout(() => {
    if (state.combat !== combat || combat.over) return; // combat ended/replaced meanwhile
    enemyTurn();
  }, ENEMY_TURN_DELAY);
}

// Called after any player action — advances to the next living party
// member's turn, or, if the current actor was the last one standing
// this round, hands off to the enemy.
function advanceTurnOrEnemy() {
  const combat = state.combat;
  const next = nextAliveAfter(combat.actingIndex);
  if (next !== null) {
    combat.actingIndex = next;
    setLocked(combat, false);
    bus.emit('turnAdvance', { actorIndex: next });
    return;
  }
  scheduleEnemyTurn();
}

// Called after an attack/spell that could have killed the enemy —
// checks for victory before advancing the turn.
function afterPlayerOffense() {
  const combat = state.combat;
  if (combat.enemy.hp <= 0) {
    const { enemy } = combat;
    addLog(`The ${enemy.name} ${enemy.flavorDefeat}!`);
    const leveledUp = [];
    for (const c of state.party) {
      if (!c.isAlive()) continue;
      if (c.gainXP(enemy.xpReward)) leveledUp.push(`${c.name} (Lv.${c.level})`);
    }
    addLog(`Your party gains ${enemy.xpReward} XP each.${leveledUp.length ? ` ${leveledUp.join(', ')} leveled up!` : ''}`);
    // Anyone downed during this fight gets back on their feet (1 HP) now
    // that it's over — otherwise a downed member has no way to recover
    // at all yet (no rest/revive mechanic exists this early), which
    // would permanently soft-lock them out of the party.
    for (const c of state.party) if (!c.isAlive()) c.hp = 1;
    bus.emit('combatVictory', { enemy });
    setTimeout(() => {
      if (state.combat === combat) endCombat('victory');
    }, VICTORY_SCREEN_DELAY);
    return;
  }
  advanceTurnOrEnemy();
}

export function playerAttack() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  const char = actingChar();
  setLocked(combat, true);
  const stats = char.getDerivedStats();
  const { enemy } = combat;
  const critChance = Math.min(0.35, stats.LUK / 80);
  const isCrit = Math.random() < critChance;
  let amount = Math.max(1, Math.round(stats.STR * rand(0.85, 1.15) - enemy.stats.VIT * 0.5));
  if (isCrit) amount = Math.round(amount * 1.6);
  applyDamageToEnemy(amount);
  addLog(`${char.name} hits the ${enemy.name} for ${amount} damage${isCrit ? ' (critical!)' : ''}.`);
  bus.emit('playerAttack', { actorIndex: combat.actingIndex, enemy, amount, isCrit });
  afterPlayerOffense();
}

export function playerDefend() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  const char = actingChar();
  setLocked(combat, true);
  combat.defendingIndices.add(combat.actingIndex);
  addLog(`${char.name} braces for the next attack.`);
  bus.emit('playerDefend', { actorIndex: combat.actingIndex });
  advanceTurnOrEnemy();
}

export function playerSpell() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  const char = actingChar();
  const ability = char.abilities[0];
  if (!ability) {
    addLog(`${char.name} has no spell to cast yet.`);
    return;
  }
  if (char.mp < ability.mpCost) {
    addLog(`Not enough MP for ${char.name} to cast ${ability.name}.`);
    return;
  }

  if (ability.target === 'ally') {
    // Enter target-selection mode instead of resolving now — no MP
    // spent and the turn doesn't advance until selectSpellTarget()
    // actually picks a living party member (see combatUI.js's
    // .targetable party cards and main.js's click wiring).
    combat.pendingSpell = { ability };
    setLocked(combat, true);
    bus.emit('spellTargetingStart', { ability });
    return;
  }

  setLocked(combat, true);
  char.mp -= ability.mpCost;
  const effect = resolveAbility(ability.id, char, combat.enemy);
  addLog(effect.message);
  applyDamageToEnemy(effect.amount);
  addLog(`The ${combat.enemy.name} takes ${effect.amount} damage.`);
  bus.emit('playerSpellHit', { actorIndex: combat.actingIndex, enemy: combat.enemy, ...effect });
  afterPlayerOffense();
}

// Resolves an ally-targeted spell (currently only Heal) against
// whichever living party member the UI reports was clicked. Ignored if
// there's no pending spell to resolve, or if the clicked index turned
// out to be empty/downed (the UI already only marks living cards
// .targetable, but this is cheap insurance against a stale click).
export function selectSpellTarget(targetIndex) {
  const combat = state.combat;
  if (!combat || combat.over || !combat.pendingSpell) return;
  const target = state.party[targetIndex];
  if (!target || !target.isAlive()) return;

  const char = actingChar();
  const { ability } = combat.pendingSpell;
  combat.pendingSpell = null;
  char.mp -= ability.mpCost;
  const effect = resolveAbility(ability.id, char, target);
  addLog(effect.message);
  if (effect.kind === 'heal') {
    target.hp = Math.min(target.maxHP, target.hp + effect.amount);
    addLog(`${target.name} recovers ${effect.amount} HP.`);
  }
  bus.emit('playerSpellAlly', { actorIndex: combat.actingIndex, targetIndex, ...effect });
  advanceTurnOrEnemy(); // an ally-targeted spell never ends combat by itself
}

// Backs out of target-selection mode with no cost — no MP spent, no
// turn consumed, the caster just gets their action back.
export function cancelSpellTarget() {
  const combat = state.combat;
  if (!combat || !combat.pendingSpell) return;
  combat.pendingSpell = null;
  setLocked(combat, false);
  bus.emit('spellTargetingCancel', {});
}

export function playerRunAway() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  const char = actingChar();
  setLocked(combat, true);
  const stats = char.getDerivedStats();
  const chance = Math.min(0.9, Math.max(0.1, 0.5 + (stats.AGI - combat.enemy.stats.AGI) * 0.03));
  const success = Math.random() < chance;
  bus.emit('playerRunAttempt', { actorIndex: combat.actingIndex, success });
  if (success) {
    addLog(`${char.name} leads the party in a retreat from the ${combat.enemy.name}.`);
    endCombat('fled');
    return;
  }
  addLog(`${char.name} couldn't get away!`);
  advanceTurnOrEnemy();
}

// --- Encounter triggers --------------------------------------------------
// Two independent sources funnel into the same startCombat(): a map's
// pre-placed encounters (dungeonGen.js — "this stretch is dangerous"),
// checked on arriving at a tile, and a flat per-turn wandering-monster
// roll (any turn, including turning in place), per the "everything is
// a turn" hook turnManager.js already anticipated.

const WANDERING_CHANCE = 0.05;
const WANDERING_MONSTERS = ['slime', 'orc', 'skeleton'];

export function maybeTriggerTileEncounter(map, x, y) {
  const idx = map.encounters.findIndex((e) => e.at[0] === x && e.at[1] === y);
  if (idx === -1) return false;
  const enc = map.encounters[idx];
  if (Math.random() > enc.chance) return false;
  map.encounters.splice(idx, 1); // consumed — this tile won't trigger again
  startCombat(enc.monsterGroup);
  return true;
}

export function maybeTriggerWanderingEncounter() {
  if (state.screen !== 'explore') return false;
  if (Math.random() > WANDERING_CHANCE) return false;
  const id = WANDERING_MONSTERS[Math.floor(Math.random() * WANDERING_MONSTERS.length)];
  startCombat(id);
  return true;
}
