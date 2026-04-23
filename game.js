/* =====================================================================
   NEON DESCENT — game.js
   ---------------------------------------------------------------------
   Foundation build for a long-term 2D action RPG.

   Internally organized as logical "modules" (marked with § banners).
   In Cursor you will split these into:
     src/core/        → Game, Loop, Input, Audio, RNG, Math
     src/entities/    → Player, Enemy, Projectile, Pickup, VFX
     src/systems/     → Combat, XP, Loot, Stats, Abilities, Spawner,
                        World, Save, UI
     src/data/        → enemies.js, weapons.js, items.js, upgrades.js,
                        classes.js, zones.js, meta.js
     src/ui/          → hud.js, menus.js, modals.js
===================================================================== */
'use strict';

/* =====================================================================
 § 0. PERFORMANCE CONFIG
===================================================================== */
var LOW_FX_MODE = true;  // reduce particles, glow, recoil for performance

/* =====================================================================
§ 0b. TILEMAP / PROGRESSIVE ROOM CONFIG
===================================================================== */
const TILE_SIZE = 32;
const TILE_TYPES = {
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,
};
const TILE_ASSETS = {
  biomes: [
    'assets/tiles/tilemap_color1.png',
    'assets/tiles/tilemap_color2.png',
    'assets/tiles/tilemap_color3.png',
    'assets/tiles/tilemap_color4.png',
    'assets/tiles/tilemap_color5.png',
  ],
};
const BALANCE_PROFILES = {
  arcade:   { enemyPressure: 0.85, extractionPressure: 0.85, antiKite: 0.9 },
  standard: { enemyPressure: 1.0,  extractionPressure: 1.0,  antiKite: 1.0 },
  hardcore: { enemyPressure: 1.15, extractionPressure: 1.2,  antiKite: 1.15 },
};

/* =====================================================================
 § 1. UTILS  (src/core/utils.js)
===================================================================== */
const Utils = {
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  dist2: (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx*dx + dy*dy; },
  angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  rand: (lo, hi) => lo + Math.random() * (hi - lo),
  randInt: (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
  choice: arr => arr[Math.floor(Math.random() * arr.length)],
  // Weighted choice: items are { weight, ... }
  weighted: arr => {
    const total = arr.reduce((s, it) => s + it.weight, 0);
    let roll = Math.random() * total;
    for (const it of arr) { roll -= it.weight; if (roll <= 0) return it; }
    return arr[arr.length - 1];
  },
  formatTime: s => {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  },
  // Small helper to stack DOM elements
  el: (sel) => document.querySelector(sel),
  els: (sel) => Array.from(document.querySelectorAll(sel)),
};

/* =====================================================================
 § 2. SAVE SYSTEM  (src/systems/save.js)
   localStorage-backed, versioned, resilient.
===================================================================== */
const SAVE_KEY = 'neon_descent_save_v1';
const SaveSystem = {
  defaults: () => ({
    version: 1,
    accountXP: 0,
    accountLevel: 1,
    credits: 0,
    selectedClass: 'soldier',
    selectedZone: 'docks',
    unlockedClasses: ['soldier', 'techhunter', 'biorunner'],
    unlockedZones: ['docks'],
    perfMode: 'auto',            // auto | on | off
    balancePreset: 'standard',   // arcade | standard | hardcore
    metaUpgrades: {},            // id -> rank
    bestRun: null,               // { kills, level, time, zone }
    codex: { enemies: {}, weapons: {}, items: {} },
  }),
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.defaults();
      const parsed = JSON.parse(raw);
      return { ...this.defaults(), ...parsed };
    } catch (e) {
      console.warn('save load failed, resetting', e);
      return this.defaults();
    }
  },
  save(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('save failed', e); }
  },
  reset() { localStorage.removeItem(SAVE_KEY); },
};

/* =====================================================================
 § 3. DATA — CLASSES  (src/data/classes.js)
===================================================================== */
const CLASSES = {
  soldier: {
    id: 'soldier', name: 'SOLDIER', role: 'Balanced Gunfighter', icon: '◉',
    desc: 'Reliable on every front. Steady damage, steady defence.',
    perk: 'Passive: +15% damage under 50% HP (Adrenaline)',
    base: { maxHP: 120, hpRegen: 0.5, moveSpeed: 180, damage: 10, attackSpeed: 2.4,
            critChance: 0.08, critDmg: 1.5, projectileSpeed: 520, projectileSize: 1,
            armor: 3, cdr: 0, pickupRadius: 70 },
    startWeapon: 'pistol_mk1',
    ability: { id: 'dash', name: 'Combat Dash', cd: 6 },
  },
  techhunter: {
    id: 'techhunter', name: 'TECH HUNTER', role: 'Mobility & Gadgets', icon: '◇',
    desc: 'Fragile but impossibly fast. Trades HP for tempo.',
    perk: 'Passive: +25% move speed, +20% crit chance, -20% max HP',
    base: { maxHP: 85, hpRegen: 0.2, moveSpeed: 230, damage: 9, attackSpeed: 3.2,
            critChance: 0.22, critDmg: 1.7, projectileSpeed: 620, projectileSize: 0.9,
            armor: 1, cdr: 0.1, pickupRadius: 90 },
    startWeapon: 'burst_rifle',
    ability: { id: 'blink', name: 'Phase Blink', cd: 5 },
  },
  biorunner: {
    id: 'biorunner', name: 'BIO-RUNNER', role: 'Regen / Sustain', icon: '❋',
    desc: 'A walking laboratory. Heals through attrition.',
    perk: 'Passive: Regen +2/s. Kills restore 1 HP.',
    base: { maxHP: 140, hpRegen: 2.0, moveSpeed: 165, damage: 8, attackSpeed: 2.0,
            critChance: 0.05, critDmg: 1.5, projectileSpeed: 480, projectileSize: 1.1,
            armor: 4, cdr: 0, pickupRadius: 80 },
    startWeapon: 'shotgun_mk1',
    ability: { id: 'heal_pulse', name: 'Symbio Pulse', cd: 10 },
  },
  // Locked / unlockable examples:
  voidmage: {
    id: 'voidmage', name: 'VOID MAGE', role: 'Beam Specialist', icon: '✦',
    desc: 'Channels annihilation. Requires focus.',
    perk: 'Passive: Beam weapons pierce +2 targets',
    base: { maxHP: 90, hpRegen: 0.3, moveSpeed: 175, damage: 12, attackSpeed: 1.6,
            critChance: 0.1, critDmg: 1.8, projectileSpeed: 600, projectileSize: 1,
            armor: 2, cdr: 0.2, pickupRadius: 75 },
    startWeapon: 'beam_mk1',
    ability: { id: 'nova', name: 'Void Nova', cd: 12 },
    locked: true, unlockCost: 500,
  },
};

/* =====================================================================
 § 4. DATA — WEAPONS  (src/data/weapons.js)
   Weapon = projectile archetype + firing pattern.
===================================================================== */
const WEAPONS = {
  pistol_mk1: {
    id: 'pistol_mk1', name: 'Sidearm MK-I', type: 'pistol', icon: '▲',
    rarity: 'common', baseDamage: 1.0, fireMult: 1.0,
    projectiles: 1, spread: 0, pierce: 0,
    color: '#22d3ee', trail: '#22d3ee88', size: 4,
    desc: 'Standard-issue energy pistol.',
  },
  rapid_fire: {
    id: 'rapid_fire', name: 'Needler V2', type: 'rapid', icon: '⫸',
    rarity: 'uncommon', baseDamage: 0.35, fireMult: 3.0,
    projectiles: 1, spread: 0.06, pierce: 0,
    color: '#67e8f9', trail: '#67e8f966', size: 2,
    desc: 'Very fast, low damage. Death by a thousand cuts.',
  },
  burst_rifle: {
    id: 'burst_rifle', name: 'Burst Rifle', type: 'rifle', icon: '▣',
    rarity: 'uncommon', baseDamage: 0.7, fireMult: 1.3,
    projectiles: 3, spread: 0.08, pierce: 0,
    color: '#a5f3fc', trail: '#a5f3fc66', size: 3, burst: 3, burstDelay: 0.08,
    desc: 'Three-round bursts. Precise and punishing.',
  },
  shotgun_mk1: {
    id: 'shotgun_mk1', name: 'Scatter-12', type: 'shotgun', icon: '⬟',
    rarity: 'uncommon', baseDamage: 0.5, fireMult: 0.7,
    projectiles: 6, spread: 0.4, pierce: 0,
    color: '#fbbf24', trail: '#fbbf2466', size: 3, maxRange: 280,
    desc: 'Up close, it removes problems.',
  },
  beam_mk1: {
    id: 'beam_mk1', name: 'Lance Beam', type: 'beam', icon: '═',
    rarity: 'rare', baseDamage: 0.4, fireMult: 5.0,
    projectiles: 1, spread: 0, pierce: 3,
    color: '#c084fc', trail: '#c084fcaa', size: 2,
    desc: 'Continuous beam. Pierces multiple foes.',
  },
  explosive_mk1: {
    id: 'explosive_mk1', name: 'Arc-Launcher', type: 'explosive', icon: '◉',
    rarity: 'rare', baseDamage: 1.8, fireMult: 0.6,
    projectiles: 1, spread: 0, pierce: 0,
    color: '#fb923c', trail: '#fb923caa', size: 6, explodeRadius: 70,
    desc: 'Detonates on impact. AoE damage.',
  },
};

/* =====================================================================
 § 5. DATA — ENEMIES  (src/data/enemies.js)
===================================================================== */
const ENEMIES = {
  grunt: {
    id: 'grunt', name: 'Husk Grunt', archetype: 'melee',
    hp: 12, damage: 6, speed: 70, radius: 13,
    color: '#7f1d1d', accent: '#f87171',
    xp: 3, credits: 0.8, weight: 10, dropChance: 0.02,
    shape: 'circle',
  },
  stalker: {
    id: 'stalker', name: 'Stalker', archetype: 'fast',
    hp: 7, damage: 8, speed: 200, radius: 9,
    color: '#7c2d12', accent: '#fdba74',
    xp: 4, credits: 1.0, weight: 7, dropChance: 0.03,
    shape: 'triangle',
  },
  bomber: {
    id: 'bomber', name: 'Bomber', archetype: 'exploder',
    hp: 15, damage: 4, speed: 90, radius: 14,
    color: '#713f12', accent: '#fbbf24',
    xp: 6, credits: 1.5, weight: 5, dropChance: 0.04,
    shape: 'circle',
    explodeOnDeath: true, explodeDamage: 20, explodeRadius: 80,
  },
  hulk: {
    id: 'hulk', name: 'Iron Hulk', archetype: 'tank',
    hp: 55, damage: 12, speed: 45, radius: 22,
    color: '#3f0d0d', accent: '#dc2626',
    xp: 12, credits: 3, weight: 3, dropChance: 0.12,
    shape: 'square',
  },
  sniper: {
    id: 'sniper', name: 'Ranger', archetype: 'ranged',
    hp: 14, damage: 10, speed: 55, radius: 12,
    color: '#581c87', accent: '#c084fc',
    xp: 8, credits: 2, weight: 4, dropChance: 0.08,
    shape: 'diamond',
    ranged: { range: 340, cooldown: 2.2, projectileSpeed: 260, projectileColor: '#c084fc' },
  },
  elite_grunt: {
    id: 'elite_grunt', name: 'Husk Champion', archetype: 'elite',
    hp: 80, damage: 14, speed: 85, radius: 18,
    color: '#1e1b4b', accent: '#22d3ee',
    xp: 30, credits: 10, weight: 0.5, dropChance: 0.4,
    shape: 'circle', elite: true,
  },
  // BOSS template; spawner handles uniquely.
  boss_warden: {
    id: 'boss_warden', name: 'The Warden', archetype: 'boss',
    hp: 800, damage: 25, speed: 55, radius: 34,
    color: '#450a0a', accent: '#fb7185',
    xp: 200, credits: 100, weight: 0, dropChance: 1,
    shape: 'square', boss: true,
  },
};

/* =====================================================================
 § 6. DATA — ZONES  (src/data/zones.js)
===================================================================== */
const ZONES = {
  docks: {
    id: 'docks', name: 'Rusted Docks', tier: 'SECTOR 01', icon: '⚓',
    desc: 'Forgotten shipping lanes. Husks from the old war still patrol.',
    bg: { base: '#050a12', grid: '#0e2238', fog: '#1e293b' },
    enemyPool: ['grunt', 'grunt', 'stalker', 'bomber', 'hulk'],
    eliteAt: 120, bossAt: 300,
    difficulty: 1.0, locked: false,
  },
  nexus: {
    id: 'nexus', name: 'Broken Nexus', tier: 'SECTOR 02', icon: '⌬',
    desc: 'Shattered data-cathedral. Ranged hostiles and unstable matter.',
    bg: { base: '#080512', grid: '#2a1050', fog: '#3b1e6b' },
    enemyPool: ['grunt', 'stalker', 'bomber', 'sniper', 'sniper', 'hulk'],
    eliteAt: 90, bossAt: 260,
    difficulty: 1.4, locked: false, unlockReq: 'Reach account level 3',
  },
  spire: {
    id: 'spire', name: 'Ashen Spire', tier: 'SECTOR 03', icon: '▲',
    desc: 'The tower. Where the last signal came from.',
    bg: { base: '#0a0505', grid: '#501010', fog: '#6b1e1e' },
    enemyPool: ['stalker', 'hulk', 'sniper', 'elite_grunt'],
    eliteAt: 60, bossAt: 220,
    difficulty: 2.0, locked: true, unlockReq: 'Account Lv 5 + clear Nexus',
  },
};

/* =====================================================================
 § 7. DATA — UPGRADES  (src/data/upgrades.js)
   Shown on level-up. Each modifies player stats / weapon stats.
===================================================================== */
const UPGRADES = [
  // Every upgrade must visibly change gameplay. No +5% filler.

  // === PROJECTILE MODIFIERS (stackable, build-defining) ===
  { id: 'proj_up',     name: 'Multishot',          icon: '⋈', rarity: 'uncommon', desc: '+1 projectile', tags: ['spread'],
    apply: p => p.extraProjectiles += 1 },
  { id: 'pierce_up',   name: 'Pierce Rounds',      icon: '→', rarity: 'uncommon', desc: 'Bullets pierce +1 enemy', tags: ['penetration'],
    apply: p => p.extraPierce += 1 },
  { id: 'ricochet',    name: 'Ricochet',           icon: '⌇', rarity: 'rare',     desc: 'Bullets bounce to 1 nearby enemy', tags: ['spread'],
    apply: p => p.ricochet = (p.ricochet || 0) + 1 },
  { id: 'explosive',   name: 'Frag Rounds',        icon: '✸', rarity: 'rare',     desc: 'Shots explode on hit (AoE)', tags: ['aoe'],
    apply: p => p.fragRounds = (p.fragRounds || 0) + 1 },
  { id: 'size_up',     name: 'Heavy Caliber',      icon: '●', rarity: 'uncommon', desc: '+40% projectile size, +15% damage', tags: ['damage'],
    apply: p => { p.stats.projectileSize *= 1.4; p.stats.damage *= 1.15; } },

  // === WEAPON SWAPS (build-defining, unique) ===
  { id: 'wep_rapid',   name: 'Needler V2',         icon: '⫸', rarity: 'rare',     desc: 'Swap: rapid fire (fast, low dmg)', tags: ['weapon','speed'], unique: true,
    apply: p => { p.weapon = WEAPONS.rapid_fire; } },
  { id: 'wep_shotgun', name: 'Scatter-12',         icon: '⬟', rarity: 'rare',     desc: 'Swap: shotgun (spread, close range)', tags: ['weapon','spread'], unique: true,
    apply: p => { p.weapon = WEAPONS.shotgun_mk1; } },
  { id: 'wep_beam',    name: 'Lance Beam',         icon: '═', rarity: 'rare',     desc: 'Swap: beam (pierces 3, continuous)', tags: ['weapon','penetration'], unique: true,
    apply: p => { p.weapon = WEAPONS.beam_mk1; } },
  { id: 'wep_explode', name: 'Arc-Launcher',       icon: '◉', rarity: 'rare',     desc: 'Swap: launcher (AoE explosions)', tags: ['weapon','aoe'], unique: true,
    apply: p => { p.weapon = WEAPONS.explosive_mk1; } },

  // === ORBITAL (new weapon axis) ===
  { id: 'orbital',     name: 'Orbital Drone',      icon: '◈', rarity: 'rare',     desc: '+1 drone orbiting you (deals damage)', tags: ['orbital','aoe'],
    apply: p => { p.orbitals = (p.orbitals || 0) + 1; } },

  // === SUSTAIN (meaningful amounts) ===
  { id: 'hp_up',       name: 'Reinforced Plating', icon: '❤', rarity: 'common',   desc: '+40 max HP', tags: ['defense'],
    apply: p => { p.stats.maxHP += 40; p.hp += 40; } },
  { id: 'lifesteal',   name: 'Vampiric Rounds',    icon: '✺', rarity: 'rare',     desc: 'Heal 2 HP per kill', tags: ['sustain'],
    apply: p => p.lifesteal = (p.lifesteal || 0) + 0.5 },
  { id: 'armor_up',    name: 'Nano-Plating',       icon: '▨', rarity: 'uncommon', desc: '+5 armor (flat damage reduction)', tags: ['defense'],
    apply: p => p.stats.armor += 5 },

  // === SPEED/FIRE RATE (big jumps only) ===
  { id: 'fire_up',     name: 'Overclock',          icon: '⟫', rarity: 'uncommon', desc: '+30% attack speed', tags: ['speed'],
    apply: p => p.stats.attackSpeed *= 1.3 },
  { id: 'ms_up',       name: 'Kinetic Boosters',   icon: '»', rarity: 'uncommon', desc: '+20% move speed', tags: ['mobility'],
    apply: p => p.stats.moveSpeed *= 1.2 },

  // === RISK/REWARD (interesting decisions) ===
  { id: 'berserker',   name: 'Berserker Protocol', icon: '✦', rarity: 'rare',     desc: 'Below 40% HP: +50% dmg, +20% speed', tags: ['damage','risk'],
    apply: p => { p.berserker = true; } },
  { id: 'glass_cannon',name: 'Glass Cannon',       icon: '◇', rarity: 'rare',     desc: '-40% max HP, +80% damage', tags: ['damage','risk'],
    apply: p => { p.stats.maxHP = Math.floor(p.stats.maxHP * 0.6); p.hp = Math.min(p.hp, p.stats.maxHP); p.stats.damage *= 1.8; } },
  { id: 'close_combat',name: 'Point Blank',        icon: '⊕', rarity: 'uncommon', desc: 'Close kills: +100% XP', tags: ['risk'],
    apply: p => { p.pointBlank = true; } },
  { id: 'chain_light', name: 'Chain Lightning',    icon: '⚡', rarity: 'rare',     desc: 'Kills zap 2 nearby enemies', tags: ['aoe','damage'],
    apply: p => { p.chainLightning = (p.chainLightning || 0) + 2; } },

  // === LEGENDARY (run-defining) ===
  { id: 'second_wind', name: 'Second Wind',        icon: '✧', rarity: 'legendary',desc: 'Survive one lethal hit', tags: ['defense'], unique: true,
    apply: p => p.secondWind = true },
  { id: 'bullet_hell', name: 'Bullet Hell',        icon: '✹', rarity: 'legendary',desc: '+3 projectiles, +50% fire rate, -30% dmg', tags: ['spread','speed'],
    apply: p => { p.extraProjectiles += 3; p.stats.attackSpeed *= 1.5; p.stats.damage *= 0.7; } },
];

/* =====================================================================
 § 8. DATA — META TREE  (src/data/meta.js)
   Persists across runs. Purchased with credits.
===================================================================== */
const META_UPGRADES = [
  { id: 'm_hp',     name: 'Vital Weave',     icon: '❤',  desc: '+10 max HP per rank',     max: 10, cost: r => 20 + r*15, apply: (p, r) => p.stats.maxHP += 10*r },
  { id: 'm_dmg',    name: 'Armory Training', icon: '✦',  desc: '+4% damage per rank',     max: 10, cost: r => 25 + r*15, apply: (p, r) => p.stats.damage *= (1 + 0.04*r) },
  { id: 'm_as',     name: 'Trigger Drill',   icon: '⟫',  desc: '+3% attack speed',        max: 10, cost: r => 25 + r*15, apply: (p, r) => p.stats.attackSpeed *= (1 + 0.03*r) },
  { id: 'm_ms',     name: 'Marathon',        icon: '»',  desc: '+3% move speed',          max: 8,  cost: r => 20 + r*12, apply: (p, r) => p.stats.moveSpeed *= (1 + 0.03*r) },
  { id: 'm_pickup', name: 'Scavenger',       icon: '◯',  desc: '+15% pickup radius',      max: 5,  cost: r => 30 + r*20, apply: (p, r) => p.stats.pickupRadius *= (1 + 0.15*r) },
  { id: 'm_gold',   name: 'Opportunist',     icon: '★',  desc: '+10% credits per run',    max: 10, cost: r => 40 + r*20, apply: null, goldMult: r => 1 + 0.10*r },
  { id: 'm_xp',     name: 'Quick Study',     icon: '◇',  desc: '+5% XP gained per rank',  max: 10, cost: r => 40 + r*20, apply: null, xpMult: r => 1 + 0.05*r },
  { id: 'm_armor',  name: 'Hardened',        icon: '▨',  desc: '+1 armor per rank',       max: 5,  cost: r => 50 + r*25, apply: (p, r) => p.stats.armor += r },
  { id: 'm_crit',   name: 'Keen Eye',        icon: '◎',  desc: '+2% crit per rank',       max: 5,  cost: r => 50 + r*30, apply: (p, r) => p.stats.critChance += 0.02*r },
  { id: 'm_revive', name: 'Resurrect Chip',  icon: '✧',  desc: 'Revive once per run at 50% HP', max: 1, cost: _ => 500, apply: (p, r) => p.metaRevive = true },
];

/* =====================================================================
 § 9. DATA — ITEMS / LOOT  (src/data/items.js)
   Items roll random stats within their rarity bracket.
   Slot: weapon | helmet | chest | gloves | boots | accessory
===================================================================== */
const ITEM_TEMPLATES = [
  { slot: 'helmet', names: ['Visor', 'Circlet', 'Headcase'], stats: ['maxHP', 'armor', 'critChance'] },
  { slot: 'chest',  names: ['Vest', 'Plate', 'Harness'],      stats: ['maxHP', 'armor', 'hpRegen'] },
  { slot: 'gloves', names: ['Gauntlets', 'Grips', 'Talons'],  stats: ['damage', 'attackSpeed', 'critDmg'] },
  { slot: 'boots',  names: ['Treads', 'Runners', 'Striders'], stats: ['moveSpeed', 'pickupRadius'] },
  { slot: 'accessory', names: ['Module', 'Chip', 'Amulet'],   stats: ['cdr', 'critChance', 'damage', 'hpRegen'] },
];

const RARITY = {
  common:    { mult: 1.0, statCount: 1, color: '#9ab0c7', weight: 60 },
  uncommon:  { mult: 1.4, statCount: 2, color: '#4ade80', weight: 25 },
  rare:      { mult: 1.9, statCount: 3, color: '#60a5fa', weight: 10 },
  epic:      { mult: 2.6, statCount: 4, color: '#c084fc', weight: 4 },
  legendary: { mult: 3.6, statCount: 5, color: '#fb923c', weight: 1 },
};

const STAT_ROLLS = {
  maxHP:       [5, 20],
  armor:       [1, 4],
  damage:      [0.5, 2],
  attackSpeed: [0.04, 0.15],
  moveSpeed:   [2, 8],
  critChance:  [0.02, 0.08],
  critDmg:     [0.08, 0.25],
  hpRegen:     [0.2, 0.8],
  pickupRadius:[3, 10],
  cdr:         [0.02, 0.06],
};

const LootSystem = {
  rollRarity() {
    const bag = Object.entries(RARITY).map(([k, v]) => ({ key: k, weight: v.weight }));
    return Utils.weighted(bag).key;
  },
  rollItem(rarity = null) {
    rarity = rarity || this.rollRarity();
    const template = Utils.choice(ITEM_TEMPLATES);
    const info = RARITY[rarity];
    const stats = {};
    const statPool = [...template.stats];
    for (let i = 0; i < Math.min(info.statCount, statPool.length); i++) {
      const stat = statPool.splice(Utils.randInt(0, statPool.length - 1), 1)[0];
      const [lo, hi] = STAT_ROLLS[stat];
      stats[stat] = +(Utils.rand(lo, hi) * info.mult).toFixed(2);
    }
    return {
      id: `${template.slot}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      slot: template.slot, rarity,
      name: Utils.choice(template.names),
      stats,
    };
  },
};

/* =====================================================================
 § 10. INPUT SYSTEM  (src/core/input.js)
   Keyboard + touch joystick. Normalized {x, y} output [-1..1].
===================================================================== */
const Input = {
  keys: {},
  move: { x: 0, y: 0 },
  touchActive: false,
  touchStart: null,
  touchCurrent: null,
  joystickEl: null,
  stickEl: null,
  gameActive: false,  // true only during gameplay
  init() {
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' || e.key === 'Escape') e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys[e.key.toLowerCase()] = false);
    window.addEventListener('blur', () => this.keys = {});

    // Touch joystick — bind to document, check gameActive before handling
    this.joystickEl = Utils.el('#joystick');
    this.stickEl = Utils.el('#joystickStick');
    document.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
    document.addEventListener('touchmove',  e => this.onTouchMove(e),  { passive: false });
    document.addEventListener('touchend',   e => this.onTouchEnd(e),   { passive: false });
    document.addEventListener('touchcancel',e => this.onTouchEnd(e),   { passive: false });
  },
  setGameActive(v) { this.gameActive = v; },
  reset() {
    this.move = { x: 0, y: 0 };
    this.touchActive = false;
    if (this.joystickEl) this.joystickEl.classList.remove('active');
  },
  update() {
    // Keyboard input
    if (!this.touchActive) {
      let dx = 0, dy = 0;
      if (this.keys['w'] || this.keys['arrowup'])    dy -= 1;
      if (this.keys['s'] || this.keys['arrowdown'])  dy += 1;
      if (this.keys['a'] || this.keys['arrowleft'])  dx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx /= len; dy /= len; }
      this.move.x = dx; this.move.y = dy;
    }
  },
  onTouchStart(e) {
    // Only handle touches during active gameplay, not on menu screens
    if (!this.gameActive) return;
    // Don't intercept touches on HUD buttons
    if (e.target.closest('button, .icon-btn, .modal, .screen')) return;
    e.preventDefault();
    var t = e.changedTouches[0];
    this.touchActive = true;
    this.touchStart = { x: t.clientX, y: t.clientY };
    this.touchCurrent = { x: t.clientX, y: t.clientY };
    this.joystickEl.style.left = (t.clientX - 60) + 'px';
    this.joystickEl.style.top  = (t.clientY - 60) + 'px';
    this.joystickEl.style.bottom = 'auto';
    this.joystickEl.classList.add('active');
    this.updateStick();
  },
  onTouchMove(e) {
    if (!this.gameActive || !this.touchActive) return;
    e.preventDefault();
    var t = e.changedTouches[0];
    this.touchCurrent = { x: t.clientX, y: t.clientY };
    this.updateStick();
  },
  onTouchEnd(e) {
    if (!this.gameActive) return;
    if (!this.touchActive) return;
    this.touchActive = false;
    this.move = { x: 0, y: 0 };
    this.joystickEl.classList.remove('active');
    if (this.stickEl) this.stickEl.style.transform = 'translate(-50%, -50%)';
  },
  updateStick() {
    const dx = this.touchCurrent.x - this.touchStart.x;
    const dy = this.touchCurrent.y - this.touchStart.y;
    const len = Math.hypot(dx, dy);
    const max = 50;
    const factor = len > max ? max / len : 1;
    const clamped = { x: dx * factor, y: dy * factor };
    this.stickEl.style.transform = `translate(calc(-50% + ${clamped.x}px), calc(-50% + ${clamped.y}px))`;
    if (len < 6) { this.move.x = 0; this.move.y = 0; }
    else { this.move.x = dx / Math.max(len, max); this.move.y = dy / Math.max(len, max); }
  },
};

/* =====================================================================
 § 11. ENTITIES — PLAYER  (src/entities/player.js)
===================================================================== */
class Player {
  constructor(classId, saveData) {
    const cls = CLASSES[classId];
    this.classId = classId;
    this.cls = cls;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.radius = 14;
    this.facing = 0;

    // Deep-copy base stats
    this.stats = { ...cls.base };
    this.hp = this.stats.maxHP;
    this.xp = 0;
    this.level = 1;

    this.weapon = WEAPONS[cls.startWeapon];
    this.fireTimer = 0;
    this.burstQueue = [];
    this.targetLock = null;
    this.retargetTimer = 0;

    // Modifiers
    this.extraProjectiles = 0;
    this.extraPierce = 0;
    this.lifesteal = 0;
    this.fragRounds = 0;
    this.ricochet = 0;
    this.secondWind = false;
    this.metaRevive = false;

    // === NEW SYSTEMS ===
    this.orbitals = 0;
    this.orbitalDmgMult = 1;
    this.orbitalRadius = 80;
    this.orbitalSpeedMult = 1;
    this.orbitalAngle = 0;
    this.berserker = false;
    this.adrenaline = false;
    this.adrenalineTimer = 0;
    this.pointBlank = false;
    this.chainLightning = 0;
    this.takenUpgradeIds = [];  // track for synergy/unique filtering

    // Ability state
    this.abilityCD = 0;

    // I-frames
    this.iframes = 0;

    // Juice state
    this.muzzleFlash = 0;
    this.recoil = 0;

    // Run counters
    this.kills = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;

    // Apply meta upgrades
    for (const [id, rank] of Object.entries(saveData.metaUpgrades || {})) {
      const mu = META_UPGRADES.find(m => m.id === id);
      if (mu && mu.apply && rank > 0) mu.apply(this, rank);
    }
    this.hp = this.stats.maxHP;
    this.usedSecondWind = false;
  }

  xpForNextLevel() { return Math.floor(20 * Math.pow(this.level, 1.4)); }

  gainXP(amount) {
    this.xp += amount;
    while (this.xp >= this.xpForNextLevel()) {
      this.xp -= this.xpForNextLevel();
      this.level += 1;
      Game.onLevelUp();
    }
  }

  damage(amt) {
    if (this.iframes > 0) return;
    const reduced = Math.max(1, amt - this.stats.armor);
    this.hp -= reduced;
    this.damageTaken += reduced;
    this.iframes = 0.5;
    VFX.hitFlash(this.x, this.y, '#ff4d6d');
    Game.cameraShake(6, 0.2);
    if (this.hp <= 0) this.tryDie();
  }

  tryDie() {
    if (this.secondWind && !this.usedSecondWind) {
      this.usedSecondWind = true;
      this.hp = this.stats.maxHP * 0.5;
      this.iframes = 2;
      VFX.burst(this.x, this.y, '#fbbf24', 30);
      Game.cameraShake(14, 0.4);
      return;
    }
    if (this.metaRevive && !this.usedRevive) {
      this.usedRevive = true;
      this.hp = this.stats.maxHP * 0.5;
      this.iframes = 2.5;
      VFX.burst(this.x, this.y, '#22d3ee', 40);
      Game.cameraShake(16, 0.4);
      return;
    }
    this.hp = 0;
    Game.onPlayerDeath();
  }

  heal(amt) { this.hp = Math.min(this.stats.maxHP, this.hp + amt); }

  update(dt) {
    // Movement
    let speed = this.stats.moveSpeed * (this._berserkerActive ? 1.2 : 1);
    this.vx = Input.move.x * speed;
    this.vy = Input.move.y * speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Clamp against current world bounds (tilemap room or arena fallback)
    var clamped = World.constrainCircle(this.x, this.y, this.radius, this.x - this.vx * dt, this.y - this.vy * dt);
    this.x = clamped.x;
    this.y = clamped.y;
    if (Input.move.x !== 0 || Input.move.y !== 0) this.facing = Math.atan2(Input.move.y, Input.move.x);

    // Regen
    this.hp = Math.min(this.stats.maxHP, this.hp + this.stats.hpRegen * dt);

    // Iframes tick
    if (this.iframes > 0) this.iframes -= dt;

    // Juice decay
    if (this.muzzleFlash > 0) this.muzzleFlash -= dt * 8;
    if (this.recoil > 0) this.recoil -= dt * 10;

    // Soldier perk
    if (this.classId === 'soldier' && this.hp < this.stats.maxHP * 0.5 && !this._perkOn) {
      this._perkOn = true;
    } else if (this.classId === 'soldier' && this.hp >= this.stats.maxHP * 0.5 && this._perkOn) {
      this._perkOn = false;
    }

    // Weapon firing
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.burstQueue.length === 0) {
      this.retargetTimer -= dt;
      var needsRetarget = !this.targetLock || !this.targetLock.alive || this.retargetTimer <= 0;
      if (this.targetLock) {
        var outOfRange = Utils.dist2(this.x, this.y, this.targetLock.x, this.targetLock.y) > Math.pow(520, 2);
        if (outOfRange) needsRetarget = true;
      }
      if (needsRetarget) {
        this.targetLock = Combat.findAimTarget(this);
        // Short lock window keeps combat readable but less auto-play.
        this.retargetTimer = 0.12;
      }
      const target = this.targetLock;
      if (target) {
        this.fireAt(target);
        var adrenalineBonus = (this.adrenaline && this.adrenalineTimer >= 0.5) ? 1.35 : 1;
        var berserkSpeedBonus = this._berserkerActive ? 1.2 : 1;
        const interval = 1 / (this.stats.attackSpeed * this.weapon.fireMult * adrenalineBonus * berserkSpeedBonus);
        this.fireTimer = interval;
      }
    }

    // Burst queue (for burst rifles)
    if (this.burstQueue.length > 0) {
      this.burstQueue[0].delay -= dt;
      if (this.burstQueue[0].delay <= 0) {
        const shot = this.burstQueue.shift();
        this.spawnShot(shot.target);
      }
    }

    // Cooldowns
    if (this.abilityCD > 0) this.abilityCD -= dt;

    // Ability trigger (space / tap not bound to touch yet; simple keyboard demo)
    if (Input.keys[' '] && this.abilityCD <= 0) this.useAbility();

    // === ORBITAL WEAPON SYSTEM ===
    if (this.orbitals > 0) {
      this.orbitalAngle += dt * 3.0 * this.orbitalSpeedMult;
      var orbDmg = this.stats.damage * 0.8 * this.orbitalDmgMult;
      var orbR = this.orbitalRadius;
      for (var oi = 0; oi < this.orbitals; oi++) {
        var oAng = this.orbitalAngle + (oi * Math.PI * 2 / this.orbitals);
        var ox = this.x + Math.cos(oAng) * orbR;
        var oy = this.y + Math.sin(oAng) * orbR;
        // Hit enemies
        for (var ei = 0; ei < Enemies.list.length; ei++) {
          var e = Enemies.list[ei];
          if (!e.alive) continue;
          if (Utils.dist(ox, oy, e.x, e.y) < e.radius + 10) {
            if (!e._orbitalCD || e._orbitalCD <= 0) {
              e.damage(orbDmg);
              e._orbitalCD = 0.3; // prevent hitting same enemy too fast
              VFX.impactFlash(ox, oy, '#22d3ee');
            }
          }
          if (e._orbitalCD > 0) e._orbitalCD -= dt;
        }
      }
    }

    // === BERSERKER PERK ===
    this._berserkerActive = this.berserker && this.hp < this.stats.maxHP * 0.4;

    // === ADRENALINE PERK (standing still bonus) ===
    if (this.adrenaline) {
      if (Input.move.x === 0 && Input.move.y === 0) {
        this.adrenalineTimer = Math.min(this.adrenalineTimer + dt, 1);
      } else {
        this.adrenalineTimer = 0;
      }
    }
  }

  fireAt(target) {
    if (this.weapon.burst) {
      for (let i = 0; i < this.weapon.burst; i++) {
        this.burstQueue.push({ target, delay: i * this.weapon.burstDelay });
      }
    } else {
      this.spawnShot(target);
    }
  }

  spawnShot(target) {
    const base = Utils.angle(this.x, this.y, target.x, target.y);
    // Face toward target when shooting
    this.facing = base;
    const count = this.weapon.projectiles + this.extraProjectiles;
    const spread = this.weapon.spread;
    const pierce = this.weapon.pierce + this.extraPierce;

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
      const ang = base + t * spread * 2;
      const dmgMul = this.weapon.baseDamage * (this._perkOn ? 1.15 : 1) * (this._berserkerActive ? 1.5 : 1);
      Projectiles.spawn({
        x: this.x, y: this.y,
        angle: ang,
        speed: this.stats.projectileSpeed,
        size: this.weapon.size * this.stats.projectileSize,
        damage: this.stats.damage * dmgMul,
        color: this.weapon.color,
        trail: this.weapon.trail,
        pierce,
        maxRange: this.weapon.maxRange || null,
        ricochet: this.ricochet,
        explodeRadius: this.weapon.explodeRadius || (this.fragRounds ? 30 : 0),
        crit: Math.random() < this.stats.critChance,
        critDmg: this.stats.critDmg,
        friendly: true,
      });
    }
    // === JUICE: muzzle flash + recoil (reduced for performance) ===
    this.muzzleFlash = LOW_FX_MODE ? 0.5 : 1;
    this.recoil = LOW_FX_MODE ? 0.3 : 1;
    // No screen shake on normal shots — only elites/explosions
    AudioBus.play('shoot');
  }

  useAbility() {
    const ab = this.cls.ability;
    if (!ab) return;
    const cd = ab.cd * (1 - this.stats.cdr);
    this.abilityCD = cd;
    switch (ab.id) {
      case 'dash':
      case 'blink': {
        const dist = ab.id === 'blink' ? 180 : 120;
        const ang = this.facing;
        this.x += Math.cos(ang) * dist;
        this.y += Math.sin(ang) * dist;
        this.iframes = 0.4;
        VFX.burst(this.x, this.y, this.cls.id === 'techhunter' ? '#a5f3fc' : '#22d3ee', 16);
        break;
      }
      case 'heal_pulse': {
        this.heal(this.stats.maxHP * 0.35);
        VFX.burst(this.x, this.y, '#4ade80', 28);
        // AOE damage
        for (const e of Enemies.list) {
          if (Utils.dist(this.x, this.y, e.x, e.y) < 160) e.damage(this.stats.damage * 3);
        }
        break;
      }
      case 'nova': {
        for (const e of Enemies.list) {
          if (Utils.dist(this.x, this.y, e.x, e.y) < 220) e.damage(this.stats.damage * 5);
        }
        VFX.burst(this.x, this.y, '#c084fc', 50);
        Game.cameraShake(10, 0.3);
        break;
      }
    }
  }

  render(ctx) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 10, this.radius * 0.9, this.radius * 0.35, 0, 0, Math.PI * 2); ctx.fill();

    // Body glow — reduced for clarity
    var glowColor = this.iframes > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(34,211,238,0.2)';
    var glowR = LOW_FX_MODE ? this.radius * 1.6 : this.radius * 2.5;
    var g = ctx.createRadialGradient(this.x, this.y, this.radius * 0.5, this.x, this.y, glowR);
    g.addColorStop(0, glowColor);
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2); ctx.fill();

    // Muzzle flash (renders at gun tip when firing)
    if (this.muzzleFlash > 0) {
      var mfx = this.x + Math.cos(this.facing) * (this.radius + 8);
      var mfy = this.y + Math.sin(this.facing) * (this.radius + 8);
      var mfSize = this.muzzleFlash * 60;
      ctx.save();
      ctx.globalAlpha = this.muzzleFlash;
      ctx.fillStyle = this.weapon.color || '#22d3ee';
      ctx.beginPath(); ctx.arc(mfx, mfy, mfSize, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(mfx, mfy, mfSize * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Body — directional triangle ship shape
    ctx.save();
    ctx.translate(this.x, this.y);
    // Visual recoil: nudge backward when firing
    var recoilOff = this.recoil > 0 ? -this.recoil * 4 : 0;
    ctx.rotate(this.facing);
    ctx.translate(recoilOff, 0);

    var flash = this.iframes > 0 && Math.floor(this.iframes * 20) % 2;
    ctx.fillStyle = flash ? '#ffffff' : '#0b1a2b';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    var r = this.radius;
    // Pointed ship shape
    ctx.beginPath();
    ctx.moveTo(r + 4, 0);                         // nose
    ctx.lineTo(-r * 0.7, -r * 0.75);              // top wing
    ctx.lineTo(-r * 0.4, 0);                      // tail notch
    ctx.lineTo(-r * 0.7, r * 0.75);               // bottom wing
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Engine glow
    if (Input.move.x !== 0 || Input.move.y !== 0) {
      ctx.fillStyle = '#22d3ee';
      ctx.globalAlpha = 0.5 + Math.sin(Game.time * 20) * 0.3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.25);
      ctx.lineTo(-r * 1.1 - Math.random() * 4, 0);
      ctx.lineTo(-r * 0.5, r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // === ORBITAL DRONES ===
    if (this.orbitals > 0) {
      for (var oi = 0; oi < this.orbitals; oi++) {
        var oAng = this.orbitalAngle + (oi * Math.PI * 2 / this.orbitals);
        var ox = this.x + Math.cos(oAng) * this.orbitalRadius;
        var oy = this.y + Math.sin(oAng) * this.orbitalRadius;
        ctx.fillStyle = 'rgba(34,211,238,0.15)';
        ctx.beginPath(); ctx.arc(ox, oy, 14, 0, Math.PI * 2); ctx.fill();
        var trailAng = oAng - 0.5;
        var tx = this.x + Math.cos(trailAng) * this.orbitalRadius;
        var ty = this.y + Math.sin(trailAng) * this.orbitalRadius;
        ctx.strokeStyle = 'rgba(34,211,238,0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ox, oy); ctx.stroke();
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // === BERSERKER AURA ===
    if (this._berserkerActive) {
      ctx.save();
      ctx.globalAlpha = 0.15 + Math.sin(Game.time * 8) * 0.1;
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // === ADRENALINE FOCUS RING ===
    if (this.adrenaline && this.adrenalineTimer >= 0.5) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

/* =====================================================================
 § 12. ENTITIES — ENEMY  (src/entities/enemy.js)
=====================================================================*/
class Enemy {
  constructor(type, x, y, difficultyScale = 1) {
    const def = ENEMIES[type];
    this.type = type;
    this.def = def;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = def.radius;
    this.maxHP = def.hp * difficultyScale;
    this.hp = this.maxHP;
    this.atkDamage = def.damage * Math.sqrt(difficultyScale);
    this.speed = def.speed;
    this.xp = Math.ceil(def.xp * Math.sqrt(difficultyScale));
    this.credits = def.credits * difficultyScale;
    this.color = def.color;
    this.accent = def.accent;
    this.shape = def.shape;
    this.alive = true;
    this.hitFlash = 0;
    this.attackCD = 0;
    this.ranged = def.ranged;
    this.elite = def.elite;
    this.boss = def.boss;
    // === TASK 5: speed variation + wobble + time creep ===
    var timeCreep = 1 + World.time * 0.002; // enemies get 0.2% faster per second
    this.speed = def.speed * Utils.rand(0.85, 1.15) * Math.min(timeCreep, 1.6);
    this.wobblePhase = Math.random() * Math.PI * 2;
    this.wobbleSpeed = Utils.rand(2, 4);

    // Codex
    Game.save.codex.enemies[type] = (Game.save.codex.enemies[type] || 0) + 1;
  }

  update(dt) {
    if (!this.alive) return;
    const p = Game.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    const playerStill = Math.abs(p.vx) + Math.abs(p.vy) < 25;
    const antiKiteMul = (World.getBalanceProfile && World.getBalanceProfile().antiKite) || 1;

    if (this.ranged) {
      // Ranged enemies strafe a bit and punish static kiting.
      const ideal = this.ranged.range * 0.68;
      const moveDir = d > ideal ? 1 : -0.35;
      const strafeDir = (Math.sin(World.time * 1.8 + this.wobblePhase) > 0) ? 1 : -1;
      const nx = dx / (d || 1), ny = dy / (d || 1);
      const baseSpeed = this.speed * (playerStill ? (1 + 0.12 * antiKiteMul) : 1);
      this.vx = nx * baseSpeed * moveDir + (-ny) * baseSpeed * 0.18 * strafeDir;
      this.vy = ny * baseSpeed * moveDir + (nx) * baseSpeed * 0.18 * strafeDir;
      this.attackCD -= dt;
      if (d < this.ranged.range && this.attackCD <= 0) {
        this.attackCD = this.ranged.cooldown * (playerStill ? (1 - 0.15 * antiKiteMul) : 1);
        const ang = Math.atan2(dy, dx);
        Projectiles.spawn({
          x: this.x, y: this.y, angle: ang,
          speed: this.ranged.projectileSpeed,
          size: 4, damage: this.atkDamage,
          color: this.ranged.projectileColor,
          trail: this.ranged.projectileColor + '66',
          pierce: 0, friendly: false,
        });
      }
    } else {
      // Melee: less passive wobble, more forward pressure.
      this.wobblePhase += this.wobbleSpeed * dt;
      var wobble = Math.sin(this.wobblePhase) * 0.22;
      var chaseAng = Math.atan2(dy, dx) + wobble;
      var pressMul = playerStill ? (1 + 0.2 * antiKiteMul) : 1;
      if (this.type === 'stalker') {
        pressMul *= (d > 170 ? (1 + 0.3 * antiKiteMul) : (1 + 0.12 * antiKiteMul));
      } else if (this.type === 'hulk') {
        pressMul *= (d > 230 ? (1 + 0.25 * antiKiteMul) : (1 + 0.05 * antiKiteMul));
      } else if (this.elite || this.boss) {
        pressMul *= (1 + 0.15 * antiKiteMul);
      }
      this.vx = Math.cos(chaseAng) * this.speed * pressMul;
      this.vy = Math.sin(chaseAng) * this.speed * pressMul;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Melee contact damage
    if (!this.ranged && d < this.radius + p.radius) {
      p.damage(this.atkDamage * dt * 2);  // damage-per-second while overlapping
    }

    // Keep within current world bounds (tilemap room or arena fallback)
    var clamped = World.constrainCircle(this.x, this.y, this.radius, this.x - this.vx * dt, this.y - this.vy * dt);
    this.x = clamped.x;
    this.y = clamped.y;
  }

  damage(amt, isCrit) {
    if (!this.alive) return;
    this.hp -= amt;
    this.hitFlash = 0.08;
    Game.player.damageDealt += amt;
    VFX.damageNumber(this.x, this.y - this.radius, Math.ceil(amt), isCrit);
    // Simplified impact — only on crits or in full FX mode
    if (!LOW_FX_MODE || isCrit) {
      VFX.impactFlash(this.x, this.y, isCrit ? '#fbbf24' : this.accent);
    }
    // Hit-pause only on crits
    if (isCrit) Game.hitPause(0.03);
    // Knockback
    var p = Game.player;
    var knockAng = Utils.angle(p.x, p.y, this.x, this.y);
    this.x += Math.cos(knockAng) * 3;
    this.y += Math.sin(knockAng) * 3;
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;

    // === BOMBER: explode on death, damage player + nearby enemies ===
    if (this.def.explodeOnDeath) {
      var exR = this.def.explodeRadius || 80;
      var exD = this.def.explodeDamage || 20;
      var p = Game.player;
      if (Utils.dist(p.x, p.y, this.x, this.y) < exR) {
        p.damage(exD);
      }
      // damage other enemies in range (chain reactions)
      for (var bi = 0; bi < Enemies.list.length; bi++) {
        var be = Enemies.list[bi];
        if (be === this || !be.alive) continue;
        if (Utils.dist(this.x, this.y, be.x, be.y) < exR * 0.6) {
          be.damage(exD * 0.5);
        }
      }
      VFX.burst(this.x, this.y, '#fbbf24', LOW_FX_MODE ? 10 : 20, 180);
      VFX.deathRing(this.x, this.y, '#fbbf24', exR * 0.5);
      Game.cameraShake(10, 0.3);
    } else {
      // Normal death VFX — reduced in LOW_FX_MODE
      var burstCount = this.boss ? (LOW_FX_MODE ? 25 : 60) : (this.elite ? (LOW_FX_MODE ? 12 : 30) : (LOW_FX_MODE ? 6 : 14));
      var burstSpeed = this.boss ? 240 : (this.elite ? 200 : 140);
      VFX.burst(this.x, this.y, this.accent, burstCount, burstSpeed);
      VFX.deathRing(this.x, this.y, this.accent, this.radius);
      // === TASK 5: only shake on elite/boss kills ===
      if (this.boss || this.elite) {
        Game.cameraShake(this.boss ? 16 : 8, this.boss ? 0.4 : 0.15);
      }
    }
    AudioBus.play('kill');
    // === TASK 7: slow-mo on elite/boss kill ===
    if (this.boss) Game.triggerSlowMo(0.6, 0.2);
    else if (this.elite) Game.triggerSlowMo(0.3, 0.35);
    Game.player.kills += 1;

    // XP orb
    var metaXPMult = Game.metaMultiplier('xpMult');
    // === POINT BLANK: +100% XP for nearby kills ===
    var pointBlankMult = 1;
    if (Game.player.pointBlank && Utils.dist(Game.player.x, Game.player.y, this.x, this.y) < 100) {
      pointBlankMult = 2;
      VFX.damageNumber(this.x, this.y - this.radius - 12, 'CLOSE!', false);
    }
    Pickups.spawnXP(this.x, this.y, Math.ceil(this.xp * metaXPMult * pointBlankMult));

    // === CHAIN LIGHTNING: zap nearby enemies on kill ===
    if (Game.player.chainLightning > 0) {
      var chainCount = 0;
      for (var ci = 0; ci < Enemies.list.length && chainCount < Game.player.chainLightning; ci++) {
        var ce = Enemies.list[ci];
        if (ce === this || !ce.alive) continue;
        if (Utils.dist(this.x, this.y, ce.x, ce.y) < 120) {
          ce.damage(Game.player.stats.damage * 0.3);
          VFX.impactFlash(ce.x, ce.y, '#67e8f9');
          chainCount++;
        }
      }
    }

    // Credit drop chance
    const metaGoldMult = Game.metaMultiplier('goldMult');
    if (Math.random() < (this.elite || this.boss ? 1 : 0.35)) {
      Pickups.spawnCredits(this.x, this.y, Math.ceil(this.credits * metaGoldMult));
    }

    // Item drop
    // === EXTRACTION LOOT: drop into RunInventory instead of auto-equip ===
    if (Math.random() < this.def.dropChance) {
      var lootTier = Math.min(4, Math.floor(World.time / 60));
      var loot = RunInventory.rollLoot(lootTier);
      RunInventory.tryAdd(loot);
    }

    // Bio-runner lifesteal
    if (Game.player.classId === 'biorunner') Game.player.heal(1);

    // Lifesteal pickup (kill-based)
    if (Game.player.lifesteal > 0 && Math.random() < Game.player.lifesteal) {
      Game.player.heal(1);
    }

    if (this.boss) Game.onBossKilled(this);
  }

  render(ctx) {
    const flash = this.hitFlash > 0;
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + this.radius * 0.5, this.radius * 0.9, this.radius * 0.3, 0, 0, Math.PI * 2); ctx.fill();

    // Elite/boss glow — subtle
    if ((this.elite || this.boss) && !LOW_FX_MODE) {
      var gr = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2);
      gr.addColorStop(0, this.accent + '33');
      gr.addColorStop(1, this.accent + '00');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2); ctx.fill();
    }

    // Body
    ctx.fillStyle = flash ? '#ffffff' : this.color;
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = this.elite || this.boss ? 2.5 : 1.5;
    ctx.beginPath();
    const r = this.radius;
    switch (this.shape) {
      case 'circle':
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2); break;
      case 'square':
        ctx.rect(this.x - r, this.y - r, r*2, r*2); break;
      case 'triangle':
        ctx.moveTo(this.x, this.y - r);
        ctx.lineTo(this.x + r * 0.87, this.y + r * 0.5);
        ctx.lineTo(this.x - r * 0.87, this.y + r * 0.5);
        ctx.closePath(); break;
      case 'diamond':
        ctx.moveTo(this.x, this.y - r);
        ctx.lineTo(this.x + r, this.y);
        ctx.lineTo(this.x, this.y + r);
        ctx.lineTo(this.x - r, this.y);
        ctx.closePath(); break;
    }
    ctx.fill(); ctx.stroke();

    // HP bar for bosses / elites
    if (this.boss || (this.elite && this.hp < this.maxHP)) {
      const w = this.boss ? 80 : 40;
      const h = this.boss ? 6 : 3;
      const pct = this.hp / this.maxHP;
      ctx.fillStyle = '#0b1a2b';
      ctx.fillRect(this.x - w/2, this.y - this.radius - h - 6, w, h);
      ctx.fillStyle = this.accent;
      ctx.fillRect(this.x - w/2, this.y - this.radius - h - 6, w * pct, h);
    }

    ctx.restore();
  }
}

const Enemies = {
  list: [],
  spawn(type, x, y) {
    const diff = World.currentDifficulty();
    this.list.push(new Enemy(type, x, y, diff));
  },
  update(dt) {
    for (const e of this.list) e.update(dt);
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.alive) this.list[w++] = e;
    }
    this.list.length = w;
  },
  render(ctx) { for (const e of this.list) e.render(ctx); },
  clear() { this.list = []; },
};

/* =====================================================================
 § 13. ENTITIES — PROJECTILES  (src/entities/projectile.js)
===================================================================== */
const Projectiles = {
  list: [],
  spawn(p) {
    this.list.push({
      x: p.x, y: p.y,
      vx: Math.cos(p.angle) * p.speed,
      vy: Math.sin(p.angle) * p.speed,
      size: p.size,
      damage: p.crit ? p.damage * p.critDmg : p.damage,
      crit: !!p.crit,
      color: p.color,
      trail: p.trail,
      pierce: p.pierce,
      hits: new Set(),
      life: 3,
      distance: 0,
      maxRange: p.maxRange,
      ricochet: p.ricochet || 0,
      explodeRadius: p.explodeRadius || 0,
      friendly: p.friendly,
    });
  },
  update(dt) {
    for (const pr of this.list) {
      const dx = pr.vx * dt, dy = pr.vy * dt;
      pr.x += dx; pr.y += dy;
      pr.distance += Math.hypot(dx, dy);
      pr.life -= dt;

      // Out of playable area → remove
      if (World.isOutsidePlayable(pr.x, pr.y, 50)) pr.life = 0;
      if (pr.maxRange && pr.distance > pr.maxRange) pr.life = 0;

      if (pr.friendly) {
        // Hit enemies
        for (const e of Enemies.list) {
          if (!e.alive || pr.hits.has(e)) continue;
          if (Utils.dist2(pr.x, pr.y, e.x, e.y) <= Math.pow(pr.size + e.radius, 2)) {
            e.damage(pr.damage, pr.crit);
            pr.hits.add(e);
            if (pr.explodeRadius > 0) {
              // AoE
              for (const e2 of Enemies.list) {
                if (e2 === e || !e2.alive) continue;
                if (Utils.dist(pr.x, pr.y, e2.x, e2.y) < pr.explodeRadius) {
                  e2.damage(pr.damage * 0.6);
                }
              }
              VFX.burst(pr.x, pr.y, pr.color, 14);
              pr.life = 0;
            }
            if (pr.pierce > 0) {
              pr.pierce -= 1;
            } else if (pr.ricochet > 0) {
              // Redirect to nearest other enemy
              const next = Combat.findNearestEnemy(pr.x, pr.y, e);
              if (next) {
                const a = Utils.angle(pr.x, pr.y, next.x, next.y);
                const s = Math.hypot(pr.vx, pr.vy);
                pr.vx = Math.cos(a) * s; pr.vy = Math.sin(a) * s;
                pr.ricochet -= 1;
                pr.hits.clear(); pr.hits.add(e);
              } else { pr.life = 0; }
            } else {
              pr.life = 0;
            }
            break;
          }
        }
      } else {
        // Enemy projectile hits player
        const p = Game.player;
        if (Utils.dist2(pr.x, pr.y, p.x, p.y) <= Math.pow(pr.size + p.radius, 2)) {
          p.damage(pr.damage);
          pr.life = 0;
        }
      }
    }
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const pr = this.list[i];
      if (pr.life > 0) this.list[w++] = pr;
    }
    this.list.length = w;
  },
  render(ctx) {
    for (const pr of this.list) {
      var speed = Math.hypot(pr.vx, pr.vy);
      var angle = Math.atan2(pr.vy, pr.vx);
      // elongated trail
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(angle);
      // outer glow
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pr.color;
      ctx.beginPath(); ctx.ellipse(0, 0, pr.size * 4, pr.size * 1.8, 0, 0, Math.PI * 2); ctx.fill();
      // trail
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = pr.trail;
      ctx.beginPath(); ctx.ellipse(-pr.size * 1.5, 0, pr.size * 2.5, pr.size * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      // core
      ctx.globalAlpha = 1;
      ctx.fillStyle = pr.crit ? '#ffffff' : pr.color;
      ctx.beginPath(); ctx.arc(0, 0, pr.size, 0, Math.PI * 2); ctx.fill();
      // bright center
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(0, 0, pr.size * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
  clear() { this.list = []; },
};

/* =====================================================================
 § 14. ENTITIES — PICKUPS  (src/entities/pickup.js)
===================================================================== */
const Pickups = {
  list: [],
  spawnXP(x, y, amount) {
    this.list.push({ type: 'xp', x, y, vx: Utils.rand(-40,40), vy: Utils.rand(-40,40),
      amount, color: '#22d3ee', size: 4 + Math.min(6, amount * 0.2), life: 30, pulled: false });
  },
  spawnCredits(x, y, amount) {
    this.list.push({ type: 'credits', x, y, vx: Utils.rand(-40,40), vy: Utils.rand(-40,40),
      amount, color: '#fbbf24', size: 5, life: 30, pulled: false });
  },
  spawnItem(x, y) {
    const item = LootSystem.rollItem();
    this.list.push({ type: 'item', x, y, vx: 0, vy: 0,
      item, color: RARITY[item.rarity].color, size: 8, life: 60, pulled: false });
  },
  update(dt) {
    const p = Game.player;
    for (const pk of this.list) {
      pk.life -= dt;
      // initial spread fades
      pk.vx *= 0.9; pk.vy *= 0.9;
      pk.x += pk.vx * dt; pk.y += pk.vy * dt;

      const d = Utils.dist(pk.x, pk.y, p.x, p.y);
      if (d < p.stats.pickupRadius || pk.pulled) {
        pk.pulled = true;
        const a = Utils.angle(pk.x, pk.y, p.x, p.y);
        const pull = 420;
        pk.x += Math.cos(a) * pull * dt;
        pk.y += Math.sin(a) * pull * dt;
      }
      if (d < p.radius + 4) {
        if (pk.type === 'xp') { p.gainXP(pk.amount); AudioBus.play('pickup'); }
        else if (pk.type === 'credits') { Game.runCredits += pk.amount; AudioBus.play('pickup'); }
        else if (pk.type === 'item') Game.collectItem(pk.item);
        pk.life = 0;
      }
    }
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const pk = this.list[i];
      if (pk.life > 0) this.list[w++] = pk;
    }
    this.list.length = w;
  },
  render(ctx) {
    for (const pk of this.list) {
      const pulse = 1 + Math.sin(Game.time * 6 + pk.x) * 0.2;
      ctx.save();
      if (pk.type === 'item') {
        // diamond loot marker with glow
        ctx.save();
        ctx.translate(pk.x, pk.y); ctx.rotate(Math.PI / 4);
        // glow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = pk.color;
        ctx.fillRect(-pk.size * 2, -pk.size * 2, pk.size*4, pk.size*4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = pk.color;
        ctx.fillRect(-pk.size, -pk.size, pk.size*2, pk.size*2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.strokeRect(-pk.size, -pk.size, pk.size*2, pk.size*2);
        ctx.restore();
      } else {
        // === XP/Credit orb with halo glow ===
        var glowR = pk.size * pulse * 2.5;
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = pk.color;
        ctx.beginPath(); ctx.arc(pk.x, pk.y, glowR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = pk.color;
        ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.size * pulse, 0, Math.PI * 2); ctx.fill();
        // white core
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(pk.x, pk.y, pk.size * pulse * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },
  clear() { this.list = []; },
};

/* =====================================================================
 § 15. VFX  (src/entities/vfx.js)
===================================================================== */
const VFX = {
  particles: [],
  numbers: [],
  rings: [],
  maxParticles: LOW_FX_MODE ? 450 : 900,
  maxNumbers: 90,
  maxRings: 80,
  hitFlash(x, y, color) { this.burst(x, y, color, 4, 80); },
  burst(x, y, color, count, speed) {
    count = count || 10;
    speed = speed || 160;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Utils.rand(speed * 0.4, speed);
      this.particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: Utils.rand(0.3, 0.7), maxLife: 0.7, color, size: Utils.rand(2, 5),
        glow: true,
      });
    }
    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }
  },
  // === Impact flash — simplified in LOW_FX_MODE ===
  impactFlash(x, y, color) {
    this.particles.push({
      x, y, vx: 0, vy: 0,
      life: 0.1, maxLife: 0.1, color: '#ffffff', size: LOW_FX_MODE ? 6 : 12, glow: !LOW_FX_MODE,
    });
    if (!LOW_FX_MODE) {
      for (var i = 0; i < 3; i++) {
        var ang = Math.random() * Math.PI * 2;
        this.particles.push({
          x, y, vx: Math.cos(ang) * 80, vy: Math.sin(ang) * 80,
          life: 0.15, maxLife: 0.15, color: color, size: 2, glow: false,
        });
      }
    }
  },
  // === NEW: expanding ring on enemy death ===
  deathRing(x, y, color, radius) {
    this.rings.push({ x, y, color, radius: radius || 10, maxRadius: (radius || 10) * 4, life: 0.3, maxLife: 0.3 });
    if (this.rings.length > this.maxRings) {
      this.rings.splice(0, this.rings.length - this.maxRings);
    }
  },
  damageNumber(x, y, val, crit) {
    this.numbers.push({ x: x + Utils.rand(-8,8), y, val, crit, life: 0.8, vy: -80, scale: crit ? 1.4 : 1.0 });
    if (this.numbers.length > this.maxNumbers) {
      this.numbers.splice(0, this.numbers.length - this.maxNumbers);
    }
  },
  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.93; p.vy *= 0.93;
      p.life -= dt;
    }
    let pw = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) this.particles[pw++] = p;
    }
    this.particles.length = pw;
    for (const n of this.numbers) {
      n.y += n.vy * dt; n.vy *= 0.92; n.life -= dt;
      n.scale *= 0.97;
    }
    let nw = 0;
    for (let i = 0; i < this.numbers.length; i++) {
      const n = this.numbers[i];
      if (n.life > 0) this.numbers[nw++] = n;
    }
    this.numbers.length = nw;
    for (const r of this.rings) {
      r.life -= dt;
      var t = 1 - (r.life / r.maxLife);
      r.radius = Utils.lerp(r.radius, r.maxRadius, t);
    }
    let rw = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (r.life > 0) this.rings[rw++] = r;
    }
    this.rings.length = rw;
  },
  render(ctx) {
    // Death rings
    for (const r of this.rings) {
      var a = Math.max(0, r.life / r.maxLife);
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke();
    }
    // Particles — skip expensive glow in LOW_FX_MODE
    for (const p of this.particles) {
      var a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      if (p.glow && !LOW_FX_MODE) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.25;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Damage numbers with scale and shadow
    for (const n of this.numbers) {
      ctx.globalAlpha = Math.max(0, n.life / 0.8);
      var fontSize = Math.round(14 * n.scale);
      ctx.font = 'bold ' + fontSize + 'px ui-monospace, monospace';
      ctx.textAlign = 'center';
      // shadow
      ctx.fillStyle = '#000000';
      ctx.fillText(n.crit ? n.val + '!' : n.val, n.x + 1, n.y + 1);
      // text
      ctx.fillStyle = n.crit ? '#fbbf24' : '#ffffff';
      ctx.fillText(n.crit ? n.val + '!' : n.val, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  },
  clear() { this.particles = []; this.numbers = []; this.rings = []; },
};

/* =====================================================================
 § 16. COMBAT / TARGETING  (src/systems/combat.js)
===================================================================== */
const Combat = {
  angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  },
  findNearestEnemy(x, y, exclude = null) {
    let best = null, bestD = Infinity;
    for (const e of Enemies.list) {
      if (!e.alive || e === exclude) continue;
      const d = Utils.dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },
  findAimTarget(player) {
    var coneHalfAngle = Math.PI * 0.33; // ~60 degrees each side
    var maxDist2 = Math.pow(560, 2);
    var best = null;
    var bestScore = Infinity;
    for (const e of Enemies.list) {
      if (!e.alive) continue;
      var d2 = Utils.dist2(player.x, player.y, e.x, e.y);
      if (d2 > maxDist2) continue;
      var ang = Utils.angle(player.x, player.y, e.x, e.y);
      var off = this.angleDiff(ang, player.facing);
      // Primary preference: enemies in front cone. Secondary: nearest fallback.
      var conePenalty = off <= coneHalfAngle ? 0 : 500000;
      var score = d2 + conePenalty + off * 12000;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best || this.findNearestEnemy(player.x, player.y);
  },
};

/* =====================================================================
 § 17. WORLD / SPAWNER  (src/systems/world.js)
===================================================================== */
const World = {
  zone: null,
  time: 0,
  radius: 900,           // arena radius
  spawnTimer: 0,
  spawnInterval: 1.2,
  maxEnemies: 35,
  bossSpawned: false,
  sectorFlashTimer: 0,
  lastSectorLabel: '',
  map: null,
  useTileRoom: true,
  sectorPools: [
    ['grunt', 'stalker'],
    ['grunt', 'stalker', 'sniper'],
    ['stalker', 'sniper', 'bomber'],
    ['sniper', 'bomber', 'hulk', 'elite_grunt'],
    ['bomber', 'hulk', 'elite_grunt'],
  ],
  biomeTilesets: [],
  currentBiomeIdx: 0,
  biomeStepSec: 75,
  progressionEvalTimer: 0,
  progressionEvalInterval: 0.1,
  tilesReady: false,

  setZone(id) { this.zone = ZONES[id]; },
  initTileAssets() {
    const loadImage = (src) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    this.biomeTilesets = TILE_ASSETS.biomes.map(loadImage);
    this.tilesReady = false;
    var markReady = () => {
      this.tilesReady = this.biomeTilesets.length > 0 && this.biomeTilesets.every(function(img) { return img.complete; });
    };
    for (const img of this.biomeTilesets) {
      img.onload = markReady;
      img.onerror = function() {};
    }
  },
  buildProgressiveRoom() {
    const w = 56;
    const h = 42;
    const tiles = new Array(h);
    for (let y = 0; y < h; y++) {
      tiles[y] = new Array(w).fill(TILE_TYPES.FLOOR);
      for (let x = 0; x < w; x++) {
        const border = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
        if (border) tiles[y][x] = TILE_TYPES.WALL;
      }
    }

    const paintWallRect = (x0, y0, rw, rh) => {
      for (let yy = y0; yy < y0 + rh; yy++) {
        for (let xx = x0; xx < x0 + rw; xx++) {
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) tiles[yy][xx] = TILE_TYPES.WALL;
        }
      }
    };

    // Central arena separators / side pockets to start "progressive room" feel.
    paintWallRect(10, 7, 2, 28);
    paintWallRect(44, 7, 2, 28);
    paintWallRect(20, 10, 16, 2);
    paintWallRect(20, 30, 16, 2);
    paintWallRect(26, 16, 4, 10);

    // Openings to preserve flow.
    for (let y = 18; y <= 23; y++) {
      tiles[y][10] = TILE_TYPES.DOOR;
      tiles[y][11] = TILE_TYPES.DOOR;
      tiles[y][44] = TILE_TYPES.DOOR;
      tiles[y][45] = TILE_TYPES.DOOR;
    }
    for (let x = 26; x <= 29; x++) {
      tiles[10][x] = TILE_TYPES.DOOR;
      tiles[11][x] = TILE_TYPES.DOOR;
      tiles[30][x] = TILE_TYPES.DOOR;
      tiles[31][x] = TILE_TYPES.DOOR;
    }
    // Ensure center spawn area remains walkable.
    for (let y = 20; y <= 22; y++) {
      for (let x = 27; x <= 28; x++) {
        tiles[y][x] = TILE_TYPES.FLOOR;
      }
    }

    this.map = {
      w,
      h,
      tileSize: TILE_SIZE,
      tiles,
      originX: -(w * TILE_SIZE) * 0.5,
      originY: -(h * TILE_SIZE) * 0.5,
      floorVariants: [
        { sx: 0, sy: 0, sw: 16, sh: 16 },
        { sx: 16, sy: 0, sw: 16, sh: 16 },
        { sx: 32, sy: 0, sw: 16, sh: 16 },
      ],
      wallVariants: [
        { sx: 0, sy: 16, sw: 16, sh: 16 },
        { sx: 16, sy: 16, sw: 16, sh: 16 },
        { sx: 32, sy: 16, sw: 16, sh: 16 },
      ],
      doors: [
        { id: 'west_gate', unlockAtTime: 35, unlockAtKills: 20, unlocked: false, cells: [], openedAt: 0 },
        { id: 'east_gate', unlockAtTime: 70, unlockAtKills: 45, unlocked: false, cells: [], openedAt: 0 },
        { id: 'north_gate', unlockAtTime: 105, unlockAtKills: 70, unlocked: false, cells: [], openedAt: 0 },
        { id: 'south_gate', unlockAtTime: 135, unlockAtKills: 95, unlocked: false, cells: [], openedAt: 0 },
      ],
    };
    // Map door cells to unlock milestones.
    for (let y = 18; y <= 23; y++) {
      this.map.doors[0].cells.push({ tx: 10, ty: y }, { tx: 11, ty: y });
      this.map.doors[1].cells.push({ tx: 44, ty: y }, { tx: 45, ty: y });
    }
    for (let x = 26; x <= 29; x++) {
      this.map.doors[2].cells.push({ tx: x, ty: 10 }, { tx: x, ty: 11 });
      this.map.doors[3].cells.push({ tx: x, ty: 30 }, { tx: x, ty: 31 });
    }
    this.radius = Math.min(w, h) * TILE_SIZE * 0.45;
  },
  getDoorByTile(tx, ty) {
    if (!this.map || !this.map.doors) return null;
    for (const door of this.map.doors) {
      for (const cell of door.cells) {
        if (cell.tx === tx && cell.ty === ty) return door;
      }
    }
    return null;
  },
  worldToTile(wx, wy) {
    if (!this.map) return null;
    const tx = Math.floor((wx - this.map.originX) / this.map.tileSize);
    const ty = Math.floor((wy - this.map.originY) / this.map.tileSize);
    return { tx, ty };
  },
  isWallAtWorld(wx, wy) {
    if (!this.map) return false;
    const t = this.worldToTile(wx, wy);
    if (!t) return false;
    if (t.ty < 0 || t.ty >= this.map.h || t.tx < 0 || t.tx >= this.map.w) return true;
    const tileType = this.map.tiles[t.ty][t.tx];
    if (tileType === TILE_TYPES.WALL) return true;
    if (tileType === TILE_TYPES.DOOR) {
      const door = this.getDoorByTile(t.tx, t.ty);
      return !!(door && !door.unlocked);
    }
    return false;
  },
  updateProgressiveDoors() {
    if (!this.map || !this.map.doors || !Game.player) return;
    for (const door of this.map.doors) {
      if (door.unlocked) continue;
      if (this.time >= door.unlockAtTime && Game.player.kills >= door.unlockAtKills) {
        door.unlocked = true;
        door.openedAt = this.time;
        Game.announce('GATE OPENED: ' + door.id.replace('_', ' ').toUpperCase());
        AudioBus.play('levelup');
        this.triggerGateEvent(door);
      }
    }
  },
  getDoorCenter(door) {
    if (!door || !door.cells || door.cells.length === 0 || !this.map) return null;
    let sumX = 0;
    let sumY = 0;
    for (const c of door.cells) {
      sumX += c.tx;
      sumY += c.ty;
    }
    const avgTx = sumX / door.cells.length;
    const avgTy = sumY / door.cells.length;
    return {
      x: this.map.originX + (avgTx + 0.5) * this.map.tileSize,
      y: this.map.originY + (avgTy + 0.5) * this.map.tileSize,
    };
  },
  getUnlockedDoorCount() {
    if (!this.map || !this.map.doors) return 0;
    let n = 0;
    for (const d of this.map.doors) if (d.unlocked) n++;
    return n;
  },
  getActiveSectorTier() {
    return Math.min(this.sectorPools.length - 1, this.getUnlockedDoorCount());
  },
  getBalanceProfile() {
    var key = (Game && Game.balancePreset) ? Game.balancePreset : 'standard';
    return BALANCE_PROFILES[key] || BALANCE_PROFILES.standard;
  },
  getEnemyPoolForTier(tier) {
    const idx = Utils.clamp(tier, 0, this.sectorPools.length - 1);
    const pool = this.sectorPools[idx].filter(function(id) { return !!ENEMIES[id]; });
    if (pool.length > 0) return pool;
    if (this.zone && this.zone.enemyPool && this.zone.enemyPool.length > 0) return this.zone.enemyPool;
    return ['grunt', 'stalker'];
  },
  spawnGateWave(door, count, includeElite, tier) {
    if (!Game.player) return;
    const center = this.getDoorCenter(door);
    if (!center) return;
    const pool = this.getEnemyPoolForTier(tier);
    const angleToPlayer = Utils.angle(center.x, center.y, Game.player.x, Game.player.y);
    for (let i = 0; i < count; i++) {
      const a = angleToPlayer + Utils.rand(-1.2, 1.2);
      const r = Utils.rand(120, 220);
      const sx = center.x + Math.cos(a) * r;
      const sy = center.y + Math.sin(a) * r;
      const clamped = this.constrainCircle(sx, sy, 26, center.x, center.y);
      Enemies.spawn(Utils.choice(pool), clamped.x, clamped.y);
    }
    if (includeElite) {
      const elitePos = this.constrainCircle(center.x + Utils.rand(-90, 90), center.y + Utils.rand(-90, 90), 28, center.x, center.y);
      Enemies.spawn('elite_grunt', elitePos.x, elitePos.y);
    }
  },
  triggerGateEvent(door) {
    const idx = this.map.doors.indexOf(door);
    const waveSize = 3 + idx * 2;
    const tier = Math.min(this.sectorPools.length - 1, idx + 1);
    const elite = idx >= 1;
    this.spawnGateWave(door, waveSize, elite, tier);
    Game.cameraShake(8 + idx * 2, 0.2 + idx * 0.08);
    Game.announce('SECTOR BREACH: ' + (idx + 1) + '/4');
    this.sectorFlashTimer = 1.3;
    this.lastSectorLabel = 'SECTOR ' + (idx + 1) + ' UNLOCKED';
  },
  isOutsidePlayable(wx, wy, pad) {
    if (this.useTileRoom && this.map) {
      const p = pad || 0;
      const minX = this.map.originX - p;
      const minY = this.map.originY - p;
      const maxX = this.map.originX + this.map.w * this.map.tileSize + p;
      const maxY = this.map.originY + this.map.h * this.map.tileSize + p;
      return wx < minX || wy < minY || wx > maxX || wy > maxY;
    }
    return Math.hypot(wx, wy) > this.radius + (pad || 0);
  },
  collidesCircle(x, y, r) {
    const samples = [
      [x, y],
      [x + r, y],
      [x - r, y],
      [x, y + r],
      [x, y - r],
    ];
    for (const s of samples) {
      if (this.isWallAtWorld(s[0], s[1])) return true;
    }
    return false;
  },
  constrainCircle(x, y, r, prevX, prevY) {
    if (this.useTileRoom && this.map) {
      if (!this.collidesCircle(x, y, r)) return { x, y };
      if (!this.collidesCircle(x, prevY, r)) return { x, y: prevY };
      if (!this.collidesCircle(prevX, y, r)) return { x: prevX, y };
      return { x: prevX, y: prevY };
    }

    const d = Math.hypot(x, y);
    if (d > this.radius - r) {
      const a = Math.atan2(y, x);
      return { x: Math.cos(a) * (this.radius - r), y: Math.sin(a) * (this.radius - r) };
    }
    return { x, y };
  },
  reset() {
    this.time = 0; this.spawnTimer = 0; this.spawnInterval = 1.2;
    this.maxEnemies = 35; this.bossSpawned = false; this._eliteDone = false; this._lastSpike = 0;
    this.sectorFlashTimer = 0;
    this.lastSectorLabel = '';
    this.currentBiomeIdx = 0;
    this._lastBiomeIdx = 0;
    this.progressionEvalTimer = 0;
    if (this.useTileRoom) this.buildProgressiveRoom();
  },
  currentDifficulty() {
    // base scale × time-based creep × zone difficulty
    return this.zone.difficulty * (1 + this.time / 80);
  },
  update(dt) {
    this.time += dt;
    if (this.sectorFlashTimer > 0) this.sectorFlashTimer -= dt;
    this.progressionEvalTimer -= dt;
    if (this.progressionEvalTimer <= 0) {
      this.progressionEvalTimer = this.progressionEvalInterval;
      if (this.useTileRoom) this.updateProgressiveDoors();
      if (this.useTileRoom && TILE_ASSETS.biomes.length > 0) {
        this.currentBiomeIdx = Math.min(TILE_ASSETS.biomes.length - 1, Math.floor(this.time / this.biomeStepSec));
        if (this.currentBiomeIdx !== this._lastBiomeIdx) {
          this._lastBiomeIdx = this.currentBiomeIdx;
          Game.announce('BIOME SHIFT ' + (this.currentBiomeIdx + 1) + '/' + TILE_ASSETS.biomes.length);
        }
      }
    }

    // Ramp pacing toward consistent 10-15 min runs.
    var tier = this.getActiveSectorTier();
    var bp = this.getBalanceProfile();
    this.spawnInterval = Math.max(0.32, (1.25 - this.time * 0.0045 - tier * 0.03) / bp.enemyPressure);
    this.maxEnemies = Math.min(85, Math.floor((28 + Math.floor(this.time / 11) + tier * 3) * bp.enemyPressure));

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && Enemies.list.length < this.maxEnemies) {
      this.spawnTimer = this.spawnInterval;
      this.spawnWave();
    }

    // === DANGER SPIKES: every 60 seconds, surge of enemies + announce ===
    var minute = Math.floor(this.time / 60);
    if (minute > 0 && minute !== this._lastSpike) {
      this._lastSpike = minute;
      var surgeCount = Math.min(12, Math.floor((3 + minute) * bp.enemyPressure));
      var spikeTier = Math.min(this.sectorPools.length - 1, this.getActiveSectorTier() + 1);
      var spikePool = this.getEnemyPoolForTier(spikeTier);
      for (var si = 0; si < surgeCount; si++) {
        var pos = this.randomSpawnPoint();
        Enemies.spawn(Utils.choice(spikePool), pos.x, pos.y);
      }
      Game.announce('⚠  DANGER SPIKE — WAVE ' + minute);
      Game.cameraShake(10, 0.4);
      // === TASK 3: recurring elites every 2 minutes ===
      if (minute % 2 === 0) {
        for (var ei = 0; ei < 1 + minute; ei++) {
          var ep = this.randomSpawnPoint();
          Enemies.spawn('elite_grunt', ep.x, ep.y);
        }
        Game.announce('★ ELITE HUNTERS DEPLOYED');
      }
    }

    // first elite at threshold (legacy)
    if (this.time > this.zone.eliteAt && !this._eliteDone) {
      this._eliteDone = true;
      this.spawnEliteWave();
    }

    // boss
    if (this.time > this.zone.bossAt && !this.bossSpawned) {
      this.bossSpawned = true;
      this.spawnBoss();
    }
  },
  spawnWave() {
    const pool = this.getEnemyPoolForTier(this.getActiveSectorTier());
    const count = Utils.randInt(1, 3);
    for (let i = 0; i < count; i++) {
      const type = Utils.choice(pool);
      const pos = this.randomSpawnPoint();
      Enemies.spawn(type, pos.x, pos.y);
    }
  },
  spawnEliteWave() {
    for (let i = 0; i < 3; i++) {
      const pos = this.randomSpawnPoint();
      Enemies.spawn('elite_grunt', pos.x, pos.y);
    }
  },
  spawnBoss() {
    const pos = this.randomSpawnPoint();
    Enemies.spawn('boss_warden', pos.x, pos.y);
    Game.announce('⚠  THE WARDEN APPROACHES');
  },
  randomSpawnPoint() {
    const p = Game.player;
    // Spawn offscreen-ish relative to player
    const ang = Math.random() * Math.PI * 2;
    const dist = Utils.rand(420, 600);
    let x = p.x + Math.cos(ang) * dist;
    let y = p.y + Math.sin(ang) * dist;
    // Clamp to current world boundaries
    const clamped = this.constrainCircle(x, y, 40, p.x, p.y);
    x = clamped.x;
    y = clamped.y;
    return { x, y };
  },
  renderBackground(ctx, camX, camY) {
    if (this.useTileRoom && this.map) {
      const m = this.map;
      const left = camX - Game.width * 0.5;
      const top = camY - Game.height * 0.5;
      const right = camX + Game.width * 0.5;
      const bottom = camY + Game.height * 0.5;

      const minTx = Math.max(0, Math.floor((left - m.originX) / m.tileSize) - 1);
      const maxTx = Math.min(m.w - 1, Math.floor((right - m.originX) / m.tileSize) + 1);
      const minTy = Math.max(0, Math.floor((top - m.originY) / m.tileSize) - 1);
      const maxTy = Math.min(m.h - 1, Math.floor((bottom - m.originY) / m.tileSize) + 1);

      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, Game.width, Game.height);
      ctx.save();
      ctx.translate(-camX + Game.width / 2, -camY + Game.height / 2);

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const tile = m.tiles[ty][tx];
          const wx = m.originX + tx * m.tileSize;
          const wy = m.originY + ty * m.tileSize;
          if (this.tilesReady && this.biomeTilesets.length > 0) {
            const img = this.biomeTilesets[this.currentBiomeIdx] || this.biomeTilesets[0];
            const variants = tile === TILE_TYPES.WALL ? m.wallVariants : m.floorVariants;
            const variant = variants[(tx + ty) % variants.length];
            ctx.drawImage(img, variant.sx, variant.sy, variant.sw, variant.sh, wx, wy, m.tileSize, m.tileSize);
            if (tile === TILE_TYPES.DOOR) {
              const door = this.getDoorByTile(tx, ty);
              const locked = !!(door && !door.unlocked);
              ctx.fillStyle = locked ? 'rgba(251, 113, 133, 0.42)' : 'rgba(74, 222, 128, 0.28)';
              ctx.fillRect(wx + 3, wy + 3, m.tileSize - 6, m.tileSize - 6);
              ctx.strokeStyle = locked ? '#fb7185' : '#4ade80';
              ctx.globalAlpha = 0.9;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(wx + 3, wy + 3, m.tileSize - 6, m.tileSize - 6);
              ctx.globalAlpha = 1;
            }
          } else {
            if (tile === TILE_TYPES.WALL) ctx.fillStyle = '#334155';
            else if (tile === TILE_TYPES.DOOR) {
              const door = this.getDoorByTile(tx, ty);
              ctx.fillStyle = (door && !door.unlocked) ? '#7f1d1d' : '#14532d';
            } else ctx.fillStyle = '#1e293b';
            ctx.fillRect(wx, wy, m.tileSize, m.tileSize);
          }
        }
      }

      // Room frame for readability.
      ctx.strokeStyle = '#94a3b8';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.strokeRect(m.originX, m.originY, m.w * m.tileSize, m.h * m.tileSize);
      ctx.restore();
      return;
    }

    const bg = this.zone.bg;
    // Base
    ctx.fillStyle = bg.base;
    ctx.fillRect(0, 0, Game.width, Game.height);

    // Grid
    ctx.save();
    ctx.strokeStyle = bg.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = LOW_FX_MODE ? 0.25 : 0.4;
    const gs = 64;
    const ox = -((camX % gs) + gs) % gs;
    const oy = -((camY % gs) + gs) % gs;
    ctx.beginPath();
    for (let x = ox; x < Game.width; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, Game.height); }
    for (let y = oy; y < Game.height; y += gs) { ctx.moveTo(0, y); ctx.lineTo(Game.width, y); }
    ctx.stroke();
    ctx.restore();

    // Arena boundary (circle in world space)
    ctx.save();
    ctx.translate(-camX + Game.width/2, -camY + Game.height/2);
    ctx.strokeStyle = bg.fog;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.stroke();
    // faint inner glow
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.arc(0, 0, this.radius - 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
};

/* =====================================================================
 § 18. AUDIO (stub — expandable via WebAudio)
===================================================================== */
const AudioBus = {
  ctx: null,
  muted: false,
  _inited: false,
  init() {
    // Defer actual AudioContext creation to first user gesture (mobile requirement)
    const resume = () => {
      if (this._inited) return;
      this._inited = true;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
      window.removeEventListener('touchstart', resume);
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('touchstart', resume, { once: true });
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  },
  play(type) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this.ctx.destination);
    g.gain.value = 0.04;
    switch (type) {
      case 'shoot': o.type = 'square'; o.frequency.setValueAtTime(780, now); o.frequency.exponentialRampToValueAtTime(380, now + 0.06); break;
      case 'hit':   o.type = 'sawtooth'; o.frequency.setValueAtTime(320, now); o.frequency.exponentialRampToValueAtTime(120, now + 0.05); g.gain.value = 0.03; break;
      case 'kill':  o.type = 'sine'; o.frequency.setValueAtTime(600, now); o.frequency.exponentialRampToValueAtTime(200, now + 0.15); g.gain.value = 0.05; break;
      case 'levelup': o.type = 'sine'; o.frequency.setValueAtTime(440, now); o.frequency.exponentialRampToValueAtTime(880, now + 0.25); g.gain.value = 0.06; break;
      case 'pickup': o.type = 'sine'; o.frequency.setValueAtTime(1200, now); o.frequency.exponentialRampToValueAtTime(600, now + 0.08); g.gain.value = 0.025; break;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.start(now); o.stop(now + 0.13);
  },
};

/* =====================================================================
 § 19. UI MANAGER  (src/ui/hud.js  + menus.js)
===================================================================== */
const UI = {
  screens: ['mainMenu', 'classScreen', 'zoneScreen', 'metaScreen', 'codexScreen', 'gameOverScreen'],
  hudTickTimer: 0,
  hudTickInterval: 0.1,
  show(id) {
    for (const s of this.screens) Utils.el(`#${s}`).classList.add('hidden');
    Utils.el(`#${id}`).classList.remove('hidden');
  },
  hideAllScreens() { for (const s of this.screens) Utils.el(`#${s}`).classList.add('hidden'); },

  renderMainMenu() {
    Utils.el('#accountLvl').textContent = Game.save.accountLevel;
    Utils.el('#metaCredits').textContent = Game.save.credits;
    const best = Game.save.bestRun;
    Utils.el('#bestRun').textContent = best
      ? `Lv ${best.level} · ${best.kills} · ${Utils.formatTime(best.time)}`
      : '—';
    const perfBtn = Utils.el('#btnPerfMode');
    if (perfBtn) {
      const labels = { auto: 'AUTO', on: 'ON', off: 'OFF' };
      const mode = (Game.save && Game.save.perfMode) || 'auto';
      perfBtn.textContent = 'MOBILE PERF: ' + (labels[mode] || 'AUTO');
    }
    const perfHintEl = Utils.el('#perfHint');
    if (perfHintEl) {
      const mode = (Game.save && Game.save.perfMode) || 'auto';
      const perfHints = {
        auto: 'Mobile Perf Auto: detecta dispositivo y ajusta calidad automáticamente.',
        on: 'Mobile Perf On: prioriza estabilidad (menos FX y carga visual).',
        off: 'Mobile Perf Off: prioriza calidad visual (más carga de render).',
      };
      perfHintEl.textContent = perfHints[mode] || perfHints.auto;
    }
    const balBtn = Utils.el('#btnBalanceMode');
    if (balBtn) {
      const mode = (Game.save && Game.save.balancePreset) || 'standard';
      balBtn.textContent = 'BALANCE: ' + mode.toUpperCase();
    }
    const hintEl = Utils.el('#balanceHint');
    if (hintEl) {
      const mode = (Game.save && Game.save.balancePreset) || 'standard';
      const hints = {
        arcade: 'Arcade: menos presión, runs más relajadas y accesibles.',
        standard: 'Standard: ritmo equilibrado para runs consistentes.',
        hardcore: 'Hardcore: más presión enemiga y extracción más exigente.',
      };
      hintEl.textContent = hints[mode] || hints.standard;
    }
  },

  renderClassScreen() {
    const grid = Utils.el('#classGrid');
    grid.innerHTML = '';
    for (const [id, cls] of Object.entries(CLASSES)) {
      const unlocked = Game.save.unlockedClasses.includes(id);
      const selected = Game.save.selectedClass === id;
      const card = document.createElement('div');
      card.className = `class-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`;
      card.innerHTML = `
        <div class="class-icon">${cls.icon}</div>
        <div class="class-name">${cls.name}</div>
        <div class="class-role">${cls.role}</div>
        <div class="class-desc">${cls.desc}</div>
        <div class="class-perk">${cls.perk}</div>
        ${!unlocked && cls.unlockCost ? `<div class="class-perk" style="color:var(--gold)">Unlock: ${cls.unlockCost} ★</div>` : ''}
      `;
      card.onclick = () => {
        if (!unlocked) {
          if (cls.unlockCost && Game.save.credits >= cls.unlockCost) {
            Game.save.credits -= cls.unlockCost;
            Game.save.unlockedClasses.push(id);
            SaveSystem.save(Game.save);
            this.renderClassScreen();
            this.renderMainMenu();
          }
          return;
        }
        Game.save.selectedClass = id;
        SaveSystem.save(Game.save);
        this.renderClassScreen();
      };
      grid.appendChild(card);
    }
  },

  renderZoneScreen() {
    const grid = Utils.el('#zoneGrid');
    grid.innerHTML = '';
    for (const [id, zone] of Object.entries(ZONES)) {
      const unlocked = Game.save.unlockedZones.includes(id) || !zone.locked;
      const selected = Game.save.selectedZone === id;
      const card = document.createElement('div');
      card.className = `zone-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`;
      card.innerHTML = `
        <div class="zone-icon" style="color:${zone.bg.fog}">${zone.icon}</div>
        <div class="zone-info">
          <div class="zone-name">${zone.name}</div>
          <div class="zone-tier">${zone.tier} · DIFF ×${zone.difficulty.toFixed(1)}</div>
          <div class="zone-desc">${zone.desc}</div>
          ${!unlocked ? `<div class="zone-desc" style="color:var(--warn)">${zone.unlockReq}</div>` : ''}
        </div>
      `;
      card.onclick = () => {
        if (!unlocked) return;
        Game.save.selectedZone = id;
        SaveSystem.save(Game.save);
        this.renderZoneScreen();
      };
      grid.appendChild(card);
    }
  },

  renderMetaScreen() {
    Utils.el('#metaCredits2').textContent = Game.save.credits;
    const grid = Utils.el('#metaGrid');
    grid.innerHTML = '';
    for (const mu of META_UPGRADES) {
      const rank = Game.save.metaUpgrades[mu.id] || 0;
      const maxed = rank >= mu.max;
      const cost = maxed ? 0 : mu.cost(rank);
      const canAfford = Game.save.credits >= cost;
      const node = document.createElement('div');
      node.className = `meta-node ${maxed ? 'maxed' : ''} ${!canAfford && !maxed ? 'cannot' : ''}`;
      node.innerHTML = `
        <div class="meta-node-name">${mu.icon} ${mu.name}</div>
        <div class="meta-node-desc">${mu.desc}</div>
        <div class="meta-node-rank">
          <span>${rank}/${mu.max}</span>
          <span class="meta-node-cost">${maxed ? 'MAX' : cost + ' ★'}</span>
        </div>
      `;
      node.onclick = () => {
        if (maxed || !canAfford) return;
        Game.save.credits -= cost;
        Game.save.metaUpgrades[mu.id] = rank + 1;
        SaveSystem.save(Game.save);
        this.renderMetaScreen();
      };
      grid.appendChild(node);
    }
  },

  renderCodex(tab = 'enemies') {
    const body = Utils.el('#codexBody');
    body.innerHTML = '';
    Utils.els('.tab').forEach(t => t.classList.toggle('active', t.dataset.codex === tab));
    const data = tab === 'enemies' ? ENEMIES : tab === 'weapons' ? WEAPONS : null;
    if (!data) {
      body.innerHTML = '<div class="codex-entry"><div class="codex-entry-name">Loot codex coming soon</div></div>';
      return;
    }
    const discovered = tab === 'enemies' ? Game.save.codex.enemies : Game.save.codex.weapons;
    for (const [id, item] of Object.entries(data)) {
      const known = tab === 'enemies' ? (discovered[id] > 0) : true;
      const entry = document.createElement('div');
      entry.className = `codex-entry ${known ? '' : 'unknown'}`;
      entry.innerHTML = `
        <div class="codex-entry-name">${known ? item.name : '??????'}</div>
        <div class="codex-entry-sub">${known ? (item.archetype || item.type || '').toUpperCase() : 'UNDISCOVERED'}</div>
        ${known && item.hp ? `<div class="codex-entry-sub">HP ${item.hp} · DMG ${item.damage} · XP ${item.xp}</div>` : ''}
        ${known && tab === 'enemies' && discovered[id] ? `<div class="codex-entry-sub">Killed ×${discovered[id]}</div>` : ''}
      `;
      body.appendChild(entry);
    }
  },

  updateHUD(dt) {
    this.hudTickTimer -= (dt || 0);
    if (this.hudTickTimer > 0) return;
    this.hudTickTimer = this.hudTickInterval;
    const p = Game.player;
    Utils.el('#hpFill').style.width = `${(p.hp / p.stats.maxHP) * 100}%`;
    Utils.el('#hpText').textContent = `${Math.ceil(p.hp)} / ${Math.floor(p.stats.maxHP)}`;
    const xpNeeded = p.xpForNextLevel();
    Utils.el('#xpFill').style.width = `${(p.xp / xpNeeded) * 100}%`;
    Utils.el('#xpText').textContent = `${Math.floor(p.xp)} / ${xpNeeded}`;
    Utils.el('#lvlText').textContent = p.level;
    Utils.el('#creditsText').textContent = Math.floor(Game.runCredits);
    Utils.el('#timeText').textContent = Utils.formatTime(World.time);
    Utils.el('#classTag').textContent = p.cls.name;
    Utils.el('#zoneTag').textContent = `${World.zone.tier} — ${World.zone.name.toUpperCase()}`;
    Utils.el('#weaponIcon').textContent = p.weapon.icon;
    Utils.el('#weaponName').textContent = p.weapon.name;
    Utils.el('#weaponSub').textContent = `${p.weapon.type[0].toUpperCase()}${p.weapon.type.slice(1)} · ${p.weapon.rarity[0].toUpperCase()}${p.weapon.rarity.slice(1)}`;
    Utils.el('#killText').textContent = p.kills;
    // === EXTRACTION HUD ===
    var exHud = Utils.el('#extractHud');
    if (ExtractionZone.active) {
      exHud.classList.remove('hidden');
      exHud.classList.toggle('active', Utils.dist(p.x, p.y, ExtractionZone.x, ExtractionZone.y) < ExtractionZone.radius);
      var exDist = Math.floor(Utils.dist(p.x, p.y, ExtractionZone.x, ExtractionZone.y));
      Utils.el('#extractDist').textContent = exDist + 'm';
      var threatEl = Utils.el('#extractThreat');
      if (threatEl) {
        var label = ExtractionZone.pressureLevel >= 3 ? 'THREAT: CRITICAL' : (ExtractionZone.pressureLevel >= 2 ? 'THREAT: HIGH' : 'THREAT: LOW');
        threatEl.textContent = label;
        threatEl.style.color = ExtractionZone.pressureLevel >= 3 ? '#fb7185' : (ExtractionZone.pressureLevel >= 2 ? '#fbbf24' : '#4ade80');
      }
    } else {
      exHud.classList.add('hidden');
    }
    Utils.el('#invCountHud').textContent = RunInventory.items.length;
    var tier = Math.min(5, 1 + Math.floor(World.time / 60));
    Utils.el('#lootTierHud').textContent = 'TIER ' + tier;
  },

  showLevelUpModal(choices) {
    const modal = Utils.el('#lvlUpModal');
    const body = Utils.el('#upgradeChoices');
    body.innerHTML = '';
    for (const up of choices) {
      const btn = document.createElement('button');
      btn.className = 'upgrade';
      var tagsHtml = '';
      if (up.tags && up.tags.length > 0) {
        tagsHtml = '<div class="upgrade-tags">' + up.tags.map(function(t) { return '<span class="tag">' + t + '</span>'; }).join('') + '</div>';
      }
      btn.innerHTML = `
        <div class="upgrade-icon">${up.icon}</div>
        <div class="upgrade-body">
          <div class="upgrade-name">${up.name}</div>
          <div class="upgrade-desc">${up.desc}</div>
          <div class="upgrade-rarity" style="color:${RARITY[up.rarity].color}">${up.rarity.toUpperCase()}</div>
          ${tagsHtml}
        </div>
      `;
      btn.onclick = () => {
        up.apply(Game.player);
        Game.player.takenUpgradeIds.push(up.id);
        modal.classList.add('hidden');
        Game.paused = false;
      };
      body.appendChild(btn);
    }
    modal.classList.remove('hidden');
    Game.paused = true;
  },

  showPauseMenu() {
    const p = Game.player;
    const stats = Utils.el('#pauseStats');
    stats.innerHTML = `
      <div class="pause-stat"><div class="lbl">LEVEL</div><div class="val">${p.level}</div></div>
      <div class="pause-stat"><div class="lbl">KILLS</div><div class="val">${p.kills}</div></div>
      <div class="pause-stat"><div class="lbl">DAMAGE</div><div class="val">${Math.floor(p.damageDealt)}</div></div>
      <div class="pause-stat"><div class="lbl">TIME</div><div class="val">${Utils.formatTime(World.time)}</div></div>
      <div class="pause-stat"><div class="lbl">DMG/S</div><div class="val">${Math.floor(p.damageDealt / Math.max(1, World.time))}</div></div>
      <div class="pause-stat"><div class="lbl">CREDITS</div><div class="val">${Math.floor(Game.runCredits)}</div></div>
    `;
    Utils.el('#pauseMenu').classList.remove('hidden');
  },
  hidePauseMenu() { Utils.el('#pauseMenu').classList.add('hidden'); },

  showGameOver(outcome, earned, lootValue, lootItems) {
    var p = Game.player;
    var extracted = (outcome === 'extracted');
    var titleEl = Utils.el('#gameOverTitle');
    titleEl.textContent = extracted ? 'EXTRACTED' : 'YOU FELL';
    titleEl.className = 'death-title' + (extracted ? ' extracted' : '');
    var lootHtml = '';
    if (extracted && lootItems && lootItems.length > 0) {
      lootHtml = '<div class="summary-row" style="grid-column:1/-1"><div class="lbl">LOOT BANKED</div><div class="val" style="color:#4ade80">';
      for (var li = 0; li < lootItems.length; li++) {
        lootHtml += lootItems[li].icon + ' ';
      }
      lootHtml += '</div></div>';
    }
    var lostHtml = !extracted ? '<div class="summary-row" style="grid-column:1/-1"><div class="lbl" style="color:#ff4d6d">LOOT LOST</div><div class="val" style="color:#ff4d6d">ALL</div></div>' : '';
    Utils.el('#gameOverSummary').innerHTML =
      '<div class="summary-row"><div class="lbl">LEVEL</div><div class="val">' + p.level + '</div></div>' +
      '<div class="summary-row"><div class="lbl">KILLS</div><div class="val">' + p.kills + '</div></div>' +
      '<div class="summary-row"><div class="lbl">SURVIVED</div><div class="val">' + Utils.formatTime(World.time) + '</div></div>' +
      '<div class="summary-row"><div class="lbl">CREDITS</div><div class="val">+' + earned + ' ★</div></div>' +
      (lootValue > 0 ? '<div class="summary-row"><div class="lbl">LOOT VALUE</div><div class="val" style="color:#4ade80">+' + lootValue + '</div></div>' : '') +
      lootHtml + lostHtml;
    this.show('gameOverScreen');
    Utils.el('#hud').classList.add('hidden');
  },

  // === INVENTORY UI ===
  showInventory: function() {
    var grid = Utils.el('#invGrid');
    grid.innerHTML = '';
    for (var i = 0; i < RunInventory.maxSlots; i++) {
      var item = RunInventory.items[i];
      var slot = document.createElement('div');
      slot.className = 'inv-slot' + (item ? '' : ' inv-slot-empty');
      if (item) {
        slot.innerHTML = '<div class="inv-slot-name" style="color:' + (RARITY[item.rarity] ? RARITY[item.rarity].color : '#9ab0c7') + '">' + item.icon + ' ' + item.name + '</div>' +
          '<div class="inv-slot-sub">' + item.rarity.toUpperCase() + ' · ' + item.value + '★</div>' +
          '<div class="inv-slot-stats">' + item.desc + '</div>';
      } else {
        slot.innerHTML = '<div class="inv-slot-sub">EMPTY</div>';
      }
      grid.appendChild(slot);
    }
    Utils.el('#invSlotCount').textContent = RunInventory.items.length + '/' + RunInventory.maxSlots;
    Utils.el('#inventoryModal').classList.remove('hidden');
    Game.paused = true;
  },

  hideInventory: function() {
    Utils.el('#inventoryModal').classList.add('hidden');
    Game.paused = false;
  },

  // === LOOT CHOICE (when backpack full) ===
  showLootChoice: function(newItem) {
    Game.paused = true;
    var newEl = Utils.el('#lootNew');
    newEl.innerHTML = '<div class="inv-slot-name" style="color:' + (RARITY[newItem.rarity] ? RARITY[newItem.rarity].color : '#9ab0c7') + '">' + newItem.icon + ' ' + newItem.name + '</div>' +
      '<div class="inv-slot-sub">' + newItem.rarity.toUpperCase() + ' · ' + newItem.value + '★</div>' +
      '<div class="inv-slot-stats">' + newItem.desc + '</div>';

    var grid = Utils.el('#lootInvGrid');
    grid.innerHTML = '';
    RunInventory._selectedSwapIdx = -1;
    for (var i = 0; i < RunInventory.items.length; i++) {
      (function(idx) {
        var item = RunInventory.items[idx];
        var slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.innerHTML = '<div class="inv-slot-name" style="color:' + (RARITY[item.rarity] ? RARITY[item.rarity].color : '#9ab0c7') + '">' + item.icon + ' ' + item.name + '</div>' +
          '<div class="inv-slot-sub">' + item.value + '★</div>';
        slot.onclick = function() {
          // Deselect all
          var slots = grid.querySelectorAll('.inv-slot');
          for (var j = 0; j < slots.length; j++) slots[j].classList.remove('selected');
          slot.classList.add('selected');
          RunInventory._selectedSwapIdx = idx;
        };
        grid.appendChild(slot);
      })(i);
    }
    Utils.el('#lootChoiceModal').classList.remove('hidden');
  },

  hideLootChoice: function() {
    Utils.el('#lootChoiceModal').classList.add('hidden');
    RunInventory._pendingLoot = null;
    Game.paused = false;
  },

  announceQueue: [],
  announceEl: null,
  announce(text) {
    // Simple transient overlay — canvas-drawn
    Game.announceText = text;
    Game.announceTime = 3;
  },
};

/* =====================================================================
 § 19b. EXTRACTION ZONE  (src/systems/extraction.js)
   Appears after a delay. Player must stand inside to extract.
===================================================================== */
var ExtractionZone = {
  x: 0, y: 0,
  radius: 60,
  active: false,
  standTimer: 0,
  pressureLevel: 0,
  _lastPressureLevel: 0,
  standRequired: 4,   // seconds standing in zone to extract
  spawnTime: 45,       // seconds into run before extraction appears
  relocateInterval: 90, // moves every N seconds after first spawn
  _lastRelocate: 0,
  _relocateCheckTimer: 0,

  reset: function() {
    this.active = false;
    this.standTimer = 0;
    this.pressureLevel = 0;
    this._lastPressureLevel = 0;
    this._lastRelocate = 0;
    this._relocateCheckTimer = 0;
  },

  update: function(dt) {
    // Spawn extraction after delay
    if (!this.active && World.time >= this.spawnTime) {
      this.activate();
      Game.announce('◈ EXTRACTION ZONE AVAILABLE');
    }
    if (!this.active) return;

    // Relocate periodically to force movement (checked at low frequency).
    this._relocateCheckTimer -= dt;
    if (this._relocateCheckTimer <= 0) {
      this._relocateCheckTimer = 0.2;
      var minutesSinceSpawn = Math.floor((World.time - this.spawnTime) / this.relocateInterval);
      if (minutesSinceSpawn > this._lastRelocate) {
        this._lastRelocate = minutesSinceSpawn;
        this.relocate();
        Game.announce('◈ EXTRACTION MOVED');
      }
    }

    // Check if player is inside
    var p = Game.player;
    var d2 = Utils.dist2(p.x, p.y, this.x, this.y);
    if (d2 < this.radius * this.radius) {
      // === TASK 2: damage resets timer (checked via player.damageTaken changing) ===
      if (this._lastHP === undefined) this._lastHP = p.hp;
      if (p.hp < this._lastHP) {
        this.standTimer = Math.max(0, this.standTimer - 1.5); // damage knocks back 1.5s of progress
        Game.announce('EXTRACTION INTERRUPTED');
      }
      this._lastHP = p.hp;

      this.standTimer += dt;
      if (this.standTimer >= this.standRequired) {
        Game.onExtraction();
      }
      // Extraction pressure scales with commitment + sector tier.
      var capturePct = Utils.clamp(this.standTimer / this.standRequired, 0, 1);
      var sectorTier = World.getActiveSectorTier ? World.getActiveSectorTier() : 0;
      var pressureMul = (World.getBalanceProfile ? World.getBalanceProfile().extractionPressure : 1);
      var spawnInterval = Math.max(0.7, (1.4 - capturePct * 0.5 - sectorTier * 0.06) / pressureMul);
      var spawnCountBase = (capturePct < 0.35 ? 1 : 2) + Math.floor(sectorTier / 2) + (capturePct > 0.65 ? 1 : 0);
      var spawnCount = Math.max(1, Math.floor(spawnCountBase * pressureMul));
      var pressureScore = capturePct + sectorTier * 0.25 + (pressureMul - 1) * 0.5;
      this.pressureLevel = pressureScore >= 1.5 ? 3 : (pressureScore >= 1.0 ? 2 : (pressureScore >= 0.6 ? 1 : 0));
      if (this.pressureLevel > this._lastPressureLevel && this.pressureLevel >= 2) {
        AudioBus.play('hit');
        Game.announce(this.pressureLevel >= 3 ? 'EXTRACTION THREAT: CRITICAL' : 'EXTRACTION THREAT: HIGH');
      }
      this._lastPressureLevel = this.pressureLevel;
      this._extractSpawnTimer = (this._extractSpawnTimer || 0) - dt;
      if (this._extractSpawnTimer <= 0) {
        this._extractSpawnTimer = spawnInterval;
        for (var es = 0; es < spawnCount; es++) {
          var epos = World.randomSpawnPoint();
          Enemies.spawn(Utils.choice(['stalker', 'grunt', 'sniper', 'bomber']), epos.x, epos.y);
        }
      }
    } else {
      this.standTimer = Math.max(0, this.standTimer - dt * 2);
      this._lastHP = p.hp;
      this._extractSpawnTimer = 0;
      this.pressureLevel = Math.max(0, this.pressureLevel - 1);
      this._lastPressureLevel = this.pressureLevel;
    }
  },

  activate: function() {
    this.active = true;
    this.relocate();
  },

  relocate: function() {
    // Place extraction zone away from player
    var ang = Math.random() * Math.PI * 2;
    var dist = Utils.rand(300, 600);
    this.x = Game.player.x + Math.cos(ang) * dist;
    this.y = Game.player.y + Math.sin(ang) * dist;
    // Clamp inside current world boundaries
    var clamped = World.constrainCircle(this.x, this.y, this.radius + 20, Game.player.x, Game.player.y);
    this.x = clamped.x;
    this.y = clamped.y;
    this.standTimer = 0;
  },

  render: function(ctx) {
    if (!this.active) return;
    var p = Game.player;
    var d2 = Utils.dist2(p.x, p.y, this.x, this.y);
    var inZone = d2 < this.radius * this.radius;
    var pulse = 1 + Math.sin(Game.time * 3) * 0.08;

    // Outer glow
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2); ctx.fill();

    // Zone ring with pressure color cue.
    ctx.globalAlpha = inZone ? 0.7 : 0.35;
    var ringColor = this.pressureLevel >= 3 ? '#fb7185' : (this.pressureLevel >= 2 ? '#fbbf24' : '#4ade80');
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = inZone ? 3 : 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2); ctx.stroke();

    // Fill when standing in it
    if (inZone) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();

      // Progress arc
      var pct = this.standTimer / this.standRequired;
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.7, -Math.PI/2, -Math.PI/2 + pct * Math.PI * 2);
      ctx.stroke();
    }

    // Label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXTRACT', this.x, this.y - this.radius - 8);
    if (inZone) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(Math.ceil(this.standRequired - this.standTimer) + 's', this.x, this.y + 4);
      if (this.pressureLevel >= 2) {
        ctx.fillStyle = this.pressureLevel >= 3 ? '#fb7185' : '#fbbf24';
        ctx.fillText(this.pressureLevel >= 3 ? 'CRITICAL' : 'HIGH THREAT', this.x, this.y + 20);
      }
    }

    ctx.restore();

    // Off-screen indicator arrow (when zone is far away)
    // This is drawn in screen space in Game.render
  },
};

/* =====================================================================
 § 19c. RUN INVENTORY  (src/systems/inventory.js)
   Small backpack for extraction loot. Lost on death, banked on extract.
===================================================================== */
var LOOT_TABLE = [
  { id: 'scrap',     name: 'Scrap Metal',   icon: '⬡', rarity: 'common',   value: 5,  weight: 40, desc: 'Basic crafting material' },
  { id: 'circuits',  name: 'Circuit Board', icon: '⬢', rarity: 'uncommon', value: 15, weight: 25, desc: 'Used in tech upgrades' },
  { id: 'core',      name: 'Energy Core',   icon: '◆', rarity: 'rare',     value: 40, weight: 10, desc: 'Rare power source' },
  { id: 'data',      name: 'Data Shard',    icon: '◇', rarity: 'rare',     value: 30, weight: 12, desc: 'Contains encrypted intel' },
  { id: 'nanites',   name: 'Nanite Vial',   icon: '✧', rarity: 'epic',     value: 80, weight: 3,  desc: 'Self-repairing nanotech' },
  { id: 'artifact',  name: 'Void Artifact', icon: '✦', rarity: 'legendary',value: 200,weight: 1,  desc: 'Unknown origin. Immense value' },
  // Consumables
  { id: 'medkit',    name: 'Field Medkit',  icon: '✚', rarity: 'uncommon', value: 10, weight: 15, desc: 'Heal 40 HP on pickup', consumable: true,
    use: function(p) { p.heal(40); } },
  { id: 'stim',      name: 'Stim Pack',     icon: '⟫', rarity: 'uncommon', value: 10, weight: 10, desc: '+20% speed for 15s', consumable: true,
    use: function(p) { p.stats.moveSpeed *= 1.2; } },
];

var RunInventory = {
  items: [],
  maxSlots: 6,
  _pendingLoot: null,
  _selectedSwapIdx: -1,

  reset: function() {
    this.items = [];
    this._pendingLoot = null;
    this._selectedSwapIdx = -1;
  },

  isFull: function() { return this.items.length >= this.maxSlots; },

  tryAdd: function(lootItem) {
    // Consumables auto-use if they have a use function
    if (lootItem.consumable && lootItem.use) {
      lootItem.use(Game.player);
      Game.announce('+ USED ' + lootItem.name.toUpperCase());
      AudioBus.play('pickup');
      return true;
    }
    if (!this.isFull()) {
      this.items.push(lootItem);
      Game.announce('+ ' + lootItem.name.toUpperCase());
      AudioBus.play('pickup');
      return true;
    }
    // Inventory full — show choice modal
    this._pendingLoot = lootItem;
    this._selectedSwapIdx = -1;
    UI.showLootChoice(lootItem);
    return false;
  },

  removeAt: function(idx) {
    if (idx >= 0 && idx < this.items.length) {
      this.items.splice(idx, 1);
    }
  },

  totalValue: function() {
    var v = 0;
    for (var i = 0; i < this.items.length; i++) v += this.items[i].value;
    return v;
  },

  rollLoot: function(tierBonus) {
    tierBonus = tierBonus || 0;
    // Higher tiers bias toward rarer loot
    var adjusted = LOOT_TABLE.map(function(it) {
      var w = it.weight;
      if (tierBonus > 0 && (it.rarity === 'rare' || it.rarity === 'epic' || it.rarity === 'legendary')) {
        w *= (1 + tierBonus * 0.5);
      }
      return { item: it, weight: w };
    });
    var pick = Utils.weighted(adjusted);
    // Return a copy
    return { id: pick.item.id, name: pick.item.name, icon: pick.item.icon, rarity: pick.item.rarity,
             value: pick.item.value, desc: pick.item.desc, consumable: pick.item.consumable, use: pick.item.use };
  },
};

/* =====================================================================
 § 20. GAME CORE  (src/core/game.js)
===================================================================== */
const Game = {
  canvas: null,
  ctx: null,
  width: 0, height: 0,
  player: null,
  save: null,
  running: false,
  paused: false,
  time: 0,
  lastFrame: 0,
  accumulator: 0,
  runCredits: 0,
  camX: 0, camY: 0,
  shakeAmt: 0, shakeTime: 0,
  announceText: '', announceTime: 0,
  runItems: [],  // collected but not equipped
  showPerfOverlay: true,
  frameMsEma: 16.7,
  fpsEma: 60,
  perfGovernorTimer: 0,
  perfGovernorLowMs: 17.0,
  perfGovernorHighMs: 22.0,
  perfGovernorState: 'normal',
  mobileMode: false,
  balancePreset: 'standard',

  init() {
    this.canvas = Utils.el('#game');
    this.ctx = this.canvas.getContext('2d');
    this.save = SaveSystem.load();
    this.balancePreset = this.save.balancePreset || 'standard';
    this.applyDevicePreset();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init();
    AudioBus.init();
    World.initTileAssets();

    this.bindMenus();
    UI.show('mainMenu');
    UI.renderMainMenu();

    // Pre-render idle loop so the canvas is never blank behind menus
    this.idleLoop();
  },
  applyDevicePreset() {
    var ua = navigator.userAgent || '';
    var touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.mobileMode = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touchCapable && Math.min(window.innerWidth, window.innerHeight) < 900);
    var mode = (this.save && this.save.perfMode) || 'auto';
    var useMobilePreset = mode === 'on' || (mode === 'auto' && this.mobileMode);

    // Baseline defaults.
    LOW_FX_MODE = false;
    this.showPerfOverlay = true;
    UI.hudTickInterval = 0.1;
    VFX.maxParticles = 900;
    VFX.maxNumbers = 90;
    VFX.maxRings = 80;

    if (!useMobilePreset) return;

    // Mobile-first defaults: start stable, then governor can recover quality if possible.
    LOW_FX_MODE = true;
    this.showPerfOverlay = false;
    UI.hudTickInterval = 0.16;
    VFX.maxParticles = 320;
    VFX.maxNumbers = 60;
    VFX.maxRings = 60;
  },
  cyclePerfMode() {
    const order = ['auto', 'on', 'off'];
    const current = (this.save && this.save.perfMode) || 'auto';
    const idx = order.indexOf(current);
    const next = order[(idx + 1 + order.length) % order.length];
    this.save.perfMode = next;
    SaveSystem.save(this.save);
    this.applyDevicePreset();
    this.resize();
    UI.renderMainMenu();
    this.announce('MOBILE PERF: ' + next.toUpperCase());
  },
  resize() {
    const dprCap = this.mobileMode ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  bindMenus() {
    Utils.el('#btnStart').onclick = () => this.startRun();
    Utils.el('#btnClass').onclick = () => { UI.show('classScreen'); UI.renderClassScreen(); };
    Utils.el('#btnZone').onclick  = () => { UI.show('zoneScreen');  UI.renderZoneScreen(); };
    Utils.el('#btnMeta').onclick  = () => { UI.show('metaScreen');  UI.renderMetaScreen(); };
    Utils.el('#btnCodex').onclick = () => { UI.show('codexScreen'); UI.renderCodex('enemies'); };
    const perfBtn = Utils.el('#btnPerfMode');
    if (perfBtn) perfBtn.onclick = () => this.cyclePerfMode();
    const balBtn = Utils.el('#btnBalanceMode');
    if (balBtn) balBtn.onclick = () => this.cycleBalancePreset();
    Utils.el('#btnReset').onclick = () => {
      if (confirm('Reset all progress? This cannot be undone.')) {
        SaveSystem.reset();
        this.save = SaveSystem.load();
        UI.renderMainMenu();
      }
    };
    for (const btn of Utils.els('.back-btn')) {
      btn.onclick = () => { UI.show(btn.dataset.back); UI.renderMainMenu(); };
    }
    for (const tab of Utils.els('.tab')) {
      tab.onclick = () => UI.renderCodex(tab.dataset.codex);
    }
    Utils.el('#pauseBtn').onclick = () => this.togglePause();
    Utils.el('#btnResume').onclick = () => this.togglePause();
    Utils.el('#btnAbandon').onclick = () => { UI.hidePauseMenu(); this.endRun('abandoned'); };
    Utils.el('#btnRetry').onclick = () => this.startRun();
    Utils.el('#btnToMenu').onclick = () => { UI.show('mainMenu'); UI.renderMainMenu(); this.idleLoop(); };
    // === EXTRACTION LOOP: inventory + loot choice bindings ===
    Utils.el('#btnInvOpen').onclick = function() { UI.showInventory(); };
    Utils.el('#btnCloseInv').onclick = function() { UI.hideInventory(); };
    Utils.el('#btnDropLoot').onclick = function() { UI.hideLootChoice(); };
    Utils.el('#btnSwapLoot').onclick = function() {
      if (RunInventory._selectedSwapIdx >= 0 && RunInventory._pendingLoot) {
        RunInventory.items[RunInventory._selectedSwapIdx] = RunInventory._pendingLoot;
      }
      UI.hideLootChoice();
    };
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.running) this.togglePause();
      if (e.key === 'F3') {
        this.showPerfOverlay = !this.showPerfOverlay;
        e.preventDefault();
      }
      if (e.key === 'F4') {
        this.cycleBalancePreset();
        e.preventDefault();
      }
    });
  },
  cycleBalancePreset() {
    var order = ['arcade', 'standard', 'hardcore'];
    var idx = order.indexOf(this.balancePreset);
    this.balancePreset = order[(idx + 1 + order.length) % order.length];
    this.save.balancePreset = this.balancePreset;
    SaveSystem.save(this.save);
    UI.renderMainMenu();
    this.announce('BALANCE: ' + this.balancePreset.toUpperCase());
  },

  /* ---------------- Meta helpers ---------------- */
  metaMultiplier(key) {
    let mult = 1;
    for (const mu of META_UPGRADES) {
      if (!mu[key]) continue;
      const rank = this.save.metaUpgrades[mu.id] || 0;
      if (rank > 0) mult *= mu[key](rank);
    }
    return mult;
  },

  /* ---------------- Run lifecycle ---------------- */
  startRun() {
    this.running = true;
    this.paused = false;
    this.time = 0;
    this.runCredits = 0;
    this.runItems = [];
    this.camX = 0; this.camY = 0;
    this.announceText = ''; this.announceTime = 0;
    this.frameMsEma = 16.7;
    this.fpsEma = 60;
    this.perfGovernorTimer = 0;
    this.perfGovernorState = LOW_FX_MODE ? 'degraded' : 'normal';

    World.setZone(this.save.selectedZone);
    World.reset();
    ExtractionZone.reset();
    RunInventory.reset();
    Enemies.clear(); Projectiles.clear(); Pickups.clear(); VFX.clear();

    this.player = new Player(this.save.selectedClass, this.save);

    Input.setGameActive(true);
    UI.hideAllScreens();
    UI.hudTickTimer = 0;
    Utils.el('#hud').classList.remove('hidden');
    UI.announce(`${World.zone.tier} — ${World.zone.name.toUpperCase()}`);

    this.lastFrame = performance.now();
    requestAnimationFrame(t => this.loop(t));
  },

  endRun(outcome) {
    this.running = false;
    this.paused = false;
    Input.setGameActive(false);
    Input.reset();
    UI.hidePauseMenu();

    var extracted = (outcome === 'extracted');
    var lootValue = extracted ? RunInventory.totalValue() : 0;
    var creditMult = extracted ? 1.0 : 0.2;
    var earned = Math.floor(this.runCredits * creditMult) + lootValue;
    this.save.credits += earned;

    var accountXPGain = Math.floor(this.player.kills * 0.5 + World.time * 0.2);
    this.save.accountXP += accountXPGain;
    var xpForLvl = function(lvl) { return 50 * Math.pow(1.3, lvl - 1); };
    while (this.save.accountXP >= xpForLvl(this.save.accountLevel)) {
      this.save.accountXP -= xpForLvl(this.save.accountLevel);
      this.save.accountLevel += 1;
    }
    if (this.save.accountLevel >= 3 && this.save.unlockedZones.indexOf('nexus') === -1) {
      this.save.unlockedZones.push('nexus');
    }
    var best = this.save.bestRun;
    var candidate = { kills: this.player.kills, level: this.player.level, time: World.time, zone: World.zone.id };
    if (!best || candidate.kills > best.kills) this.save.bestRun = candidate;

    SaveSystem.save(this.save);
    UI.showGameOver(outcome, earned, lootValue, RunInventory.items);
  },

  onPlayerDeath() { if (this.running) this.endRun('died'); },

  onExtraction: function() {
    if (!this.running) return;
    this.triggerSlowMo(0.8, 0.2);
    VFX.burst(Game.player.x, Game.player.y, '#4ade80', 40, 200);
    Game.cameraShake(12, 0.4);
    this.endRun('extracted');
  },
  onBossKilled(boss) {
    UI.announce(`★ ${boss.def.name.toUpperCase()} DEFEATED ★`);
    // drop a guaranteed rare+
    Pickups.spawnItem(boss.x, boss.y);
    Pickups.spawnItem(boss.x, boss.y);
    Pickups.spawnCredits(boss.x, boss.y, 50);
  },

  onLevelUp() {
    AudioBus.play('levelup');
    // === TASK 7: slow-mo on level up ===
    this.triggerSlowMo(0.4, 0.25);

    var p = this.player;

    // Build a filtered pool — remove uniques already taken
    var filtered = UPGRADES.filter(function(u) {
      if (!u.unique) return true;
      // Check if this unique was already taken this run
      return p.takenUpgradeIds.indexOf(u.id) === -1;
    });

    // === TASK 4: synergy weighting ===
    // Find tags the player has already invested in
    var tagCounts = {};
    for (var ti = 0; ti < p.takenUpgradeIds.length; ti++) {
      var taken = UPGRADES.find(function(u) { return u.id === p.takenUpgradeIds[ti]; });
      if (taken && taken.tags) {
        for (var tgi = 0; tgi < taken.tags.length; tgi++) {
          tagCounts[taken.tags[tgi]] = (tagCounts[taken.tags[tgi]] || 0) + 1;
        }
      }
    }

    var choices = [];
    for (var ci = 0; ci < 3; ci++) {
      var bag = filtered.map(function(u) {
        var baseWeight = RARITY[u.rarity].weight;
        // Boost weight if this upgrade shares tags with player's build
        var synBonus = 1;
        if (u.tags) {
          for (var si = 0; si < u.tags.length; si++) {
            if (tagCounts[u.tags[si]]) synBonus += tagCounts[u.tags[si]] * 0.3;
          }
        }
        return { id: u.id, weight: baseWeight * synBonus, _ref: u };
      });
      var pick = Utils.weighted(bag);
      choices.push(pick._ref);
      // Remove from pool so no duplicates in same level-up
      filtered = filtered.filter(function(u) { return u.id !== pick.id; });
    }
    UI.showLevelUpModal(choices);
  },

  collectItem(item) {
    // Simplified: auto-apply item stats to player, track in run items
    this.runItems.push(item);
    Game.save.codex.items[item.slot] = (Game.save.codex.items[item.slot] || 0) + 1;
    for (const [stat, val] of Object.entries(item.stats)) {
      if (this.player.stats[stat] != null) {
        // percent-ish stats are low numbers; flat stats larger
        this.player.stats[stat] += val;
        if (stat === 'maxHP') this.player.hp += val;
      }
    }
    UI.announce(`+ ${item.rarity.toUpperCase()} ${item.slot.toUpperCase()}`);
  },

  cameraShake(amt, dur) { this.shakeAmt = Math.max(this.shakeAmt, amt); this.shakeTime = Math.max(this.shakeTime, dur); },

  // === JUICE: micro freeze frame on hit ===
  hitPauseTimer: 0,
  hitPause(dur) { this.hitPauseTimer = Math.max(this.hitPauseTimer, dur); },

  // === TASK 7: slow-motion effect ===
  slowMoTimer: 0,
  slowMoScale: 1,
  triggerSlowMo(duration, scale) {
    this.slowMoTimer = duration;
    this.slowMoScale = scale || 0.3;
  },

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    if (this.paused) UI.showPauseMenu(); else UI.hidePauseMenu();
  },

  announce(t) { UI.announce(t); },

  /* ---------------- Main loop ---------------- */
  loop(now) {
    if (!this.running) return;
    try {
      var rawFrameMs = now - this.lastFrame;
      var dt = rawFrameMs / 1000;
      this.lastFrame = now;
      dt = Math.min(dt, 0.05);
      this.frameMsEma = Utils.lerp(this.frameMsEma, rawFrameMs, 0.1);
      this.fpsEma = 1000 / Math.max(1, this.frameMsEma);

      // === Slow-mo scaling ===
      if (this.slowMoTimer > 0) {
        this.slowMoTimer -= dt;
        dt *= this.slowMoScale;
      }

      if (!this.paused) {
        // Hit-pause: skip update for tiny duration on impact
        if (this.hitPauseTimer > 0) {
          this.hitPauseTimer -= dt;
        } else {
          this.update(dt);
        }
      }
      this.render();
    } catch(e) {
      this.running = false;
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;top:40px;left:0;right:0;background:#300;color:#f88;font:11px monospace;padding:8px;z-index:9999;word-break:break-all;max-height:40vh;overflow:auto;';
      d.textContent = 'LOOP ERROR: ' + e.message + ' | ' + (e.stack || '').substring(0, 500);
      document.body.appendChild(d);
      return;
    }
    requestAnimationFrame(function(t) { Game.loop(t); });
  },

  update(dt) {
    this.time += dt;
    if (this.announceTime > 0) this.announceTime -= dt;
    Input.update();
    this.player.update(dt);
    World.update(dt);
    Enemies.update(dt);
    Projectiles.update(dt);
    Pickups.update(dt);
    VFX.update(dt);
    ExtractionZone.update(dt);

    // Camera
    this.camX = Utils.lerp(this.camX, this.player.x, 0.1);
    this.camY = Utils.lerp(this.camY, this.player.y, 0.1);
    if (this.shakeTime > 0) this.shakeTime -= dt;
    else this.shakeAmt *= 0.8;

    this.updatePerfGovernor(dt);
    UI.updateHUD(dt);
  },
  updatePerfGovernor(dt) {
    this.perfGovernorTimer -= dt;
    if (this.perfGovernorTimer > 0) return;
    this.perfGovernorTimer = 0.6;
    if (!this.running) return;

    // Hysteresis to avoid mode flapping.
    if (this.frameMsEma > this.perfGovernorHighMs && this.perfGovernorState !== 'degraded') {
      this.perfGovernorState = 'degraded';
      LOW_FX_MODE = true;
      VFX.maxParticles = 360;
      VFX.maxNumbers = 70;
      World.maxEnemies = Math.min(World.maxEnemies, 72);
      this.announce('PERF MODE: STABLE');
    } else if (this.frameMsEma < this.perfGovernorLowMs && this.perfGovernorState !== 'normal') {
      this.perfGovernorState = 'normal';
      LOW_FX_MODE = false;
      VFX.maxParticles = 900;
      VFX.maxNumbers = 90;
      this.announce('PERF MODE: QUALITY');
    }
  },

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Shake offset
    const sx = this.shakeAmt > 0.1 ? (Math.random() - 0.5) * this.shakeAmt : 0;
    const sy = this.shakeAmt > 0.1 ? (Math.random() - 0.5) * this.shakeAmt : 0;

    World.renderBackground(ctx, this.camX + sx, this.camY + sy);

    ctx.save();
    ctx.translate(this.width / 2 - this.camX - sx, this.height / 2 - this.camY - sy);

    Pickups.render(ctx);
    Enemies.render(ctx);
    this.player.render(ctx);
    Projectiles.render(ctx);
    VFX.render(ctx);
    ExtractionZone.render(ctx);

    ctx.restore();

    // Announce banner
    if (this.announceTime > 0 && this.announceText) {
      ctx.save();
      const a = Math.min(1, this.announceTime / 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#0b1a2bcc';
      ctx.fillRect(0, this.height * 0.25 - 30, this.width, 60);
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.announceText, this.width / 2, this.height * 0.25 + 7);
      ctx.restore();
    }
    if (World.sectorFlashTimer > 0 && World.lastSectorLabel) {
      ctx.save();
      var t = Utils.clamp(World.sectorFlashTimer / 1.3, 0, 1);
      ctx.globalAlpha = t * 0.55;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, this.width - 16, this.height - 16);
      ctx.globalAlpha = t;
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(World.lastSectorLabel, this.width - 16, 28);
      ctx.restore();
    }
    if (this.showPerfOverlay) this.renderPerfOverlay(ctx);
  },
  renderPerfOverlay(ctx) {
    const selectedPerfMode = ((this.save && this.save.perfMode) || 'auto').toUpperCase();
    const lines = [
      'FPS ' + this.fpsEma.toFixed(1) + ' | ' + this.frameMsEma.toFixed(2) + 'ms',
      'EN ' + Enemies.list.length + '  PR ' + Projectiles.list.length + '  PK ' + Pickups.list.length,
      'FX ' + VFX.particles.length + '/' + VFX.maxParticles + '  DR ' + World.getUnlockedDoorCount() + '/4',
      'MODE ' + this.perfGovernorState.toUpperCase() + (LOW_FX_MODE ? ' (LOW_FX)' : ' (FULL_FX)'),
      'PREF ' + selectedPerfMode,
      'BAL ' + this.balancePreset.toUpperCase() + '  (F4 cycle)',
      'HUD F3 toggle',
    ];
    ctx.save();
    const x = 10;
    const y = 10;
    const w = 290;
    const h = 124;
    ctx.fillStyle = 'rgba(5,10,18,0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? '#67e8f9' : (i === 3 ? '#fbbf24' : (i === 4 ? '#86efac' : (i === 5 ? '#fca5a5' : '#e2e8f0')));
      ctx.fillText(lines[i], x + 10, y + 18 + i * 16);
    }
    ctx.restore();
  },

  /* ---------------- Idle menu loop (decorative canvas behind menu) ---------------- */
  idleLoop() {
    if (this.running) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    // Soft gradient + drifting grid
    const t = performance.now() / 1000;
    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.strokeStyle = '#0e2238';
    ctx.globalAlpha = 0.5;
    const gs = 64;
    const ox = -((t * 20) % gs);
    const oy = -((t * 12) % gs);
    ctx.beginPath();
    for (let x = ox; x < this.width; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, this.height); }
    for (let y = oy; y < this.height; y += gs) { ctx.moveTo(0, y); ctx.lineTo(this.width, y); }
    ctx.stroke();
    ctx.restore();
    // Glow pulse
    const g = ctx.createRadialGradient(this.width/2, this.height*0.35, 0, this.width/2, this.height*0.35, this.width*0.6);
    g.addColorStop(0, 'rgba(34,211,238,0.15)');
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    requestAnimationFrame(() => this.idleLoop());
  },
};

/* =====================================================================
 § 21. BOOT
===================================================================== */
window.onerror = function(msg, src, line, col, err) {
  // 'Script error.' at line 0 is an opaque CORS artifact, not a real crash — ignore it
  if (msg === 'Script error.' && line === 0) return true;
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#300;color:#f88;font:12px monospace;padding:8px;z-index:9999;word-break:break-all;';
  d.textContent = msg + ' (line ' + line + ')';
  document.body.appendChild(d);
  return true;
};
window.addEventListener('DOMContentLoaded', function() {
  try { Game.init(); } catch(e) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#300;color:#f88;font:12px monospace;padding:8px;z-index:9999;word-break:break-all;';
    d.textContent = 'Init error: ' + e.message + ' @ ' + e.stack;
    document.body.appendChild(d);
  }
});
