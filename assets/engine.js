/* Pokémon Sleep individual evaluation engine.
 * Formulas for help time, rates, carry limit and SP follow nitoyon/pokesleep-tool
 * (MIT License, https://github.com/nitoyon/pokesleep-tool), which in turn follows
 * RaenonX's research (https://pks.raenonx.cc/). */
const PSE = (function () {
  'use strict';

  function trunc(v, n) {
    const N = 10 ** n;
    const d = parseFloat((v * N).toFixed(6));
    return Math.floor(d) / N;
  }
  function mul100(n) { return parseFloat((n * 100).toFixed(6)); }

  // ---------- natures ----------
  const EFFECT_JA = {
    speed: 'おてつだいスピード', energy: 'げんき回復量', ing: '食材おてつだい確率',
    skill: 'メインスキル発生確率', exp: 'EXP獲得量',
  };
  const NATURES = [
    ['てれや', null, null], ['がんばりや', null, null], ['すなお', null, null], ['きまぐれ', null, null], ['まじめ', null, null],
    ['ずぶとい', 'energy', 'speed'], ['わんぱく', 'energy', 'ing'], ['のうてんき', 'energy', 'skill'], ['のんき', 'energy', 'exp'],
    ['おくびょう', 'exp', 'speed'], ['せっかち', 'exp', 'energy'], ['ようき', 'exp', 'ing'], ['むじゃき', 'exp', 'skill'],
    ['さみしがり', 'speed', 'energy'], ['いじっぱり', 'speed', 'ing'], ['やんちゃ', 'speed', 'skill'], ['ゆうかん', 'speed', 'exp'],
    ['おだやか', 'skill', 'speed'], ['おとなしい', 'skill', 'energy'], ['しんちょう', 'skill', 'ing'], ['なまいき', 'skill', 'exp'],
    ['ひかえめ', 'ing', 'speed'], ['おっとり', 'ing', 'energy'], ['うっかりや', 'ing', 'skill'], ['れいせい', 'ing', 'exp'],
  ].map(([ja, up, down], i) => ({ i, ja, up, down }));
  // English names in the same order (used by the reference calculator)
  ['Bashful', 'Hardy', 'Docile', 'Quirky', 'Serious', 'Bold', 'Impish', 'Lax', 'Relaxed', 'Timid', 'Hasty', 'Jolly', 'Naive',
    'Lonely', 'Adamant', 'Naughty', 'Brave', 'Calm', 'Gentle', 'Careful', 'Sassy', 'Modest', 'Mild', 'Rash', 'Quiet']
    .forEach((en, i) => { NATURES[i].en = en; });
  const NATURE_BY_JA = Object.fromEntries(NATURES.map((n) => [n.ja, n]));
  const NEUTRAL = NATURE_BY_JA['まじめ'];
  function natFactor(n, key, up, down) {
    if (!n) return 1;
    return n.up === key ? up : n.down === key ? down : 1;
  }
  const natSpeed = (n) => natFactor(n, 'speed', 0.9, 1.075);
  const natEnergy = (n) => natFactor(n, 'energy', 1.2, 0.88);
  const natIng = (n) => natFactor(n, 'ing', 1.2, 0.8);
  const natSkill = (n) => natFactor(n, 'skill', 1.2, 0.8);
  const natRpEnergy = (n) => natFactor(n, 'energy', 1.08, 0.92);

  // ---------- sub skills ----------
  // hs: helping speed tiers, ingf: ingredient finder tiers, st: skill trigger tiers,
  // inv: inventory tiers (x6), slu: skill level up, bfs: berry finding,
  // hb / erb: team bonuses, util: no strength effect, bonus: RP bonus group
  const SUBSKILLS = [
    { k: 'BFS', en: 'Berry Finding S', ja: 'きのみの数S', r: 'gold', bfs: 1 },
    { k: 'DSB', en: 'Dream Shard Bonus', ja: 'ゆめのかけらボーナス', r: 'gold', bonus: 1, util: 'ゆめのかけら +6%' },
    { k: 'ERB', en: 'Energy Recovery Bonus', ja: 'げんき回復ボーナス', r: 'gold', bonus: 1, erb: 1 },
    { k: 'HB', en: 'Helping Bonus', ja: 'おてつだいボーナス', r: 'gold', bonus: 1, hb: 1 },
    { k: 'REB', en: 'Research EXP Bonus', ja: 'リサーチEXPボーナス', r: 'gold', bonus: 1, util: 'リサーチEXP +9%' },
    { k: 'SLM', en: 'Skill Level Up M', ja: 'スキルレベルアップM', r: 'gold', slu: 2 },
    { k: 'SEB', en: 'Sleep EXP Bonus', ja: '睡眠EXPボーナス', r: 'gold', bonus: 1, util: 'チームの睡眠EXP +14%' },
    { k: 'HSM', en: 'Helping Speed M', ja: 'おてつだいスピードM', r: 'blue', hs: 2 },
    { k: 'IFM', en: 'Ingredient Finder M', ja: '食材確率アップM', r: 'blue', ingf: 2 },
    { k: 'INL', en: 'Inventory Up L', ja: '最大所持数アップL', r: 'blue', inv: 3 },
    { k: 'INM', en: 'Inventory Up M', ja: '最大所持数アップM', r: 'blue', inv: 2 },
    { k: 'SLS', en: 'Skill Level Up S', ja: 'スキルレベルアップS', r: 'blue', slu: 1 },
    { k: 'STM', en: 'Skill Trigger M', ja: 'スキル確率アップM', r: 'blue', st: 2 },
    { k: 'HSS', en: 'Helping Speed S', ja: 'おてつだいスピードS', r: 'white', hs: 1 },
    { k: 'IFS', en: 'Ingredient Finder S', ja: '食材確率アップS', r: 'white', ingf: 1 },
    { k: 'INS', en: 'Inventory Up S', ja: '最大所持数アップS', r: 'white', inv: 1 },
    { k: 'STS', en: 'Skill Trigger S', ja: 'スキル確率アップS', r: 'white', st: 1 },
  ].map((s, i) => Object.assign({ i, hs: 0, ingf: 0, st: 0, inv: 0, slu: 0, bfs: 0, hb: 0, erb: 0, bonus: 0 }, s));
  const SUB_BY_K = Object.fromEntries(SUBSKILLS.map((s) => [s.k, s]));
  const SUB_BY_JA = Object.fromEntries(SUBSKILLS.map((s) => [s.ja, s]));
  const UNLOCK = [10, 25, 50, 70, 80];
  const MAX_LEVEL = 70; // current in-game level cap (Ver.3.6.0〜)

  function sumSubs(subs) {
    const t = { hs: 0, ingf: 0, st: 0, inv: 0, slu: 0, bfs: 0, hb: 0, erb: 0, rpBonus: 0 };
    for (const s of subs) {
      t.hs += s.hs; t.ingf += s.ingf; t.st += s.st; t.inv += s.inv; t.slu += s.slu;
      t.bfs += s.bfs; t.hb += s.hb; t.erb += s.erb;
      t.rpBonus += s.inv === 3 ? 0.181 : s.inv === 2 ? 0.139 : s.inv === 1 ? 0.071 : 0;
      if (s.bonus) t.rpBonus += 0.221;
    }
    return t;
  }
  function activeSubs(subList, level) {
    // subList: array of 5 (sub skill object or null) in unlock order
    const out = [];
    for (let i = 0; i < 5; i++) if (subList[i] && level >= UNLOCK[i]) out.push(subList[i]);
    return out;
  }

  // ---------- strength tables ----------
  const BERRY_BASE = {
    normal: 28, fire: 27, water: 31, electric: 25, grass: 30, ice: 32, fighting: 27, poison: 32,
    ground: 29, flying: 24, psychic: 26, bug: 24, rock: 30, ghost: 26, dragon: 35, dark: 31, steel: 33, fairy: 26,
  };
  const BERRY_JA = {
    normal: 'キーのみ', fire: 'ヒメリのみ', water: 'オレンのみ', electric: 'ウブのみ', grass: 'ドリのみ', ice: 'チーゴのみ',
    fighting: 'クラボのみ', poison: 'カゴのみ', ground: 'フィラのみ', flying: 'シーヤのみ', psychic: 'マゴのみ', bug: 'ラムのみ',
    rock: 'オボンのみ', ghost: 'ブリーのみ', dragon: 'ヤチェのみ', dark: 'ウイのみ', steel: 'ベリブのみ', fairy: 'モモンのみ',
  };
  function berryStrength(type, level) {
    const b0 = BERRY_BASE[type] || 28;
    return Math.max(b0 + level - 1, Math.round(1.025 ** (level - 1) * b0));
  }
  const berryStrengthField = (type, level, fieldBonus) => Math.ceil(berryStrength(type, level) * (1 + (fieldBonus || 0) / 100));
  // Ingredients: 80% go into recipes (recipe bonus 25%, recipe Lv30 +61%), 20% are left over (same defaults as the reference calculator)
  const ING_FACTOR = 1.25 * 1.61 * 0.8 + 0.2;
  const ING_STRENGTH = {
    leek: 185, mushroom: 167, egg: 115, potato: 124, apple: 90, herb: 130, sausage: 103, milk: 98, honey: 101,
    oil: 121, ginger: 109, tomato: 110, cacao: 151, tail: 342, soy: 100, corn: 140, coffee: 153, pumpkin: 250, avocado: 162,
  };
  const G_TABLE = [
    1.0, 1.003, 1.007, 1.011, 1.016, 1.021, 1.027, 1.033, 1.039, 1.046,
    1.053, 1.061, 1.069, 1.077, 1.085, 1.094, 1.104, 1.114, 1.124, 1.134,
    1.145, 1.156, 1.168, 1.18, 1.192, 1.205, 1.218, 1.231, 1.245, 1.259,
    1.274, 1.288, 1.303, 1.319, 1.335, 1.351, 1.368, 1.385, 1.402, 1.42,
    1.439, 1.457, 1.477, 1.496, 1.517, 1.537, 1.558, 1.58, 1.602, 1.625,
    1.648, 1.671, 1.696, 1.72, 1.745, 1.771, 1.798, 1.824, 1.852, 1.88,
    1.927, 1.975, 2.024, 2.075, 2.127, 2.18, 2.235, 2.29, 2.348, 2.406,
    2.466, 2.527, 2.589, 2.653, 2.718, 2.784, 2.852, 2.921, 2.991, 3.062,
    3.135, 3.209, 3.285, 3.361, 3.439, 3.519, 3.599, 3.681, 3.764, 3.849,
    3.935, 4.022, 4.11, 4.2, 4.291, 4.383, 4.477, 4.572, 4.668, 4.766,
  ];
  function ingG(level) {
    if (level - 1 < G_TABLE.length) return G_TABLE[level - 1];
    return 0.0006515 * level ** 2 - 0.032106 * level + 1.461109;
  }

  function maxSkillLevel(skill) {
    if (['Dream Shard Magnet S', 'Dream Shard Magnet S (Random)', 'Dream Shard Magnet S (Aura Sphere)', 'Versatile'].includes(skill)) return 8;
    if (['Ingredient Magnet S', 'Ingredient Magnet S (Plus)', 'Ingredient Magnet S (Present)', 'Charge Strength M',
      'Charge Strength M (Bad Dreams)', 'Charge Strength S', 'Charge Strength S (Random)', 'Charge Strength S (Stockpile)',
      'Extra Helpful S', 'Cooking Power-Up S', 'Cooking Power-Up S (Minus)', 'Metronome', 'Skill Copy (Transform)',
      'Skill Copy (Mimic)', 'Ingredient Draw S', 'Ingredient Draw S (Super Luck)', 'Ingredient Draw S (Hyper Cutter)',
      'Cooking Assist S', 'Cooking Assist S (Bulk Up)'].includes(skill)) return 7;
    return 6;
  }
  // Skill value used by the in-game SP formula
  function skillValue(skill, level) {
    const T = (arr) => arr[Math.max(0, Math.min(arr.length, level) - 1)];
    if (skill === 'Charge Strength S' || skill === 'Charge Strength S (Random)') return T([400, 569, 785, 1083, 1496, 2066, 2842]);
    if (skill === 'Charge Energy S') return T([400, 569, 785, 1083, 1496, 2066, 2656]);
    if (skill === 'Charge Energy S (Moonlight)') return T([560, 797, 1099, 1516, 2094, 2892]);
    if (skill === 'Charge Strength S (Stockpile)' || skill === 'Skill Copy (Transform)' || skill === 'Skill Copy (Mimic)') return T([600, 853, 1177, 1625, 2243, 3099, 3984]);
    if (skill === 'Charge Strength M') return T([880, 1251, 1726, 2383, 3290, 4546, 6252]);
    if (skill === 'Energy for Everyone S') return T([1120, 1593, 2197, 3033, 4187, 5785]);
    if (skill === 'Cooking Assist S (Bulk Up)') return T([1144, 1627, 2244, 3098, 4277, 5910, 7596]);
    if (skill === 'Energy for Everyone S (Berry Juice)') return T([1220, 1735, 2392, 3303, 4559, 6299]);
    if (skill === 'Helper Boost') return T([2800, 3902, 5273, 6975, 9317, 12438]);
    if (skill === 'Berry Burst (Draco Meteor)') return T([2380, 3385, 4670, 6445, 8898, 12294]);
    if (skill === 'Berry Burst (Disguise)' || skill === 'Berry Burst' || skill === 'Energy for Everyone S (Lunar Blessing)') return T([1400, 1991, 2747, 3791, 5234, 7232]);
    if (skill === 'Charge Strength M (Bad Dreams)') return T([2400, 3313, 4643, 6441, 8864, 11878, 14072]);
    if (skill === 'Energizing Cheer S') return T([766, 1089, 1502, 2074, 2863, 3956]);
    if (skill === 'Energizing Cheer S (Heal Pulse)') return T([1600, 2300, 3180, 4417, 6113, 8462]);
    if (skill === 'Versatile') return T([1280, 1651, 2126, 2783, 3690, 5056, 6463, 8033]);
    if (skill === 'Dream Shard Magnet S (Aura Sphere)') return T([1040, 1479, 2040, 2816, 3888, 5372, 6905, 8543]);
    if (skill === 'Berry Zone (Psystrike)') return T([2450, 3383, 4733, 6551, 8994, 12028]);
    return T([880, 1251, 1726, 2383, 3290, 4546, 5843, 7303]);
  }

  // ---------- species ----------
  let SPECIES = [];
  let SPECIES_BY_JA = {};
  let SKILL_JA = {}, ING_JA = {}, TYPE_JA = {};
  function loadData(bundle) {
    const c = bundle.cols;
    SPECIES = bundle.pokemon.map((row, idx) => {
      const o = {};
      c.forEach((k, i) => { o[k] = row[i]; });
      o.idx = idx;
      o.supported = o.freq > 0 && o.spec !== 'U';
      return o;
    });
    SPECIES_BY_JA = Object.fromEntries(SPECIES.map((s) => [s.ja, s]));
    SKILL_JA = bundle.skillJa; ING_JA = bundle.ingJa; TYPE_JA = bundle.typeJa;
  }
  const SPEC_JA = { B: 'きのみ', I: '食材', S: 'スキル', A: 'オール', U: '不明' };

  // Possible ingredient choices per slot: [{name, count, code}]
  function slotOptions(sp, slot) {
    if (sp.myth) {
      return sp.myth.map((m, i) => ({ name: m[0], count: m[1 + slot], code: String.fromCharCode(65 + i) }))
        .filter((o) => o.count > 0);
    }
    const opts = [];
    if (slot === 0) opts.push({ name: sp.i1[0], count: sp.i1[1], code: 'A' });
    if (slot === 1) {
      opts.push({ name: sp.i1[0], count: sp.i1[2], code: 'A' });
      if (sp.i2 && sp.i2[0] && !String(sp.i2[0]).startsWith('unknown')) opts.push({ name: sp.i2[0], count: sp.i2[1], code: 'B' });
    }
    if (slot === 2) {
      opts.push({ name: sp.i1[0], count: sp.i1[3], code: 'A' });
      if (sp.i2 && !String(sp.i2[0]).startsWith('unknown')) opts.push({ name: sp.i2[0], count: sp.i2[2], code: 'B' });
      if (sp.i3 && !String(sp.i3[0]).startsWith('unknown')) opts.push({ name: sp.i3[0], count: sp.i3[1], code: 'C' });
    }
    return opts.filter((o) => o.count > 0 && ING_STRENGTH[o.name] !== undefined);
  }

  // ---------- frequency / rates ----------
  function ribbonSpeed(sp, ribbon) {
    if (!sp.el) return 1;
    if (ribbon >= 4) return sp.el === 2 ? 0.75 : sp.el === 1 ? 0.88 : 1;
    if (ribbon >= 2) return sp.el === 2 ? 0.89 : sp.el === 1 ? 0.95 : 1;
    return 1;
  }
  const RIBBON_CARRY = [0, 1, 3, 6, 8];
  const ftrunc4 = (v) => Math.floor(v * 10000 + 1e-7) / 10000;
  function frequency(sp, level, nature, tot, ribbon, hbCount) {
    const f = Math.min(tot.hs * 0.07 + 0.05 * hbCount, 0.35);
    return sp.freq * ftrunc4(((501 - level) / 500) * natSpeed(nature) * ribbonSpeed(sp, ribbon) * (1 - f));
  }
  function rpFrequency(sp, level, nature, tot, ribbon) {
    const hack = level === 10 && sp.freq === 2600 ? 0.1 : 0;
    return sp.freq * trunc(((501 - level) / 500) * natSpeed(nature) * ribbonSpeed(sp, ribbon) * (1 - tot.hs * 0.07), 4) - hack;
  }
  const ingRate = (sp, nature, tot) => trunc((sp.ir / 100) * natIng(nature) * (1 + tot.ingf * 0.18), 4);
  const skillRate = (sp, nature, tot) => trunc((sp.sr / 100) * natSkill(nature) * (1 + tot.st * 0.18), 4);
  const fIngRate = (sp, nature, tot) => ftrunc4((sp.ir / 100) * natIng(nature) * (1 + tot.ingf * 0.18));
  const fSkillRate = (sp, nature, tot) => ftrunc4((sp.sr / 100) * natSkill(nature) * (1 + tot.st * 0.18));
  const berryCount = (sp, tot) => (sp.spec === 'B' || sp.spec === 'A' ? 2 : 1) + (tot.bfs ? 1 : 0);

  function ingredientEnergy(slots, level) {
    const e = (s) => (s ? (ING_STRENGTH[s.name] || 0) * s.count : 0);
    const e1 = e(slots[0]);
    if (level < 30) return e1;
    const e2 = e(slots[1]);
    let count = 1 + (e2 > 0 ? 1 : 0);
    if (level < 60) return Math.floor((e1 + e2) / count);
    const e3 = e(slots[2]);
    count += e3 > 0 ? 1 : 0;
    return Math.floor((e1 + e2 + e3) / count);
  }
  function avgIngCount(slots, level) {
    const n = level < 30 ? 1 : level < 60 ? 2 : 3;
    let t = 0, k = 0;
    for (let i = 0; i < n; i++) if (slots[i] && slots[i].count > 0) { t += slots[i].count; k++; }
    return k ? t / k : 0;
  }
  function effSkillLevel(sp, baseSkillLevel, tot) {
    return Math.max(1, Math.min(maxSkillLevel(sp.skill), baseSkillLevel + tot.slu));
  }

  // ---------- in-game SP ----------
  function computeSP(sp, iv) {
    // iv: {level, nature, subs[5], skillLevelBase, slots[3], ribbon}
    const subs = activeSubs(iv.subs, iv.level);
    const tot = sumSubs(subs);
    const freq = rpFrequency(sp, iv.level, iv.nature, tot, iv.ribbon || 0);
    const help5 = freq === 0 ? 0 : 5 * trunc(3600 / freq, 2);
    const ir = ingRate(sp, iv.nature, tot);
    const sr = skillRate(sp, iv.nature, tot);
    const br = ir > 0 ? 1 - ir : 0;
    const bc = berryCount(sp, tot);
    const sl = effSkillLevel(sp, iv.skillLevelBase, tot);
    const ingRp = trunc(help5 * ir * ingredientEnergy(iv.slots, iv.level) * ingG(iv.level), 2);
    const berryRp = trunc(help5 * br * berryStrength(sp.type, iv.level) * bc, 2);
    const skillRp = trunc(help5 * sr * skillValue(sp.skill, sl), 2);
    const bonus = trunc(natRpEnergy(iv.nature) * (1 + tot.rpBonus), 2);
    const rp = Math.round(((mul100(ingRp) + mul100(berryRp) + mul100(skillRp)) * mul100(bonus)) / 10000);
    return {
      rp, freq, ir, sr, bc, skillLevel: sl,
      carry: null,
      parts: { berry: trunc(berryRp * bonus, 1), ing: trunc(ingRp * bonus, 1), skill: trunc(skillRp * bonus, 1) },
    };
  }

  // ---------- energy model (simplified port of nitoyon's Energy) ----------
  const effByEnergy = (e) => (e > 80 ? 2.222 : e > 60 ? 1.923 : e > 40 ? 1.724 : e > 1 ? 1.515 : 1);
  const cookRecovery = (e) => (e > 80 ? 1 : e > 70 ? 2 : e > 60 ? 3 : e > 50 ? 4 : e > 40 ? 5 : e > 30 ? 6 : e > 20 ? 7 : e > 10 ? 8 : 9);
  const energyCache = new Map();
  function energyProfile(natE, ownERB, teamERB, sleepScore, e4eCount = 3, e4eEnergy = 18) {
    const key = natE + '|' + ownERB + '|' + teamERB + '|' + sleepScore + '|' + e4eCount + '|' + e4eEnergy;
    if (energyCache.has(key)) return energyCache.get(key);
    const wakeMax = ownERB ? 105 : 100;
    const sleepMinutes = (sleepScore * 510) / 100;
    const sleepRecovery = Math.min(wakeMax, Math.round((sleepMinutes / 510) * 100) * natE * (1 + 0.14 * teamERB));
    const myRestore = e4eEnergy * natE;
    const sleepTime = 1440 - sleepMinutes;
    const mk = () => {
      const ev = [{ m: 0, t: 'wake' }, { m: 120, t: 'cook' }, { m: 360, t: 'cook' }, { m: 720, t: 'cook' }];
      // team energy skills (Energy for Everyone) spread over the day, as in the reference calculator
      for (let i = 0; i < e4eCount; i++) ev.push({ m: Math.floor(((i + 1) * 930) / (e4eCount + 1) / 10) * 10, t: 'e4e' });
      ev.push({ m: sleepTime, t: 'sleep' }, { m: 1440, t: 'wake' });
      return ev.sort((a, b) => a.m - b.m);
    };
    const run = (ev, initial) => {
      ev[0].after = initial;
      for (let i = 1; i < ev.length; i++) {
        const consumed = (ev[i].m - ev[i - 1].m) / 10;
        ev[i].before = Math.max(0, ev[i - 1].after - consumed);
        let after = ev[i].before;
        if (ev[i].t === 'cook') after += cookRecovery(ev[i].before);
        else if (ev[i].t === 'e4e') after = Math.min(150, after + myRestore);
        else if (ev[i].t === 'wake') after = Math.min(wakeMax, after + sleepRecovery);
        else if (ev[i].t === 'sleep') { ev[i].after = ev[i].before; continue; }
        ev[i].after = Math.ceil(after);
      }
      ev[0].before = ev[ev.length - 1].before;
    };
    let ev = mk();
    run(ev, sleepRecovery);
    const initial = ev[ev.length - 1].after;
    ev = mk();
    run(ev, initial);
    // empty events
    for (let i = 1; i < ev.length; i++) {
      const p = ev[i - 1], c = ev[i];
      const consumed = (c.m - p.m) / 10;
      if (p.after > 0 && p.after < consumed) {
        ev.splice(i, 0, { m: p.m + p.after * 10, t: 'empty', before: 0, after: 0 });
      }
    }
    // efficiency segments
    const segs = [];
    for (let i = 1; i < ev.length; i++) {
      let energy = ev[i - 1].after, start = ev[i - 1].m;
      const curM = ev[i].m;
      for (;;) {
        if (energy <= 1) { energy = 0; break; }
        const th = energy <= 40 ? 1 : energy % 20 === 0 ? energy - 20 : Math.floor(energy / 20) * 20;
        const end = start + (energy - th) * 10;
        if (end > curM) break;
        segs.push({ s: start, e: end, eff: effByEnergy(energy) });
        energy = th; start = end;
      }
      segs.push({ s: start, e: curM, eff: effByEnergy(energy) });
    }
    let awake = 0, asleep = 0, awakeMin = 0, asleepMin = 0;
    for (const g of segs) {
      const a0 = Math.max(g.s, 0), a1 = Math.min(g.e, sleepTime);
      if (a1 > a0) { awake += (a1 - a0) * g.eff; awakeMin += a1 - a0; }
      const b0 = Math.max(g.s, sleepTime), b1 = Math.min(g.e, 1440);
      if (b1 > b0) { asleep += (b1 - b0) * g.eff; asleepMin += b1 - b0; }
    }
    const r = { awake, asleep, awakeMin, asleepMin, wakeEnergy: ev[0].after, sleepEnergy: ev.find((x) => x.t === 'sleep').before };
    energyCache.set(key, r);
    return r;
  }

  // ---------- daily value model ----------
  function pityRate(sp, rate) {
    if (rate <= 0) return 0;
    const n = sp.spec === 'S' || sp.spec === 'A' ? Math.ceil(142000 / sp.freq) : 78;
    return rate / (1 - (1 - rate) ** (n + 1));
  }
  function expectedCapped(lambda, cap) {
    // E[min(X, cap)] for X ~ Poisson(lambda)
    const e = Math.exp(-lambda);
    let p = e, cdf = 0, res = 0;
    for (let k = 0; k < cap; k++) { cdf += p; res += 1 - cdf; p = (p * lambda) / (k + 1); }
    return res;
  }

  function ingredientStrengthPerProc(slots, level) {
    const n = level < 30 ? 1 : level < 60 ? 2 : 3;
    let t = 0, k = 0;
    for (let i = 0; i < n; i++) if (slots[i] && slots[i].count > 0) { t += (ING_STRENGTH[slots[i].name] || 0) * slots[i].count; k++; }
    return k ? t / k : 0;
  }

  /** ctx: {sp, level, skillLevelBase, slots, carryBase, ribbon, sleepScore, fieldBonus, e4eCount, e4eEnergy, skillStr} */
  const EMPTY_TOT = sumSubs([]);
  function dailyOwn(ctx, nature, tot, hbCount, teamERB) {
    const { sp, level } = ctx;
    const freq = frequency(sp, level, nature, tot, ctx.ribbon || 0, hbCount);
    const prof = energyProfile(natEnergy(nature), tot.erb > 0, teamERB, ctx.sleepScore, ctx.e4eCount, ctx.e4eEnergy);
    const Ha = (prof.awake * 60) / freq;
    const Hs = (prof.asleep * 60) / freq;
    const ir = fIngRate(sp, nature, tot);
    const br = ir > 0 ? 1 - ir : 0;
    const sr = pityRate(sp, fSkillRate(sp, nature, tot));
    const bc = berryCount(sp, tot);
    const fb = 1 + (ctx.fieldBonus || 0) / 100;
    const bv = berryStrengthField(sp.type, level, ctx.fieldBonus);
    const iv = ingredientStrengthPerProc(ctx.slots, level) * ING_FACTOR * fb;
    const sl = effSkillLevel(sp, ctx.skillLevelBase, tot);
    // skill effect per trigger: the skill's own table when known (ingredients, energy, strength...),
    // otherwise the in-game SP skill value, which grows the same way for every skill
    const eff = ctx.skillEffect ? ctx.skillEffect(sl) : 0;
    const sv = eff > 0 ? eff : skillValue(sp.skill, sl);
    const svStr = ctx.skillStr ? ctx.skillStr(sl) : 0;
    const carry = ctx.carryBase + 6 * tot.inv;
    const usage = br * bc + ir * avgIngCount(ctx.slots, level);
    const fullAt = usage > 0 ? carry / usage : Infinity;
    const Hn = Math.min(Hs, fullAt);
    const Hss = Math.max(0, Hs - fullAt);
    const stock = sp.spec === 'S' || sp.spec === 'A' ? 2 : 1;
    const nightSkills = expectedCapped(Hs * sr, stock);
    const berries = (Ha + Hn) * br * bc + Hss * bc;
    const ings = (Ha + Hn) * ir * avgIngCount(ctx.slots, level);
    const skills = Ha * sr + nightSkills;
    const vBerry = berries * bv;
    const vIng = (Ha + Hn) * ir * iv;
    const vSkill = skills * sv; // skill effect scaled by the in-game SP skill value (works for every skill)
    const vSkillStr = skills * svStr; // strength the skill produces (0 for energy / shard / cooking-chance skills)
    return {
      total: vBerry + vIng + vSkillStr, vBerry, vIng, vSkill, vSkillStr,
      helps: Ha + Hs, helpsAwake: Ha, helpsAsleep: Hs, berries, ings, skills,
      freq, ir, sr, bc, carry, overflowHelps: Hss, fullAt, usage, tot,
    };
  }

  // role basis: what this specialty is expected to bring
  function roleOf(sp, own) {
    if (sp.spec === 'B') return own.vBerry;
    if (sp.spec === 'I') return own.vIng;
    if (sp.spec === 'S') return own.vSkill;
    return own.total;
  }
  function makeContext(sp, opts) {
    const ctx = Object.assign({ ribbon: 0, sleepScore: 100, fieldBonus: 0, e4eCount: 3, e4eEnergy: 18 }, opts, { sp });
    // strength per skill trigger, memoized per skill level (provided by the reference calculator when available)
    const effMemo = new Map();
    const effFn = opts.skillEffect;
    ctx.skillEffect = effFn ? (sl) => {
      if (!effMemo.has(sl)) { let v = 0; try { v = +effFn(sl) || 0; } catch { v = 0; } effMemo.set(sl, v); }
      return effMemo.get(sl);
    } : null;
    const memo = new Map();
    const fn = opts.skillStrPerTrigger;
    ctx.skillStr = (sl) => {
      if (!fn) return 0;
      if (!memo.has(sl)) { let v = 0; try { v = fn(ctx.level, sl) || 0; } catch { v = 0; } memo.set(sl, v); }
      return memo.get(sl);
    };
    // team-effect baselines: 4 teammates assumed to be this species with neutral nature, no sub skills
    const b0 = dailyOwn(ctx, NEUTRAL, EMPTY_TOT, 0, 0);
    const bHB = dailyOwn(ctx, NEUTRAL, EMPTY_TOT, 1, 0);
    const bERB = dailyOwn(ctx, NEUTRAL, EMPTY_TOT, 0, 1);
    ctx.team = {
      hb: {
        role: 4 * Math.max(0, roleOf(sp, bHB) - roleOf(sp, b0)),
        // the reference calculator values Helping Bonus with a fixed teammate (Raichu Lv60)
        str: opts.teamHBStr != null ? opts.teamHBStr : 4 * Math.max(0, bHB.total - b0.total),
      },
      erb: { role: 4 * Math.max(0, roleOf(sp, bERB) - roleOf(sp, b0)), str: 4 * Math.max(0, bERB.total - b0.total) },
    };
    return ctx;
  }
  function value(ctx, nature, subs) { return valueTot(ctx, nature, sumSubs(subs)); }
  function valueTot(ctx, nature, tot) {
    const own = dailyOwn(ctx, nature, tot, tot.hb ? 1 : 0, tot.erb ? 1 : 0);
    const T = ctx.team;
    own.teamRole = (tot.hb ? T.hb.role : 0) + (tot.erb ? T.erb.role : 0);
    own.teamStr = (tot.hb ? T.hb.str : 0) + (tot.erb ? T.erb.str : 0);
    own.role = roleOf(ctx.sp, own) + own.teamRole;
    own.str = own.total + own.teamStr;
    return own;
  }

  // ---------- enumeration ----------
  function combinations(n, k, cb) {
    const idx = [];
    const rec = (start, depth) => {
      if (depth === k) { cb(idx); return; }
      for (let i = start; i <= n - (k - depth); i++) { idx[depth] = i; rec(i + 1, depth + 1); }
    };
    rec(0, 0);
  }
  function activeCount(level) { return UNLOCK.filter((u) => level >= u).length; }

  // Sub skills with an effect on the value model; DSB / REB / SEB have none.
  const EFFECT_SUBS = SUBSKILLS.filter((x) => !x.util);
  const NULL_SUB_COUNT = SUBSKILLS.length - EFFECT_SUBS.length;
  const choose = (n, r) => { if (r < 0 || r > n) return 0; let x = 1; for (let i = 0; i < r; i++) x = (x * (n - i)) / (i + 1); return x; };
  const sigCache = new Map();
  function signatures(k) {
    // unique effect totals among all k-subsets of the 17 sub skills, with how many subsets map to each
    if (sigCache.has(k)) return sigCache.get(k);
    const map = new Map();
    for (let m = Math.max(0, k - NULL_SUB_COUNT); m <= Math.min(k, EFFECT_SUBS.length); m++) {
      const mult = choose(NULL_SUB_COUNT, k - m);
      combinations(EFFECT_SUBS.length, m, (idx) => {
        const subs = idx.map((i) => EFFECT_SUBS[i]);
        const tot = sumSubs(subs);
        const sig = [tot.hs, tot.ingf, tot.st, tot.inv, tot.slu, tot.bfs, tot.hb, tot.erb].join(',');
        const e = map.get(sig);
        if (e) e.w += mult; else map.set(sig, { tot, w: mult, subs });
      });
    }
    const list = [...map.values()];
    sigCache.set(k, list);
    return list;
  }
  function makeDist(entries) {
    entries.sort((x, y) => x.v - y.v);
    const vals = new Float64Array(entries.length), cum = new Float64Array(entries.length);
    let c = 0;
    entries.forEach((e, i) => { vals[i] = e.v; c += e.w; cum[i] = c; });
    const best = entries[entries.length - 1];
    let mid = 0;
    while (mid < cum.length - 1 && cum[mid] < c / 2) mid++;
    return { vals, cum, total: c, best: { v: best.v, nature: best.nature, subs: best.subs }, median: vals[mid] };
  }
  const distCache = new Map();
  function distribution(ctx) {
    const level = ctx.level;
    const key = [ctx.sp.idx, level, ctx.skillLevelBase, ctx.slots.map((s) => s && s.name + s.count).join(','), ctx.carryBase, ctx.ribbon,
      ctx.sleepScore, ctx.fieldBonus, ctx.e4eCount, ctx.e4eEnergy, Math.round(ctx.team.hb.str), ctx.skillEffect ? 'fx' : 'sp'].join('|');
    if (distCache.has(key)) return distCache.get(key);
    const k = activeCount(level);
    const sigs = signatures(k);
    const role = [], str = [];
    for (const n of NATURES) {
      for (const g of sigs) {
        const r = valueTot(ctx, n, g.tot);
        role.push({ v: r.role, w: g.w, nature: n, subs: g.subs });
        str.push({ v: r.str, w: g.w, nature: n, subs: g.subs });
      }
    }
    const r = { role: makeDist(role), str: makeDist(str), n: NATURES.length * choose(SUBSKILLS.length, k), k };
    distCache.set(key, r);
    if (distCache.size > 40) distCache.delete(distCache.keys().next().value);
    return r;
  }
  function percentileTop(d, v) {
    // share of combinations that are strictly better (+ half of ties)
    const a = d.vals, cum = d.cum;
    const eps = Math.max(1e-9, Math.abs(v) * 1e-9);
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v - eps) lo = m + 1; else hi = m; }
    const below = lo ? cum[lo - 1] : 0;
    let lo2 = lo; hi = a.length;
    while (lo2 < hi) { const m = (lo2 + hi) >> 1; if (a[m] <= v + eps) lo2 = m + 1; else hi = m; }
    const upto = lo2 ? cum[lo2 - 1] : 0;
    const ties = upto - below;
    const better = d.total - upto;
    return (better + ties / 2) / d.total;
  }
  function grade(top) {
    if (top <= 0.05) return 'S';
    if (top <= 0.2) return 'A';
    if (top <= 0.5) return 'B';
    if (top <= 0.8) return 'C';
    return 'D';
  }

  // ---------- evaluate ----------
  function deriveBase(ind) {
    const sp = ind.sp;
    const curTot = sumSubs(activeSubs(ind.subs, ind.level));
    const skillLevelBase = Math.max(1, (ind.skillLevelShown || 1) - curTot.slu);
    const carryDefault = sp.carry + 5 * Math.max(0, sp.ev) + RIBBON_CARRY[ind.ribbon || 0];
    const carryBase = ind.carryShown ? Math.max(1, ind.carryShown - 6 * curTot.inv) : carryDefault;
    return { skillLevelBase, carryBase, carryDefault };
  }
  /** ind: {sp, level, nature, subs[5], skillLevelShown, slots[3], carryShown, ribbon, sleepScore} */
  function evaluate(ind, evalLevel) {
    const sp = ind.sp;
    const { skillLevelBase, carryBase, carryDefault } = deriveBase(ind);
    const L = evalLevel;
    const env = ind.env || {};
    const mk = (lv) => makeContext(sp, {
      level: lv, skillLevelBase, slots: ind.slots, carryBase, ribbon: ind.ribbon || 0, sleepScore: ind.sleepScore || 100,
      fieldBonus: env.fieldBonus || 0, e4eCount: env.e4eCount ?? 3, e4eEnergy: env.e4eEnergy ?? 18,
      teamHBStr: env.teamHBStr, skillStrPerTrigger: env.skillStrPerTrigger, skillEffect: env.skillEffect,
    });
    const ctx = mk(L);
    const subsL = activeSubs(ind.subs, L);
    const me = value(ctx, ind.nature, subsL);
    const dist = distribution(ctx);
    const res = (basis) => {
      const d = dist[basis];
      const v = me[basis];
      const top = percentileTop(d, v);
      return { top, grade: grade(top), ratio: d.best.v > 0 ? v / d.best.v : 0, best: d.best, median: d.median };
    };
    const role = res('role');
    const str = res('str');

    const neutral = value(ctx, NEUTRAL, subsL);
    const natureDelta = { role: neutral.role > 0 ? me.role / neutral.role - 1 : 0, str: me.str / neutral.str - 1 };
    const natureRank = 1 + NATURES.filter((n) => value(ctx, n, subsL).role > me.role * (1 + 1e-9) + 1e-9).length;

    const ctxCache = { [L]: ctx };
    const subDetails = ind.subs.map((s, i) => {
      if (!s) return null;
      const lv = Math.max(L, UNLOCK[i]);
      const c2 = ctxCache[lv] || (ctxCache[lv] = mk(lv));
      const act = activeSubs(ind.subs, lv);
      const without = act.filter((x) => x !== s);
      const a = value(c2, ind.nature, act);
      const b = value(c2, ind.nature, without);
      return {
        sub: s, unlock: UNLOCK[i], active: L >= UNLOCK[i], evalAt: lv,
        delta: { role: b.role > 0 ? a.role / b.role - 1 : 0, str: a.str / b.str - 1 },
      };
    });
    return { L, ctx, me, role, str, n: dist.n, k: dist.k, natureDelta, natureRank, subDetails, skillLevelBase, carryBase, carryDefault };
  }

  // ---------- SP / help time check with suggestions ----------
  function checkReading(ind) {
    const sp = ind.sp;
    const curTot = sumSubs(activeSubs(ind.subs, ind.level));
    const base = {
      level: ind.level, nature: ind.nature, subs: ind.subs, slots: ind.slots, ribbon: ind.ribbon || 0,
      skillLevelBase: Math.max(1, (ind.skillLevelShown || 1) - curTot.slu),
    };
    const calc = computeSP(sp, base);
    const out = { calc, spOk: null, timeOk: null, carryOk: null, suggestions: [] };
    const helpTimeOf = (r) => Math.floor(r.freq);
    if (ind.spShown) out.spOk = calc.rp === ind.spShown;
    if (ind.helpTimeShown) {
      const tot = curTot;
      const alt = Math.floor(frequency(sp, ind.level, ind.nature, tot, ind.ribbon || 0, tot.hb ? 1 : 0));
      out.timeOk = Math.abs(helpTimeOf(calc) - ind.helpTimeShown) <= 1 || Math.abs(alt - ind.helpTimeShown) <= 1;
    }
    const carryCalc = sp.carry + 5 * Math.max(0, sp.ev) + RIBBON_CARRY[ind.ribbon || 0] + 6 * curTot.inv;
    out.carryCalc = carryCalc;
    if (ind.carryShown) out.carryOk = carryCalc === ind.carryShown;

    if (ind.spShown && !out.spOk) {
      const tries = [];
      const ms = maxSkillLevel(sp.skill);
      for (let s = 1; s <= ms; s++) if (s !== ind.skillLevelShown) tries.push({ label: `メインスキル Lv.${s}`, patch: { skillLevelShown: s } });
      for (let r = 1; r <= 4; r++) if (r !== (ind.ribbon || 0)) tries.push({ label: `おやすみリボン ${r}`, patch: { ribbon: r } });
      for (const o1 of slotOptions(sp, 1)) for (const o2 of slotOptions(sp, 2)) {
        const slots = [ind.slots[0], o1, o2];
        if (slots[1].name === ind.slots[1]?.name && slots[2].name === ind.slots[2]?.name) continue;
        tries.push({ label: `食材 ${ING_JA[o1.name]}×${o1.count} / ${ING_JA[o2.name]}×${o2.count}`, patch: { slots } });
      }
      for (const n of NATURES) if (n !== ind.nature) tries.push({ label: `せいかく ${n.ja}`, patch: { nature: n } });
      for (let i = 0; i < 5; i++) {
        if (ind.level < UNLOCK[i]) continue;
        for (const alt of SUBSKILLS) {
          if (ind.subs.includes(alt)) continue;
          const subs = ind.subs.slice(); subs[i] = alt;
          tries.push({ label: `Lv${UNLOCK[i]}のサブスキル ${alt.ja}`, patch: { subs } });
        }
      }
      for (let lv = Math.max(1, ind.level - 9); lv <= Math.min(MAX_LEVEL + 10, ind.level + 9); lv++) if (lv !== ind.level) tries.push({ label: `Lv.${lv}`, patch: { level: lv } });
      for (const t of tries) {
        const ind2 = Object.assign({}, ind, t.patch);
        const tot2 = sumSubs(activeSubs(ind2.subs, ind2.level));
        const r = computeSP(sp, {
          level: ind2.level, nature: ind2.nature, subs: ind2.subs, slots: ind2.slots, ribbon: ind2.ribbon || 0,
          skillLevelBase: Math.max(1, (ind2.skillLevelShown || 1) - tot2.slu),
        });
        if (r.rp === ind.spShown) {
          if (ind.helpTimeShown && Math.abs(Math.floor(r.freq) - ind.helpTimeShown) > 1) continue;
          out.suggestions.push(t);
        }
      }
    }
    return out;
  }

  return {
    loadData, evaluate, checkReading, computeSP, frequency, slotOptions, sumSubs, activeSubs, value, makeContext, energyProfile, deriveBase,
    NATURES, NATURE_BY_JA, NEUTRAL, SUBSKILLS, SUB_BY_JA, SUB_BY_K, UNLOCK, MAX_LEVEL, EFFECT_JA, SPEC_JA, BERRY_JA,
    ING_STRENGTH, maxSkillLevel, berryStrength, skillValue,
    get SPECIES() { return SPECIES; }, get SPECIES_BY_JA() { return SPECIES_BY_JA; },
    get SKILL_JA() { return SKILL_JA; }, get ING_JA() { return ING_JA; }, get TYPE_JA() { return TYPE_JA; },
  };
})();
if (typeof module !== 'undefined') module.exports = PSE;
