// Turn-based combat, triggered by a random encounter (see
// world/movement.js's checkTileEvents() and core/turnManager.js's
// tickWorldTurn()). The player acts first each round — attack, defend,
// spell, or run — then, unless that action already ended the fight,
// the enemy acts after a short delay (see scheduleEnemyTurn) so the
// UI has time to show one action before the next. Everything the UI
// needs to know is emitted on the shared bus (core/eventBus.js);
// js/ui/combatUI.js never reaches into this module's internals.

import { state, addLog } from '../core/gameState.js';
import { bus } from '../core/eventBus.js';
import { MONSTER_DATA } from '../data/monsters.js';
import { resolveAbility } from './abilities.js';

const ENEMY_TURN_DELAY = 550; // ms — purely presentational pacing, see scheduleEnemyTurn

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

export function startCombat(monsterId) {
  const enemy = spawnEnemy(monsterId);
  state.combat = { enemy, playerDefending: false, locked: false, over: false };
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

function setLocked(combat, locked) {
  combat.locked = locked;
  bus.emit('combatLocked', locked);
}

function applyDamageToEnemy(amount) {
  state.combat.enemy.hp = Math.max(0, state.combat.enemy.hp - amount);
}

function applyDamageToPlayer(amount) {
  state.player.hp = Math.max(0, state.player.hp - amount);
}

// The enemy's own turn: always resolves synchronously once called (the
// delay, when there is one, happens beforehand in scheduleEnemyTurn).
function enemyTurn() {
  const combat = state.combat;
  const { enemy } = combat;
  bus.emit('enemyActing', { enemy });

  const stats = state.player.getDerivedStats();
  let amount = Math.max(1, Math.round(enemy.stats.STR * rand(0.8, 1.2) - stats.VIT * 0.5));
  if (combat.playerDefending) amount = Math.round(amount * 0.5);
  combat.playerDefending = false;

  applyDamageToPlayer(amount);
  addLog(`The ${enemy.name} ${enemy.flavorHit} ${amount} damage.`);
  bus.emit('enemyAttack', { enemy, amount });

  if (state.player.hp <= 0) {
    addLog(`${state.player.name} has fallen! You wake up back near the entrance, battered but alive.`);
    state.player.hp = 1;
    bus.emit('combatDefeat', { enemy });
    endCombat('defeat');
    return;
  }
  setLocked(combat, false);
}

// Schedules the enemy's turn a beat after the player's, purely so the
// player's own action (and its popup/animation) is visible on screen
// before the enemy's reply lands — the actual game state (damage,
// victory/defeat) is already fully resolved by the time this fires;
// only the *presentation* of the enemy's turn is delayed.
function scheduleEnemyTurn() {
  const combat = state.combat;
  setLocked(combat, true);
  setTimeout(() => {
    if (state.combat !== combat || combat.over) return; // combat ended/replaced meanwhile
    enemyTurn();
  }, ENEMY_TURN_DELAY);
}

const VICTORY_SCREEN_DELAY = 700; // ms — lets the enemy's defeat animation play before the screen switches back

// Called after any player action that could have killed the enemy
// (attack, spell) — checks for victory before handing off to the
// enemy's turn.
function afterPlayerOffense() {
  const combat = state.combat;
  if (combat.enemy.hp <= 0) {
    const { enemy } = combat;
    addLog(`The ${enemy.name} ${enemy.flavorDefeat}!`);
    const leveledUp = state.player.gainXP(enemy.xpReward);
    addLog(`You gain ${enemy.xpReward} XP.${leveledUp ? ` ${state.player.name} reaches level ${state.player.level}!` : ''}`);
    bus.emit('combatVictory', { enemy });
    setTimeout(() => {
      if (state.combat === combat) endCombat('victory');
    }, VICTORY_SCREEN_DELAY);
    return;
  }
  scheduleEnemyTurn();
}

export function playerAttack() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  setLocked(combat, true);
  const stats = state.player.getDerivedStats();
  const { enemy } = combat;
  const critChance = Math.min(0.35, stats.LUK / 80);
  const isCrit = Math.random() < critChance;
  let amount = Math.max(1, Math.round(stats.STR * rand(0.85, 1.15) - enemy.stats.VIT * 0.5));
  if (isCrit) amount = Math.round(amount * 1.6);
  applyDamageToEnemy(amount);
  addLog(`${state.player.name} hits the ${enemy.name} for ${amount} damage${isCrit ? ' (critical!)' : ''}.`);
  bus.emit('playerAttack', { enemy, amount, isCrit });
  afterPlayerOffense();
}

export function playerDefend() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  setLocked(combat, true);
  combat.playerDefending = true;
  addLog(`${state.player.name} braces for the next attack.`);
  bus.emit('playerDefend', {});
  scheduleEnemyTurn();
}

export function playerSpell() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  const player = state.player;
  const ability = player.abilities[0];
  if (!ability) {
    addLog(`${player.name} has no spell to cast yet.`);
    return;
  }
  if (player.mp < ability.mpCost) {
    addLog(`Not enough MP to cast ${ability.name}.`);
    return;
  }
  setLocked(combat, true);
  player.mp -= ability.mpCost;
  const effect = resolveAbility(ability.id, player, combat.enemy);
  addLog(effect.message);
  if (effect.targetsSelf) {
    if (effect.kind === 'heal') {
      player.hp = Math.min(player.maxHP, player.hp + effect.amount);
      addLog(`${player.name} recovers ${effect.amount} HP.`);
    }
    bus.emit('playerSpellSelf', effect);
    scheduleEnemyTurn(); // a self-targeted spell never ends combat by itself
  } else {
    applyDamageToEnemy(effect.amount);
    addLog(`The ${combat.enemy.name} takes ${effect.amount} damage.`);
    bus.emit('playerSpellHit', { enemy: combat.enemy, ...effect });
    afterPlayerOffense();
  }
}

export function playerRunAway() {
  const combat = state.combat;
  if (!combat || combat.over || combat.locked) return;
  setLocked(combat, true);
  const stats = state.player.getDerivedStats();
  const chance = Math.min(0.9, Math.max(0.1, 0.5 + (stats.AGI - combat.enemy.stats.AGI) * 0.03));
  const success = Math.random() < chance;
  bus.emit('playerRunAttempt', { success });
  if (success) {
    addLog(`${state.player.name} flees from the ${combat.enemy.name}.`);
    endCombat('fled');
    return;
  }
  addLog(`${state.player.name} couldn't get away!`);
  scheduleEnemyTurn();
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
