// Boot + state-machine wiring: BOOT -> PARTY ROSTER -> EXPLORE, with a
// COMBAT screen reachable from EXPLORE via random encounters. This file
// is intentionally the thin "glue" layer; game logic lives in
// core/world/entities/combat/ui modules so this stays small as those
// grow.

import { state, addLog, markDiscovered } from './core/gameState.js';
import { bus } from './core/eventBus.js';
import { CLASS_DATA } from './data/classes.js';
import { DEFAULT_PARTY } from './data/partyPresets.js';
import { Character } from './entities/Character.js';
import { loadProceduralLevel } from './world/levelLoader.js';
import * as movement from './world/movement.js';
import { renderScene } from './ui/renderer.js';
import { renderMinimap } from './ui/minimap.js';
import * as combat from './combat/combatEngine.js';
import {
  renderCombat, spawnPopup, playEnemyAttackAnim, playEnemyHitAnim,
  playEnemyDefeatAnim, flashPartyCardHit, flashPartyCardHeal,
} from './ui/combatUI.js';

// --- DOM refs ----------------------------------------------------------
const screens = {
  boot: document.getElementById('screen-boot'),
  classSelect: document.getElementById('screen-class-select'),
  explore: document.getElementById('screen-explore'),
  combat: document.getElementById('screen-combat'),
};
const btnStart = document.getElementById('btn-start');
const classCardsEl = document.getElementById('class-cards');
const btnConfirmClass = document.getElementById('btn-confirm-class');
const viewportEl = document.getElementById('viewport');
const hudPartyEl = document.getElementById('hud-party');
const minimapCanvas = document.getElementById('minimap-canvas');
const logListEl = document.getElementById('log-list');
const controlsEl = document.getElementById('controls');

// --- Combat DOM refs -----------------------------------------------------
const combatActionsEl = document.getElementById('combat-actions');
const combatEls = {
  enemySprite: document.getElementById('combat-enemy-sprite'),
  enemyShadow: document.getElementById('combat-enemy-shadow'),
  enemyName: document.getElementById('combat-enemy-name'),
  enemyHpFill: document.getElementById('combat-enemy-hp-fill'),
  popups: document.getElementById('combat-popups'),
  partyList: document.getElementById('combat-party-list'),
  partyPopups: document.getElementById('combat-party-popups'),
  turnIndicator: document.getElementById('combat-turn-indicator'),
  actionButtons: Array.from(combatActionsEl.querySelectorAll('button[data-combat-action]')),
};
const combatLogListEl = document.getElementById('combat-log-list');

// --- Screen transitions --------------------------------------------------
function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  state.screen = name;
}

// --- BOOT ----------------------------------------------------------------
btnStart.addEventListener('click', () => {
  buildPartyRosterCards();
  showScreen('classSelect');
});

// --- PARTY ROSTER ----------------------------------------------------------
// Phase 1 doesn't offer party-building UI — DEFAULT_PARTY (one of each
// class) is fixed. This screen just previews who you're taking down,
// reusing the same card layout the old single-class picker used.
function buildPartyRosterCards() {
  classCardsEl.innerHTML = '';
  for (const preset of DEFAULT_PARTY) {
    const cls = CLASS_DATA[preset.classId];
    const card = document.createElement('div');
    card.className = 'class-card';
    card.innerHTML = `
      <div class="class-card-portrait" style="background-image:url('${cls.portrait}')"></div>
      <h3>${preset.name} <small>the ${cls.name}</small></h3>
      <p>${cls.description}</p>
      <div class="stat-line"><span>HP</span><span>${cls.startingHP}</span></div>
      <div class="stat-line"><span>MP</span><span>${cls.startingMP}</span></div>
      <div class="stat-line"><span>STR</span><span>${cls.baseStats.STR}</span></div>
      <div class="stat-line"><span>AGI</span><span>${cls.baseStats.AGI}</span></div>
      <div class="stat-line"><span>INT</span><span>${cls.baseStats.INT}</span></div>
      <div class="stat-line"><span>WIS</span><span>${cls.baseStats.WIS}</span></div>
    `;
    classCardsEl.appendChild(card);
  }
}

btnConfirmClass.addEventListener('click', () => {
  state.party = DEFAULT_PARTY.map((preset) => new Character({ name: preset.name, classId: preset.classId }));
  startExploring();
});

// --- EXPLORE ----------------------------------------------------------------
function startExploring() {
  state.map = loadProceduralLevel({ width: 12, height: 12, seed: Date.now() & 0xffffffff });
  markDiscovered(state.map.playerPos.x, state.map.playerPos.y);
  const names = state.party.map((c) => c.name);
  const rosterLine = names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0];
  addLog(`${rosterLine} descend into the dungeon.`);
  showScreen('explore');
  refreshExploreUI();
}

const MOVE_ACTIONS = {
  moveForward: movement.moveForward,
  moveBackward: movement.moveBackward,
  strafeLeft: movement.strafeLeft,
  strafeRight: movement.strafeRight,
  turnLeft: movement.turnLeft,
  turnRight: movement.turnRight,
};

controlsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = MOVE_ACTIONS[btn.dataset.action];
  if (action) action();
});

const KEY_MAP = {
  ArrowUp: 'moveForward', w: 'moveForward', W: 'moveForward',
  ArrowDown: 'moveBackward', s: 'moveBackward', S: 'moveBackward',
  ArrowLeft: 'turnLeft', a: 'strafeLeft', A: 'strafeLeft',
  ArrowRight: 'turnRight', d: 'strafeRight', D: 'strafeRight',
  q: 'turnLeft', Q: 'turnLeft',
  e: 'turnRight', E: 'turnRight',
};

window.addEventListener('keydown', (e) => {
  if (state.screen !== 'explore') return;
  const actionName = KEY_MAP[e.key];
  if (!actionName) return;
  e.preventDefault();
  MOVE_ACTIONS[actionName]();
});

bus.on('playerMoved', refreshExploreUI);
bus.on('playerTurned', refreshExploreUI);
bus.on('log', appendLogLine);

// --- COMBAT ----------------------------------------------------------------
combatActionsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-combat-action]');
  if (!btn) return;
  const action = btn.dataset.combatAction;
  // While a spell is waiting on a target (see combatUI.js's "Cancel"
  // relabel), the Spell button's click backs out of targeting instead
  // of re-triggering it, and the other three buttons are disabled so
  // there's nothing else for a click here to do.
  if (state.combat && state.combat.pendingSpell) {
    if (action === 'spell') combat.cancelSpellTarget();
    return;
  }
  if (action === 'attack') combat.playerAttack();
  else if (action === 'defend') combat.playerDefend();
  else if (action === 'spell') combat.playerSpell();
  else if (action === 'run') combat.playerRunAway();
});

// Clicking a party card only means something while an ally-targeted
// spell is waiting on a target (see combatUI.js's .targetable cards);
// otherwise this is a no-op, so no separate "are we in combat" guard
// is needed beyond checking pendingSpell itself.
combatEls.partyList.addEventListener('click', (e) => {
  const card = e.target.closest('[data-party-index]');
  if (!card || !state.combat || !state.combat.pendingSpell) return;
  combat.selectSpellTarget(Number(card.dataset.partyIndex));
});

function refreshCombatUI() {
  renderCombat(combatEls, { party: state.party, combat: state.combat });
}

// Where a hit/heal popup for the given party index should land inside
// #combat-party-popups (a sibling overlay of #combat-party-list, not a
// child of it — see css/combat.css's #combat-party-popups comment for
// why a popup can't just live inside the card it's about). Reads the
// card's *current* position, so call this after refreshCombatUI() has
// rebuilt the party list for this event.
function cardPopupTop(targetIndex) {
  const card = combatEls.partyList.querySelector(`[data-party-index="${targetIndex}"]`);
  return card ? card.offsetTop + card.offsetHeight * 0.3 : 0;
}

bus.on('combatStart', () => {
  combatEls.enemySprite.classList.remove('anim-attack', 'anim-hit', 'anim-defeat');
  showScreen('combat');
  refreshCombatUI();
});

bus.on('combatEnd', () => {
  showScreen('explore');
  refreshExploreUI();
});

bus.on('playerAttack', ({ amount, isCrit }) => {
  spawnPopup(combatEls.popups, isCrit ? `-${amount}!` : `-${amount}`, isCrit ? 'crit' : 'damage');
  playEnemyHitAnim(combatEls.enemySprite);
  refreshCombatUI();
});

bus.on('playerSpellHit', ({ amount }) => {
  spawnPopup(combatEls.popups, `-${amount}`, 'damage');
  playEnemyHitAnim(combatEls.enemySprite);
  refreshCombatUI();
});

bus.on('spellTargetingStart', () => refreshCombatUI());
bus.on('spellTargetingCancel', () => refreshCombatUI());

bus.on('playerSpellAlly', ({ amount, kind, targetIndex }) => {
  refreshCombatUI(); // rebuilds the party list first, so the card position below is accurate
  if (kind === 'heal') {
    spawnPopup(combatEls.partyPopups, `+${amount}`, 'heal', cardPopupTop(targetIndex));
    flashPartyCardHeal(combatEls.partyList, targetIndex);
  }
});

bus.on('playerDefend', () => {
  spawnPopup(combatEls.popups, 'Defending!', 'miss');
  refreshCombatUI();
});

bus.on('enemyAttack', ({ amount, targetIndex }) => {
  playEnemyAttackAnim(combatEls.enemySprite);
  refreshCombatUI(); // rebuilds the party list first, so the card position below is accurate
  spawnPopup(combatEls.partyPopups, `-${amount}`, 'damage', cardPopupTop(targetIndex));
  flashPartyCardHit(combatEls.partyList, targetIndex);
});

bus.on('playerRunAttempt', ({ success }) => {
  spawnPopup(combatEls.popups, success ? 'Got away!' : 'Escape failed!', 'miss');
  refreshCombatUI();
});

bus.on('combatVictory', () => {
  playEnemyDefeatAnim(combatEls.enemySprite);
  refreshCombatUI();
});

bus.on('combatLocked', () => refreshCombatUI());
bus.on('turnAdvance', () => refreshCombatUI());
bus.on('roundStart', () => refreshCombatUI());

function refreshExploreUI() {
  renderScene(viewportEl, state.map);
  renderMinimap(minimapCanvas, state.map, state.discovered);
  renderPartyHud();
}

function renderPartyHud() {
  hudPartyEl.innerHTML = state.party.map((c) => {
    const downed = !c.isAlive();
    const hpPct = Math.max(0, (c.hp / c.maxHP) * 100);
    const mpPct = c.maxMP ? Math.max(0, (c.mp / c.maxMP) * 100) : 0;
    return `
      <div class="party-card${downed ? ' downed' : ''}">
        <div class="party-card-portrait" style="background-image:url('${c.classDef.portrait}')"></div>
        <div class="party-card-info">
          <div class="party-card-name"><span>${c.name}</span><small>${downed ? 'Down' : `Lv.${c.level}`}</small></div>
          <div class="bar-track"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
          <div class="bar-track"><div class="bar-fill mp" style="width:${mpPct}%"></div></div>
        </div>
      </div>
    `;
  }).join('') + `<div class="stat-row" style="margin-top:6px; color:var(--text-dim);"><span>Turn</span><span>${state.turnCount}</span></div>`;
}

// Appended into both the explore screen's log and the combat screen's
// log, so switching screens never leaves either one missing history —
// simpler than trying to move one shared <ul> between two sections.
function appendLogLine(message) {
  for (const el of [logListEl, combatLogListEl]) {
    const li = document.createElement('li');
    li.textContent = message;
    el.appendChild(li);
    el.scrollTop = el.scrollHeight;
  }
}
