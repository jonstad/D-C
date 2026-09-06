// Base character model shared by the player (and, later, party members
// once phase-10 party support lands). Class-specific flavor comes
// entirely from CLASS_DATA (js/data/classes.js) — this class just
// knows how to apply that data, level up, and expose derived stats.
//
// Equipment bonuses (phase 6) and status-effect modifiers (phase 8)
// both hook into `getDerivedStats()` rather than mutating base stats
// directly, so nothing here needs to change when those land.

import { CLASS_DATA } from '../data/classes.js';

const XP_TABLE_BASE = 40; // xp needed for level 2; scales up per level

export class Character {
  constructor({ name, classId, level = 1 }) {
    const classDef = CLASS_DATA[classId];
    if (!classDef) throw new Error(`Unknown class: ${classId}`);

    this.name = name;
    this.classId = classId;
    this.classDef = classDef;
    this.level = level;
    this.xp = 0;

    this.baseStats = { ...classDef.baseStats };
    this.maxHP = classDef.startingHP;
    this.maxMP = classDef.startingMP;
    this.hp = this.maxHP;
    this.mp = this.maxMP;

    // Equipment slots — populated in phase 6 (inventory/equipment).
    // Present now so save data / UI code can rely on the shape early.
    this.equipment = { weapon: null, offhand: null, armor: null, accessory: null };
    this.inventory = []; // item stack list, filled in phase 6/7

    this.statusEffects = []; // phase 8

    if (level > 1) {
      for (let l = 1; l < level; l++) this._applyLevelGrowth();
    }
  }

  get abilities() {
    return this.classDef.abilities.filter((a) => a.unlockLevel <= this.level);
  }

  // Derived/effective stats = base stats + equipment bonuses (phase 6)
  // + active status-effect modifiers (phase 8). Both of those are
  // additive layers that get folded in here later; combat/UI code
  // should always read through this rather than `baseStats` directly.
  getDerivedStats() {
    return { ...this.baseStats };
  }

  xpForNextLevel() {
    return Math.round(XP_TABLE_BASE * Math.pow(this.level, 1.5));
  }

  gainXP(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.xpForNextLevel()) {
      this.xp -= this.xpForNextLevel();
      this._applyLevelGrowth();
      leveledUp = true;
    }
    return leveledUp;
  }

  _applyLevelGrowth() {
    this.level += 1;
    const growth = this.classDef.growth;
    for (const stat of Object.keys(this.baseStats)) {
      this.baseStats[stat] = Math.round(this.baseStats[stat] + (growth[stat] || 0));
    }
    const hpGain = Math.round(4 + growth.VIT);
    const mpGain = Math.round(2 + (growth.INT + growth.WIS) / 2);
    this.maxHP += hpGain;
    this.maxMP += mpGain;
    this.hp = this.maxHP;
    this.mp = this.maxMP;
  }

  isAlive() {
    return this.hp > 0;
  }

  serialize() {
    return {
      name: this.name,
      classId: this.classId,
      level: this.level,
      xp: this.xp,
      baseStats: this.baseStats,
      maxHP: this.maxHP,
      maxMP: this.maxMP,
      hp: this.hp,
      mp: this.mp,
      equipment: this.equipment,
      inventory: this.inventory,
    };
  }

  static deserialize(data) {
    const c = new Character({ name: data.name, classId: data.classId, level: 1 });
    Object.assign(c, {
      level: data.level,
      xp: data.xp,
      baseStats: data.baseStats,
      maxHP: data.maxHP,
      maxMP: data.maxMP,
      hp: data.hp,
      mp: data.mp,
      equipment: data.equipment,
      inventory: data.inventory,
    });
    return c;
  }
}
