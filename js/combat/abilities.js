// Effect functions for each class's signature ability, invoked by the
// "Spell" combat action (see combatEngine.js's playerSpell()). Keyed
// by the same ability id already defined in js/data/classes.js — one
// seam, no duplicated ability metadata (name/mpCost/target live there;
// only the combat math lives here).
//
// Each effect receives (player, target) — player is the caster (read
// stats via getDerivedStats()), target is whoever the effect actually
// resolves against, decided by combatEngine.js from the ability's
// `target` field in classes.js: for an enemy-targeted ability (the
// default) that's the live combat.enemy plain object, cast immediately
// like an attack; for an 'ally'-targeted ability (currently just heal)
// that's whichever living Character the player picked via
// selectSpellTarget() — heal ignores it and heals purely off the
// caster's own WIS/INT, since it's the target's HP that changes, not
// the caster's power. Returns { kind, amount, message } for
// combatEngine to apply and combatUI to render as a popup. kind is
// 'damage' | 'heal'.

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export const ABILITY_EFFECTS = {
  power_strike(player, enemy) {
    const stats = player.getDerivedStats();
    const amount = Math.max(1, Math.round(stats.STR * rand(1.4, 1.8) - enemy.stats.VIT * 0.5));
    return { kind: 'damage', amount, message: `${player.name} unleashes a Power Strike!` };
  },
  backstab(player, enemy) {
    const stats = player.getDerivedStats();
    const amount = Math.max(1, Math.round(stats.STR * rand(1.0, 1.3) + stats.AGI * rand(0.6, 0.9) - enemy.stats.VIT * 0.3));
    return { kind: 'damage', amount, message: `${player.name} slips in a Backstab!` };
  },
  firebolt(player, enemy) {
    const stats = player.getDerivedStats();
    const amount = Math.max(1, Math.round(stats.INT * rand(1.5, 1.9) - enemy.stats.VIT * 0.2));
    return { kind: 'damage', amount, message: `${player.name} hurls a Firebolt!` };
  },
  magic_missile(player, enemy) {
    const stats = player.getDerivedStats();
    const amount = Math.max(1, Math.round(stats.INT * rand(1.1, 1.4) - enemy.stats.VIT * 0.1));
    return { kind: 'damage', amount, message: `${player.name} casts Magic Missile!` };
  },
  heal(player) {
    const stats = player.getDerivedStats();
    const amount = Math.max(1, Math.round(stats.WIS * rand(1.2, 1.6) + stats.INT * 0.4));
    return { kind: 'heal', amount, message: `${player.name} channels Heal.` };
  },
};

// Fallback for abilities without a dedicated combat effect yet (later
// phases' utility abilities — steal, disarm_trap, taunt, evade, etc.):
// a plain, unflavored weak hit so the Spell button never no-ops on a
// class whose level-1 ability isn't a direct attack/heal. None of these
// are marked target: 'ally' in classes.js yet, so this always resolves
// against the enemy.
export function resolveAbility(abilityId, player, enemy) {
  const effect = ABILITY_EFFECTS[abilityId];
  if (effect) return effect(player, enemy);
  const stats = player.getDerivedStats();
  const amount = Math.max(1, Math.round(stats.STR * rand(0.7, 1.0)));
  return { kind: 'damage', amount, message: `${player.name} uses ${abilityId}.` };
}
