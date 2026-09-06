// Renders the combat screen's dynamic bits (the enemy, the party
// status list, action buttons) and the transient effects layered on
// top (damage/effect popups, enemy movement animations). Mirrors
// ui/renderer.js's role for the explore screen: main.js wires DOM
// events and bus listeners and calls these render functions in
// response; this module never touches the event bus or game state
// directly, only the DOM elements and plain data it's handed.

function partyCardHTML(char, index, combat) {
  const downed = !char.isAlive();
  const pendingSpell = combat.pendingSpell;
  // Not "acting" while combat.locked — that window covers both the brief
  // pause after a player's action and the enemy's own turn, so nobody's
  // card should read as active until the next turn is actually theirs.
  // Also not "acting" while choosing a spell target — the turn indicator
  // reads "Choose a target for X" instead, so no card should look active.
  const isActing = !downed && !combat.locked && !pendingSpell && combat.actingIndex === index;
  // Any living member is a valid Heal target, including the caster —
  // main.js wires clicks on these straight to selectSpellTarget().
  const targetable = !!pendingSpell && !downed;
  const classes = ['party-card'];
  if (isActing) classes.push('active-turn');
  if (downed) classes.push('downed');
  if (targetable) classes.push('targetable');
  const hpPct = Math.max(0, (char.hp / char.maxHP) * 100);
  const mpPct = char.maxMP ? Math.max(0, (char.mp / char.maxMP) * 100) : 0;
  return `
    <div class="${classes.join(' ')}" data-party-index="${index}">
      <div class="party-card-portrait" style="background-image:url('${char.classDef.portrait}')"></div>
      <div class="party-card-info">
        <div class="party-card-name"><span>${char.name}</span><small>${downed ? 'Down' : `Lv.${char.level}`}</small></div>
        <div class="bar-track"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
        <div class="bar-track"><div class="bar-fill mp" style="width:${mpPct}%"></div></div>
      </div>
    </div>
  `;
}

// Full re-render of the enemy/party bars/buttons from current state.
// Cheap enough to call after every combat bus event (same pattern as
// explore's refreshExploreUI), so it never drifts from what happened.
export function renderCombat(els, { party, combat }) {
  if (!combat) return;
  const { enemy, pendingSpell } = combat;

  els.enemySprite.style.backgroundImage = `url('${enemy.sprite}')`;
  els.enemyName.textContent = enemy.name;
  els.enemyHpFill.style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;

  els.partyList.innerHTML = party.map((c, i) => partyCardHTML(c, i, combat)).join('');

  // actingIndex never changes while pendingSpell is set (it's still that
  // caster's turn, just mid-action), so it's always safe to read here —
  // only the *displayed text* differs while a target is being chosen.
  const actorChar = party[combat.actingIndex];
  if (pendingSpell) {
    els.turnIndicator.textContent = `Choose a target for ${pendingSpell.ability.name}`;
  } else {
    els.turnIndicator.textContent = combat.locked ? '' : `${actorChar.name}'s turn`;
  }

  const ability = actorChar ? actorChar.abilities[0] : null;
  const locked = !!combat.locked;
  for (const btn of els.actionButtons) {
    if (btn.dataset.combatAction === 'spell') {
      if (pendingSpell) {
        // Repurposed as the way out of targeting mode — see main.js's
        // combat-action click handler, which routes this to
        // cancelSpellTarget() instead of playerSpell() while pending.
        btn.disabled = false;
        btn.textContent = 'Cancel';
      } else {
        btn.disabled = locked || !ability || !actorChar || actorChar.mp < ability.mpCost;
        btn.textContent = ability ? `Spell (${ability.name})` : 'Spell';
      }
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

// Flashes whichever party card the enemy just hit — looked up by index
// since the party list is fully rebuilt every render (see renderCombat)
// and so has no stable element reference to hold onto between calls.
export function flashPartyCardHit(partyListEl, index) {
  const card = partyListEl.querySelector(`[data-party-index="${index}"]`);
  if (card) retrigger(card, 'flash-hit');
}

// Same idea as flashPartyCardHit but the green "good thing happened"
// variant — used when an ally-targeted spell (Heal) resolves.
export function flashPartyCardHeal(partyListEl, index) {
  const card = partyListEl.querySelector(`[data-party-index="${index}"]`);
  if (card) retrigger(card, 'flash-heal');
}
