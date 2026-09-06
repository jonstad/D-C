// Boot + state-machine wiring for phase 1: BOOT -> CLASS_SELECT -> EXPLORE.
// Combat/inventory/menu states are not implemented yet (phases 4/6) —
// this file is intentionally the thin "glue" layer; game logic lives
// in core/world/entities/ui modules so this stays small as those grow.

import { state, addLog, markDiscovered } from './core/gameState.js';
import { bus } from './core/eventBus.js';
import { CLASS_LIST } from './data/classes.js';
import { Character } from './entities/Character.js';
import { loadProceduralLevel } from './world/levelLoader.js';
import * as movement from './world/movement.js';
import { renderScene } from './ui/renderer.js';
import { renderMinimap } from './ui/minimap.js';

// --- DOM refs ----------------------------------------------------------
const screens = {
  boot: document.getElementById('screen-boot'),
  classSelect: document.getElementById('screen-class-select'),
  explore: document.getElementById('screen-explore'),
};
const btnStart = document.getElementById('btn-start');
const classCardsEl = document.getElementById('class-cards');
const btnConfirmClass = document.getElementById('btn-confirm-class');
const viewportEl = document.getElementById('viewport');
const hudStatsEl = document.getElementById('hud-stats');
const minimapCanvas = document.getElementById('minimap-canvas');
const logListEl = document.getElementById('log-list');
const controlsEl = document.getElementById('controls');

let selectedClassId = null;

// --- Screen transitions --------------------------------------------------
function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  state.screen = name;
}

// --- BOOT ----------------------------------------------------------------
btnStart.addEventListener('click', () => {
  buildClassCards();
  showScreen('classSelect');
});

// --- CLASS SELECT ----------------------------------------------------------
function buildClassCards() {
  classCardsEl.innerHTML = '';
  for (const cls of CLASS_LIST) {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.dataset.classId = cls.id;
    card.innerHTML = `
      <h3>${cls.name}</h3>
      <p>${cls.description}</p>
      <div class="stat-line"><span>HP</span><span>${cls.startingHP}</span></div>
      <div class="stat-line"><span>MP</span><span>${cls.startingMP}</span></div>
      <div class="stat-line"><span>STR</span><span>${cls.baseStats.STR}</span></div>
      <div class="stat-line"><span>AGI</span><span>${cls.baseStats.AGI}</span></div>
      <div class="stat-line"><span>INT</span><span>${cls.baseStats.INT}</span></div>
      <div class="stat-line"><span>WIS</span><span>${cls.baseStats.WIS}</span></div>
    `;
    card.addEventListener('click', () => {
      selectedClassId = cls.id;
      document.querySelectorAll('.class-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      btnConfirmClass.disabled = false;
    });
    classCardsEl.appendChild(card);
  }
}

btnConfirmClass.addEventListener('click', () => {
  if (!selectedClassId) return;
  const cls = CLASS_LIST.find((c) => c.id === selectedClassId);
  state.player = new Character({ name: cls.name, classId: cls.id });
  startExploring();
});

// --- EXPLORE ----------------------------------------------------------------
function startExploring() {
  state.map = loadProceduralLevel({ width: 12, height: 12, seed: Date.now() & 0xffffffff });
  markDiscovered(state.map.playerPos.x, state.map.playerPos.y);
  addLog(`${state.player.name} the ${state.player.classDef.name} descends into the dungeon.`);
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

function refreshExploreUI() {
  renderScene(viewportEl, state.map);
  renderMinimap(minimapCanvas, state.map, state.discovered);
  renderHudStats();
}

function renderHudStats() {
  const p = state.player;
  const stats = p.getDerivedStats();
  hudStatsEl.innerHTML = `
    <h2>${p.name} <small style="color:var(--text-dim); font-size:0.7em;">Lv.${p.level} ${p.classDef.name}</small></h2>
    <div class="stat-row"><span>HP</span><span>${p.hp} / ${p.maxHP}</span></div>
    <div class="bar-track"><div class="bar-fill hp" style="width:${(p.hp / p.maxHP) * 100}%"></div></div>
    <div class="stat-row"><span>MP</span><span>${p.mp} / ${p.maxMP}</span></div>
    <div class="bar-track"><div class="bar-fill mp" style="width:${(p.mp / p.maxMP) * 100}%"></div></div>
    <div class="stat-row"><span>STR</span><span>${stats.STR}</span></div>
    <div class="stat-row"><span>AGI</span><span>${stats.AGI}</span></div>
    <div class="stat-row"><span>VIT</span><span>${stats.VIT}</span></div>
    <div class="stat-row"><span>INT</span><span>${stats.INT}</span></div>
    <div class="stat-row"><span>WIS</span><span>${stats.WIS}</span></div>
    <div class="stat-row"><span>LUK</span><span>${stats.LUK}</span></div>
    <div class="stat-row" style="margin-top:6px; color:var(--text-dim);"><span>Turn</span><span>${state.turnCount}</span></div>
  `;
}

function appendLogLine(message) {
  const li = document.createElement('li');
  li.textContent = message;
  logListEl.appendChild(li);
  logListEl.scrollTop = logListEl.scrollHeight;
}
