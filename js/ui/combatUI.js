// Renders the combat screen's dynamic bits (bars, buttons, enemy
// sprite) and the transient effects layered on top (damage/effect
// popups, enemy movement animations). Mirrors ui/renderer.js's role
// for the explore screen: main.js wires DOM events and bus listeners
// and calls these render functions in response; this module never
// touches the event bus or game state directly, only the DOM elements
// and plain data it's handed.

// Full re-render of bars/name/buttons from current state. Cheap enough
// to call after every combat bus event (same pattern as explore's
// refreshExploreUI), so it never drifts from what actually happened.
export function renderCombat(els, { player, combat }) {
  if (!combat) return;
  const { enemy } = combat;

  els.enemySprite.style.backgroundImage = `url('${enemy.sprite}')`;
  els.enemyName.textContent = enemy.name;
  els.enemyHpFill.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;

  els.playerName.textContent = player.name;
  els.playerHpText.textContent = `${player.hp} / ${player.maxHP}`;
  els.playerHpFill.style.width = `${Math.max(0, (player.hp / player.maxHP) * 100)}%`;
  els.playerMpText.textContent = `${player.mp} / ${player.maxMP}`;
  els.playerMpFill.style.width = `${Math.max(0, (player.mp / player.maxMP) * 100)}%`;

  const ability = player.abilities[0];
  const locked = !!combat.locked;
  for (const btn of els.actionButtons) {
    if (btn.dataset.combatAction === 'spell') {
      btn.disabled = locked || !ability || player.mp < ability.mpCost;
      btn.textContent = ability ? `Spell (${ability.name})` : 'Spell';
    } else {
      btn.disabled = locked;
    }
  }
}

// A floating bit of combat text (damage/heal/crit/miss) that rises and
// fades over the enemy stage, then removes itself. kind selects color
// via the .combat-popup-<kind> rules in css/combat.css.
export function spawnPopup(popupLayerEl, text, kind) {
  const el = document.createElement('div');
  el.className = `combat-popup combat-popup-${kind}`;
  el.textContent = text;
  // Small random horizontal jitter so back-to-back popups (e.g. an
  // attack immediately followed by the enemy's reply) don't stack
  // exactly on top of each other and become unreadable.
  el.style.left = `${50 + (Math.random() * 16 - 8)}%`;
  popupLayerEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// Re-triggering a CSS animation on an element that might already be
// mid-way through it (e.g. two hits landing close together) needs the
// class removed, a forced reflow, then re-added — otherwise the browser
// just no-ops on "adding a class it already has".
function retrigger(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

export function playEnemyAttackAnim(enemySpriteEl) {
  retrigger(enemySpriteEl, 'anim-attack');
}

export function playEnemyHitAnim(enemySpriteEl) {
  retrigger(enemySpriteEl, 'anim-hit');
}

export function playEnemyDefeatAnim(enemySpriteEl) {
  enemySpriteEl.classList.add('anim-defeat');
}

export function flashPlayerHit(playerInfoEl) {
  retrigger(playerInfoEl, 'flash-hit');
}
