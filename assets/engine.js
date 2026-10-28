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
  // Toxtricity's form follows its nature (as in the reference calculator)
  const AMPED_NATURES = ['Hardy', 'Docile', 'Quirky', 'Lax', 'Impish', 'Hasty', 'Naive', 'Jolly', 'Brave', 'Naughty', 'Adamant', 'Sassy', 'Rash'];
  function naturesFor(sp) {
    if (sp && sp.en === 'Toxtricity (Amped)') return NATURES.filter((n) => AMPED_NATURES.includes(n.en));
    if (sp && sp.en === 'Toxtricity (Low Key)') return NATURES.filter((n) => !AMPED_NATURES.includes(n.en));
    return NATURES;
  }
  function formForNature(sp, nature) {
    if (!sp || !nature || !/^Toxtricity \(/.test(sp.en) || naturesFor(sp).includes(nature)) return sp;
    const other = sp.en === 'Toxtricity (Amped)' ? 'Toxtricity (Low Key)' : 'Toxtricity (Amped)';
    return SPECIES.find((x) => x.en === other) || sp;
  }
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
      'Cooking Assist S', 'Cooking Assist S (Bulk Up)', 'Cooking Advance S (Mystical Fire)'].includes(skill)) return 7;
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
    // Mystical Fire: RaenonX's game data (pks.raenonx.cc)
    if (skill === 'Cooking Advance S (Mystical Fire)') return T([1144, 1626, 2244, 3098, 4277, 5910, 7596]);
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

  // ---------- daily model ----------
  // A port of the reference calculator's Energy / HelpCount (nitoyon/pokesleep-tool) with its default
  // settings: wake 8:00, cook 10:00 / 14:00 / 20:00, Energy for Everyone 3 x 18, items collected every
  // 3 hours while awake and not at all while asleep, pity proc on. When the inventory is full, a help
  // only brings berries (sneaky snacking): no ingredients and no main skill. Until collected, a Pokémon
  // holds at most one skill (two for Skills / All specialty).
  const TAP_AWAKE_SEC = 180 * 60;
  const freqRateByEnergy = (e) => (e > 80 ? 0.45 : e > 60 ? 0.52 : e > 40 ? 0.58 : e > 1 ? 0.66 : 1);
  const cookRecovery = (e) => (e > 80 ? 1 : e > 70 ? 2 : e > 60 ? 3 : e > 50 ? 4 : e > 40 ? 5 : e > 30 ? 6 : e > 20 ? 7 : e > 10 ? 8 : 9);
  const energyCache = new Map();
  function energySegments(natE, ownERB, teamERB, sleepScore, e4eCount = 3, e4eEnergy = 18) {
    const key = natE + '|' + (ownERB ? 1 : 0) + '|' + teamERB + '|' + sleepScore + '|' + e4eCount + '|' + e4eEnergy;
    const hit = energyCache.get(key);
    if (hit) return hit;
    const wakeMax = ownERB ? 105 : 100;
    const sleepMinutes = (sleepScore * 510) / 100;
    const sleepRecovery = Math.min(wakeMax, Math.round((sleepMinutes / 510) * 100) * natE * (1 + 0.14 * teamERB));
    const myRestore = e4eEnergy * natE;
    const sleepTime = 1440 - sleepMinutes;
    const ev = [{ m: 0, t: 'wake' }, { m: 120, t: 'cook' }, { m: 360, t: 'cook' }, { m: 720, t: 'cook' }];
    for (let i = 0; i < e4eCount; i++) ev.push({ m: Math.floor(((i + 1) * 930) / (e4eCount + 1) / 10) * 10, t: 'e4e' });
    ev.push({ m: sleepTime, t: 'sleep' }, { m: 1440, t: 'wake' });
    ev.sort((a, b) => a.m - b.m);
    const run = (initial) => {
      ev[0].after = initial;
      for (let i = 1; i < ev.length; i++) {
        const p = ev[i - 1], c = ev[i];
        c.before = Math.max(0, p.after - (c.m - p.m) / 10);
        let after = c.before;
        if (c.t === 'cook') after += cookRecovery(c.before);
        else if (c.t === 'e4e') after = Math.min(150, after + myRestore);
        else if (c.t === 'wake') after = Math.min(wakeMax, after + sleepRecovery);
        else { c.after = c.before; continue; }
        c.after = Math.ceil(after);
      }
      ev[0].before = ev[ev.length - 1].before;
    };
    run(sleepRecovery);
    run(ev[ev.length - 1].after);
    for (let i = 1; i < ev.length; i++) {
      const p = ev[i - 1], c = ev[i];
      if (p.after > 0 && p.after < (c.m - p.m) / 10) ev.splice(i, 0, { m: p.m + p.after * 10, t: 'empty', before: 0, after: 0 });
    }
    const segs = [];
    for (let i = 1; i < ev.length; i++) {
      let energy = ev[i - 1].after;
      let start = ev[i - 1].m;
      const cur = ev[i].m;
      for (;;) {
        if (energy <= 1) { energy = 0; break; }
        const th = energy <= 40 ? 1 : energy % 20 === 0 ? energy - 20 : Math.floor(energy / 20) * 20;
        const end = start + (energy - th) * 10;
        if (end > cur) break;
        segs.push({ start, end, rate: freqRateByEnergy(energy) });
        energy = th;
        start = end;
      }
      segs.push({ start, end: cur, rate: freqRateByEnergy(energy) });
    }
    for (let i = 0; i < segs.length - 1; i++) {
      if (segs[i].rate === segs[i + 1].rate) { segs[i].end = segs[i + 1].end; segs.splice(i + 1, 1); i--; }
    }
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.end <= sleepTime) { s.awake = true; continue; }
      if (s.start >= sleepTime) { s.awake = false; continue; }
      segs.splice(i + 1, 0, { start: sleepTime, end: s.end, rate: s.rate, awake: false });
      s.end = sleepTime;
      s.awake = true;
    }
    const r = { key, sleepTime, segs, timing: new Map(), wakeEnergy: ev[0].after, sleepEnergy: ev.find((x) => x.t === 'sleep').before };
    energyCache.set(key, r);
    return r;
  }

  // helps completed in each collection interval (whole helps, plus a fraction for the last interval)
  function nextHelpAt(segs, t, baseFreq) {
    const m = t / 60;
    let rate = 1;
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (s.start <= m && m < s.end) { rate = s.rate; break; } }
    return t + baseFreq * rate;
  }
  function helpsInInterval(segs, t0, baseFreq, interval) {
    const endTime = t0 + interval;
    let cur = t0, count = 0;
    for (;;) {
      const next = nextHelpAt(segs, cur, baseFreq);
      if (next <= endTime) { count++; cur = next; }
      if (next >= endTime) {
        const dur = next - cur;
        return { count, frac: dur === 0 ? 0 : (endTime - cur) / dur, overflow: next - endTime, elapsed: cur };
      }
    }
  }
  function helpsPerTap(segs, t0, baseFreq, tap, duration) {
    const endTime = t0 + duration;
    let segStart = t0, pending = 0, inProgStart = t0, tapEnd = t0 + tap;
    const out = [];
    for (;;) {
      const isLast = tapEnd >= endTime;
      const segEnd = isLast ? endTime : tapEnd;
      if (segStart > segEnd) {
        if (isLast) {
          const hd = segStart - inProgStart;
          const frac = hd > 0 ? (segEnd - inProgStart) / hd : 0;
          if (frac > 0) out.push(frac);
          break;
        }
        tapEnd += tap;
        continue;
      }
      const r = helpsInInterval(segs, segStart, baseFreq, segEnd - segStart);
      const count = pending + r.count;
      if (isLast) { const total = count + r.frac; if (total > 0) out.push(total); break; }
      inProgStart = r.elapsed;
      if (r.overflow > 0) { pending = 1; segStart = tapEnd + r.overflow; } else { pending = 0; segStart = tapEnd; }
      if (count > 0) out.push(count);
      tapEnd += tap;
    }
    return out;
  }
  // per energy profile, keyed by the base frequency
  function helpTiming(E, baseFreq, sleepScore) {
    let t = E.timing.get(baseFreq);
    if (t) return t;
    const sleepSec = (sleepScore * 510 * 60) / 100;
    const awakeSec = 1440 * 60 - sleepSec;
    t = baseFreq > 0
      ? { awake: helpsPerTap(E.segs, 0, baseFreq, TAP_AWAKE_SEC, awakeSec), asleep: sleepSec > 0 ? helpsPerTap(E.segs, awakeSec, baseFreq, sleepSec, sleepSec) : [] }
      : { awake: [], asleep: [] };
    if (E.timing.size > 2000) E.timing.clear();
    E.timing.set(baseFreq, t);
    return t;
  }

  // inventory: probability distribution of used slots after k helps, starting empty
  function makeSim(carry, bag) {
    const state = new Float64Array(Math.max(1, carry));
    state[0] = 1;
    return { carry, bag, state, full: [0], fullPre: [0], ingCnt: [0], ingStr: [0] };
  }
  function simStep(S) {
    const C = S.carry, cur = S.state, next = new Float64Array(Math.max(1, C)), bag = S.bag;
    let newFull = 0, nIngC = 0, nIngS = 0;
    for (let used = 0; used < C; used++) {
      const prob = cur[used];
      if (prob === 0) continue;
      for (let j = 0; j < bag.length; j++) {
        const u = bag[j];
        const tp = prob * u.p;
        let nu = used;
        if (u.berry) nu += u.count;
        else {
          const add = Math.min(u.count, C - used);
          nIngC += add * tp;
          nIngS += add * u.str * tp;
          nu += add;
        }
        if (nu < C) next[nu] += tp; else newFull += tp;
      }
    }
    S.state = next;
    const i = S.full.length;
    S.fullPre.push(S.fullPre[i - 1] + S.full[i - 1]);
    S.full.push(S.full[i - 1] + newFull);
    S.ingCnt.push(S.ingCnt[i - 1] + nIngC);
    S.ingStr.push(S.ingStr[i - 1] + nIngS);
  }
  // adds w x (expected result after n helps) into acc
  function simAdd(S, n, p, two, w, acc) {
    while (S.full.length <= n) simStep(S);
    const F = S.full;
    const sneaky = S.fullPre[n];
    let once = 0, twice = 0;
    const q = 1 - p;
    let qPrev = 1;
    for (let k = 1; k < n; k++) {
      const qk = qPrev * q;
      const prob = F[k] - F[k - 1];
      if (prob !== 0) {
        if (two) { const o = k * p * qPrev; once += prob * o; twice += prob * (1 - qk - o); }
        else once += prob * (1 - qk);
      }
      qPrev = qk;
    }
    if (n > 0) {
      const probN = 1 - F[n - 1];
      if (probN > 0) {
        const qn = qPrev * q;
        if (two) { const o = n * p * qPrev; once += probN * o; twice += probN * (1 - qn - o); }
        else once += probN * (1 - qn);
      }
    }
    acc.normal += w * (n - sneaky);
    acc.sneaky += w * sneaky;
    acc.ingCnt += w * S.ingCnt[n];
    acc.ingStr += w * S.ingStr[n];
    acc.skill += w * (once + 2 * (twice > 0 ? twice : 0));
  }
  // a fractional help count interpolates between the neighbouring whole counts
  function simAddAt(S, n, p, two, acc) {
    if (Number.isInteger(n)) { simAdd(S, n, p, two, 1, acc); return; }
    const lo = Math.floor(n), f = n - lo;
    simAdd(S, lo, p, two, 1 - f, acc);
    simAdd(S, lo + 1, p, two, f, acc);
  }
  function simFor(ctx, carry, ir, br, bc) {
    const key = (carry * 4 + bc) * 20000 + Math.round(ir * 10000);
    let S = ctx.sims.get(key);
    if (!S) {
      const each = ctx.ingSlots.length ? ir / ctx.ingSlots.length : 0;
      const bag = [{ berry: true, count: bc, p: br }].concat(ctx.ingSlots.map((s) => ({ berry: false, count: s.count, str: s.str, p: each })));
      S = makeSim(carry, bag);
      ctx.sims.set(key, S);
    }
    return S;
  }

  // ---------- daily value model ----------
  function pityRate(sp, rate) {
    if (rate <= 0) return 0;
    const n = sp.spec === 'S' || sp.spec === 'A' ? Math.ceil(142000 / sp.freq) : 78;
    return rate / (1 - (1 - rate) ** (n + 1));
  }
  function baseFrequency(sp, level, nature, tot, ribbon, hbCount) {
    const f = Math.min(tot.hs * 0.07 + 0.05 * hbCount, 0.35);
    return sp.freq * trunc(((501 - level) / 500) * natSpeed(nature) * ribbonSpeed(sp, ribbon) * (1 - f), 4);
  }
  // what the main skill brings per day: value = the skill's own unit (ingredients, energy, helps...),
  // str = strength. Per-trigger figures come from the reference calculator (ctx.skillTrig).
  const DISGUISE_RATE = 0.185;
  function skillOut(ctx, sl, natE, count, ownPerHelp) {
    const skill = ctx.sp.skill;
    const t = ctx.skillTrig ? ctx.skillTrig(sl) : null;
    if (!t) return { value: count * skillValue(skill, sl), str: 0 };
    if (/^Metronome|^Skill Copy/.test(skill)) return { value: count, str: count * t.str };
    if (skill === 'Charge Energy S') return { value: count * t.per * (natE / (t.natE || 1)), str: 0 };
    const avgPerHelp = (ownPerHelp + 4 * (ctx.teamPerHelp || 0)) / 5;
    if (skill === 'Helper Boost') { const v = count * t.per; return { value: v, str: v * avgPerHelp * 5 }; }
    if (skill === 'Extra Helpful S') { const v = count * t.per; return { value: v, str: v * avgPerHelp }; }
    if (skill === 'Energizing Cheer S (Heal Pulse)') return { value: count * t.per, str: count * t.per2 * avgPerHelp * 2 };
    if (skill === 'Berry Burst (Disguise)') { const s = t.per * count + t.per * (1 - (1 - DISGUISE_RATE) ** count) * 2; return { value: s, str: s }; }
    return { value: count * t.value, str: count * t.str };
  }

  // small per-context caches for the nature / sub skill dependent rates (numeric keys)
  const natIdx = (n, key) => (n && n.up === key ? 1 : n && n.down === key ? 2 : 0);
  function rates(ctx, nature, tot, hbCount) {
    const sp = ctx.sp;
    const kf = natIdx(nature, 'speed') * 64 + tot.hs * 2 + hbCount;
    let baseFreq = ctx.freqCache[kf];
    if (baseFreq === undefined) baseFreq = ctx.freqCache[kf] = baseFrequency(sp, ctx.level, nature, tot, ctx.ribbon || 0, hbCount);
    const ki = natIdx(nature, 'ing') * 16 + tot.ingf;
    let ir = ctx.irCache[ki];
    if (ir === undefined) ir = ctx.irCache[ki] = trunc((sp.ir / 100) * natIng(nature) * (1 + tot.ingf * 0.18), 4);
    const ks = natIdx(nature, 'skill') * 16 + tot.st;
    let p = ctx.srCache[ks];
    if (p === undefined) p = ctx.srCache[ks] = pityRate(sp, trunc((sp.sr / 100) * natSkill(nature) * (1 + tot.st * 0.18), 4));
    return { baseFreq, ir, p };
  }
  function energyFor(ctx, natE, ownERB, teamERB) {
    const k = natE * 100 + (ownERB ? 10 : 0) + teamERB;
    let E = ctx.eCache.get(k);
    if (!E) { E = energySegments(natE, ownERB, teamERB, ctx.sleepScore, ctx.e4eCount, ctx.e4eEnergy); ctx.eCache.set(k, E); }
    return E;
  }
  const ACC = { normal: 0, sneaky: 0, ingCnt: 0, ingStr: 0, skill: 0 };
  /** fills `out` with one day's results; ctx: {sp, level, skillLevelBase, slots, carryBase, ribbon, sleepScore, fieldBonus, e4eCount, e4eEnergy, skillTrig, teamPerHelp, maxSkill}
   *  maxSkill: the main skill is assumed to be at its max level (raised with Main Skill Seeds), so Skill Level Up has no effect */
  function core(ctx, nature, tot, hbCount, teamERB, out) {
    const sp = ctx.sp, level = ctx.level;
    const { baseFreq, ir, p } = rates(ctx, nature, tot, hbCount);
    const natE = natEnergy(nature);
    const br = ir > 0 ? 1 - ir : 0;
    const bc = berryCount(sp, tot);
    const carry = ctx.carryBase + 6 * tot.inv;
    const sl = ctx.maxSkill ? maxSkillLevel(sp.skill) : effSkillLevel(sp, ctx.skillLevelBase, tot);
    const E = energyFor(ctx, natE, tot.erb > 0, teamERB);
    const T = helpTiming(E, baseFreq, ctx.sleepScore);
    const S = simFor(ctx, carry, ir, br, bc);
    const two = sp.spec === 'S' || sp.spec === 'A';
    const a = ACC;
    a.normal = 0; a.sneaky = 0; a.ingCnt = 0; a.ingStr = 0; a.skill = 0;
    let helpsAwake = 0, helpsAsleep = 0;
    for (let i = 0; i < T.awake.length; i++) { simAddAt(S, T.awake[i], p, two, a); helpsAwake += T.awake[i]; }
    const awakeSkills = a.skill, awakeSneaky = a.sneaky;
    for (let i = 0; i < T.asleep.length; i++) { simAddAt(S, T.asleep[i], p, two, a); helpsAsleep += T.asleep[i]; }
    const berries = a.normal * br * bc + a.sneaky * bc;
    const vBerry = berryStrengthField(sp.type, level, ctx.fieldBonus) * berries;
    const vIng = a.ingStr * ING_FACTOR * (1 + (ctx.fieldBonus || 0) / 100);
    const helps = helpsAwake + helpsAsleep;
    const so = skillOut(ctx, sl, natE, a.skill, helps > 0 ? (vBerry + vIng) / helps : 0);
    out.total = vBerry + vIng + so.str;
    out.vBerry = vBerry; out.vIng = vIng; out.vSkill = so.value; out.vSkillStr = so.str;
    out.helps = helps; out.helpsAwake = helpsAwake; out.helpsAsleep = helpsAsleep;
    out.berries = berries; out.ings = a.ingCnt; out.skills = a.skill; out.nightSkills = a.skill - awakeSkills;
    out.freq = baseFreq; out.ir = ir; out.sr = p; out.bc = bc; out.carry = carry;
    out.overflowHelps = a.sneaky; out.nightOverflow = a.sneaky - awakeSneaky; out.skillLevel = sl;
    return out;
  }
  const EMPTY_TOT = sumSubs([]);
  function dailyOwn(ctx, nature, tot, hbCount, teamERB) {
    const own = core(ctx, nature, tot, hbCount, teamERB, {});
    own.tot = tot;
    return own;
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
    ctx.sims = new Map();
    ctx.eCache = new Map();
    ctx.freqCache = [];
    ctx.irCache = [];
    ctx.srCache = [];
    // ingredient slots open at this level (the first one always counts, as in the reference calculator)
    const open = ctx.level < 30 ? 1 : ctx.level < 60 ? 2 : 3;
    ctx.ingSlots = [];
    for (let i = 0; i < open; i++) {
      const s = ctx.slots && ctx.slots[i];
      if (i === 0 || (s && s.count > 0)) ctx.ingSlots.push({ count: s ? s.count : 0, str: s ? ING_STRENGTH[s.name] || 0 : 0 });
    }
    // per-trigger skill figures, memoized per skill level (provided by the reference calculator when available)
    const trigMemo = new Map();
    const fn = opts.skillTrigger;
    ctx.skillTrig = fn ? (sl) => {
      if (!trigMemo.has(sl)) { let v = null; try { v = fn(ctx.level, sl) || null; } catch { v = null; } trigMemo.set(sl, v); }
      return trigMemo.get(sl);
    } : null;
    ctx.teamPerHelp = opts.teamPerHelp || 0;
    // team-effect baselines: 4 teammates assumed to be this species with neutral nature, no sub skills
    // (Energy Recovery Bonus has no team effect here, as in the reference calculator)
    const b0 = dailyOwn(ctx, NEUTRAL, EMPTY_TOT, 0, 0);
    const bHB = dailyOwn(ctx, NEUTRAL, EMPTY_TOT, 1, 0);
    ctx.team = {
      hb: {
        role: 4 * Math.max(0, roleOf(sp, bHB) - roleOf(sp, b0)),
        // the reference calculator values Helping Bonus with a fixed teammate (Raichu Lv60)
        str: opts.teamHBStr != null ? opts.teamHBStr : 4 * Math.max(0, bHB.total - b0.total),
      },
    };
    return ctx;
  }
  function value(ctx, nature, subs) { return valueTot(ctx, nature, sumSubs(subs)); }
  function valueTot(ctx, nature, tot) {
    // the Pokémon's own Helping Bonus speeds itself up; its own Energy Recovery Bonus only raises its wake-up cap
    const own = dailyOwn(ctx, nature, tot, tot.hb ? 1 : 0, 0);
    const T = ctx.team;
    own.teamRole = tot.hb ? T.hb.role : 0;
    own.teamStr = tot.hb ? T.hb.str : 0;
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
      ctx.sleepScore, ctx.fieldBonus, ctx.e4eCount, ctx.e4eEnergy, Math.round(ctx.team.hb.str), Math.round(ctx.teamPerHelp), ctx.skillTrig ? 'fx' : 'sp', ctx.maxSkill ? 'max' : 'cur'].join('|');
    if (distCache.has(key)) return distCache.get(key);
    const k = activeCount(level);
    const sigs = signatures(k);
    const role = [], str = [];
    const natures = naturesFor(ctx.sp);
    const T = ctx.team, o = {};
    for (const n of natures) {
      for (const g of sigs) {
        core(ctx, n, g.tot, g.tot.hb ? 1 : 0, 0, o);
        const hb = g.tot.hb > 0;
        role.push({ v: roleOf(ctx.sp, o) + (hb ? T.hb.role : 0), w: g.w, nature: n, subs: g.subs });
        str.push({ v: o.total + (hb ? T.hb.str : 0), w: g.w, nature: n, subs: g.subs });
      }
    }
    const r = { role: makeDist(role), str: makeDist(str), n: natures.length * choose(SUBSKILLS.length, k), k, natureCount: natures.length };
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

  // ---------- ideal ratio (the approach of だいふく's 個体値チェッカー) ----------
  // Reproduces that checker's published results (fitted on several hundred of its answers; the formula itself
  // is not published). One day is counted with a constant helping speed (energy assumed full: x0.45), items
  // collected often while awake (15.5 h) and not at all while asleep (8.5 h): once the inventory is full at
  // night, helps bring berries only, and at most 2 skills are kept until morning.
  // Three scores compare the individual with a fixed reference individual of the same Pokémon and level
  // (100%): berries vs. さみしがり + きのみの数S・おてつだいスピードM・おてつだいスピードS・おてつだいボーナス,
  // ingredients vs. うっかりや + 食材確率アップM・S・おてつだいスピードM・S, skill triggers vs. なまいき +
  // スキル確率アップM・S・おてつだいスピードM・S (as many sub skills as are open at that level).
  // The ideal ratio is their weighted sum for the Pokémon's specialty pattern (9 patterns), plus points for
  // おてつだいボーナス (12, or 2.4 when an ingredient / skill specialist brings less than a れいせい / なまいき
  // individual), きのみの数S for ⑦ (11), スキルレベルアップ's seed saving (M, S = half), 睡眠EXPボーナス (3),
  // げんき回復ボーナス (1) and EXP natures (+1 / -1).
  const D_RANKS = ['増田', 'SS', 'S', 'A', 'B', 'C', 'D'];
  // lower bounds (%) of 増田 / SS / S / A / B / C; below the last one is D
  const D_TABLE = {
    60: {
      B: [100, 90, 77, 65, 50, 45], BI: [115, 103, 88, 74, 57, 51], BS: [115, 103, 88, 74, 57, 51],
      IB: [94, 83, 67, 61, 56, 50], I: [84, 74, 60, 54, 50, 45], IS: [94, 83, 67, 61, 56, 50],
      SB: [92.4, 81.4, 66, 59.4, 55, 49.5], SI: [84, 74, 60, 54, 50, 45], S: [84, 74, 60, 54, 50, 45],
    },
    70: {
      B: [95, 85, 72, 60, 45, 40], BI: [105, 95, 82, 70, 55, 50], BS: [105, 95, 82, 70, 55, 50],
      IB: [92, 81, 65, 59, 54, 48], I: [84, 74, 60, 54, 50, 45], IS: [92, 81, 65, 59, 54, 48],
      SB: [92.4, 81.4, 66, 59.4, 55, 49.5], SI: [84, 74, 60, 54, 50, 45], S: [84, 74, 60, 54, 50, 45],
    },
  };
  const D_TRIBES = {
    B: ['①', 'きのみ得意'], BI: ['②', '食材型きのみ得意'], BS: ['③', 'スキル型きのみ得意'],
    IB: ['④', 'きのみ型食材得意'], I: ['⑤', '食材得意'], IS: ['⑥', 'スキル型食材得意'],
    SB: ['⑦', 'きのみ型スキル得意'], SI: ['⑧', '食材型スキル得意'], S: ['⑨', 'スキル得意'],
  };
  // weights of the berry / ingredient / skill scores (② and ⑧ have no Pokémon now; theirs are guesses)
  const D_W = {
    B: [0.9, 0.01, 0.09], BI: [0.9, 0.21, 0.09], BS: [0.9, 0.09, 0.21], IB: [0.4, 0.7, 0.1], I: [0.2, 0.7, 0.1],
    IS: [0.2, 0.7, 0.3], SB: [0.3, 0.2, 0.7], SI: [0.1, 0.4, 0.7], S: [0.1, 0.2, 0.7],
  };
  // points for スキルレベルアップM (S: half) as Main Skill Seed saving
  const D_GOLD = { B: 3, BI: 3, BS: 5, IB: 3, I: 3, IS: 5, SB: 5, SI: 10, S: 10 };
  // the specialty pattern of each final form, as the checker shows it
  const D_TRIBE_OF = (() => {
    const t = {
    B: ["Altaria", "Arbok", "Banette", "Blaziken", "Butterfree", "Dodrio", "Eevee (Holiday)", "Empoleon", "Feraligatr", "Houndoom", "Marowak", "Meganium", "Onix", "Pikachu (Captain)", "Pikachu (Halloween)", "Primeape", "Raichu", "Raticate", "Salamence", "Steelix", "Tinkaton", "Typhlosion", "Tyrantrum", "Walrein", "Xatu"],
    BS: ["Clefable", "Musharna", "Ninetales", "Ninetales (Alola)", "Slaking", "Swampert", "Vigoroth", "Weavile"],
    I: ["Abomasnow", "Absol", "Amoonguss", "Bewear", "Blastoise", "Blissey", "Cetitan", "Charizard", "Clodsire", "Delibird", "Ditto", "Dragonite", "Dugtrio", "Farfetch'd", "Flygon", "Gengar", "Golem", "Gourgeist (Jumbo)", "Gourgeist (Large)", "Gourgeist (Medium)", "Gourgeist (Small)", "Kangaskhan", "Luxray", "Mr. Mime", "Pinsir", "Quagsire", "Quaquaval", "Ribombee", "Skeledirge", "Toxicroak", "Tyranitar", "Venusaur", "Victreebel", "Vikavolt"],
    IB: ["Aggron", "Meowscarada"],
    IS: ["Comfey", "Cramorant", "Drampa", "Mawile", "Spiritomb"],
    S: ["Ampharos", "Arcanine", "Cresselia", "Crustle", "Darkrai", "Dedenne", "Drifblim", "Eevee (Halloween)", "Entei", "Espeon", "Flareon", "Gallade", "Gardevoir", "Glaceon", "Golduck", "Hawlucha", "Heracross", "Honchkrow", "Jolteon", "Leafeon", "Lucario", "Magnezone", "Mew", "Mewtwo", "Minun", "Pawmot", "Persian", "Pikachu (Holiday)", "Plusle", "Raikou", "Sableye", "Sandslash", "Shuckle", "Slowbro", "Slowking", "Spheal (Holiday)", "Sudowoodo", "Suicune", "Swalot", "Sylveon", "Togedemaru", "Togekiss", "Torterra", "Toxtricity (Amped)", "Toxtricity (Low Key)", "Umbreon", "Vaporeon", "Wigglytuff", "Wobbuffet"],
    SB: ["Braviary", "Infernape", "Latias", "Latios", "Mimikyu", "Noivern", "Sceptile"],
  };
    const m = {};
    for (const [k, list] of Object.entries(t)) for (const en of list) m[en] = k;
    return m;
  })();
  const D_REF = {
    k: { nature: 'さみしがり', subs: ['BFS', 'HSM', 'HSS', 'HB'] },
    f: { nature: 'うっかりや', subs: ['IFM', 'IFS', 'HSM', 'HSS'] },
    s: { nature: 'なまいき', subs: ['STM', 'STS', 'HSM', 'HSS'] },
  };
  // patterns picked for Pokémon the checker has not classified yet, by evolution line ({ anc: tribe })
  let TRIBE_PICK = {};
  function setTribePicks(m) { TRIBE_PICK = Object.assign({}, m || {}); dSpreadCache.clear(); }
  /** whether the checker has classified this Pokémon (or its final form) */
  function isClassified(sp) {
    return !!(D_TRIBE_OF[sp.en] || SPECIES.some((x) => x.anc === sp.anc && x.el === 0 && D_TRIBE_OF[x.en]));
  }
  function dTribe(sp) {
    if (D_TRIBE_OF[sp.en]) return D_TRIBE_OF[sp.en];
    // a pre-evolution: the pattern of its final form
    const fin = SPECIES.find((x) => x.anc === sp.anc && x.el === 0 && D_TRIBE_OF[x.en]);
    if (fin) return D_TRIBE_OF[fin.en];
    const pick = TRIBE_PICK[sp.anc];
    if (pick && D_W[pick] && pick[0] === (sp.spec === 'A' ? 'S' : sp.spec)) return pick;
    return sp.spec === 'B' ? 'B' : sp.spec === 'I' ? 'I' : 'S';
  }
  // one day under the checker's model
  function dDay(ctx, nature, tot, hbSelf = true) {
    const sp = ctx.sp, level = ctx.level;
    const f = Math.min(tot.hs * 0.07 + (tot.hb && hbSelf ? 0.05 : 0), 0.35);
    const helpTime = sp.freq * trunc(((501 - level) / 500) * natSpeed(nature) * (1 - f), 4);
    if (!(helpTime > 0)) return { berries: 0, ings: 0, skills: 0 };
    const iv = helpTime * 0.45;
    const Hd = 55800 / iv, Hn = 30600 / iv;
    const pi = trunc((sp.ir / 100) * natIng(nature) * (1 + tot.ingf * 0.18), 4);
    const ps = trunc((sp.sr / 100) * natSkill(nature) * (1 + tot.st * 0.18), 4);
    const bc = berryCount(sp, tot);
    const avg = ctx.dAvgIng;
    const u = (1 - pi) * bc + pi * avg;
    const carry = sp.carry + 5 * Math.max(0, sp.ev) + 6 * tot.inv;
    const sneaky = u > 0 ? Math.max(0, Hn - carry / u) : 0;
    const normal = Hd + Hn - sneaky;
    return { berries: normal * (1 - pi) * bc + sneaky * bc, ings: normal * pi * avg, skills: Hd * ps + Math.min((Hn - sneaky) * ps, 2) };
  }
  function dRefs(ctx) {
    if (ctx.dRefs) return ctx.dRefs;
    const open = UNLOCK.filter((u) => ctx.level >= u).length;
    const q = (key, field) => {
      const r = D_REF[key];
      return dDay(ctx, NATURE_BY_JA[r.nature], sumSubs(r.subs.slice(0, open).map((k) => SUB_BY_K[k])))[field];
    };
    ctx.dRefs = { k: q('k', 'berries'), f: q('f', 'ings'), s: q('s', 'skills'), open };
    return ctx.dRefs;
  }
  function dScore(ctx, nature, subs, tribe) {
    const tot = sumSubs(subs);
    const me = dDay(ctx, nature, tot);
    const R = dRefs(ctx);
    const k = R.k > 0 ? (me.berries / R.k) * 100 : 0;
    const f = R.f > 0 ? (me.ings / R.f) * 100 : 0;
    const s = R.s > 0 ? (me.skills / R.s) * 100 : 0;
    const w = D_W[tribe];
    const parts = { hb: 0, bfs: 0, gold: 0, side: 0, exp: 0 };
    let hbCut = false;
    if (tot.hb) {
      let ok = true;
      if (tribe[0] !== 'B') {
        const role = tribe[0] === 'I' ? 'ings' : 'skills';
        const val = dDay(ctx, nature, tot, false)[role];
        const thr = dDay(ctx, NATURE_BY_JA[role === 'ings' ? 'れいせい' : 'なまいき'], EMPTY_TOT)[role];
        ok = val >= thr - 1e-9;
      }
      parts.hb = ok ? 12 : 2.4;
      hbCut = !ok;
    }
    if (tribe === 'SB' && tot.bfs) parts.bfs = 11;
    if (!ctx.maxSkill) parts.gold = (D_GOLD[tribe] * tot.slu) / 2;
    if (subs.some((x) => x.k === 'SEB')) parts.side += 3;
    if (subs.some((x) => x.k === 'ERB')) parts.side += 1;
    parts.exp = nature && nature.up === 'exp' ? 1 : nature && nature.down === 'exp' ? -1 : 0;
    const pct = w[0] * k + w[1] * f + w[2] * s + parts.hb + parts.bfs + parts.gold + parts.side + parts.exp;
    return { pct, k, f, s, parts, hbCut };
  }
  function dRank(pct, tribe, level) {
    const t = D_TABLE[level >= 70 ? 70 : 60][tribe] || D_TABLE[60].S;
    for (let i = 0; i < t.length; i++) if (pct >= t[i] - 1e-9) return D_RANKS[i];
    return 'D';
  }
  // average ingredient count per ingredient help over the slots open at ctx.level
  function dAvg(ctx) {
    if (ctx.dAvgIng == null) {
      const n = ctx.level < 30 ? 1 : ctx.level < 60 ? 2 : 3;
      const c = (ctx.slots || []).slice(0, n).filter((x) => x && x.count > 0).map((x) => x.count);
      ctx.dAvgIng = c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0;
    }
    return ctx.dAvgIng;
  }
  /** the checker's ideal ratio of an individual at ctx.level; items: what the nature and each sub skill add (points) */
  function idealRatio(ctx, nature, subs) {
    dAvg(ctx);
    const tribe = dTribe(ctx.sp);
    const me = dScore(ctx, nature, subs, tribe);
    const items = [{ nature, pt: me.pct - dScore(ctx, NEUTRAL, subs, tribe).pct }]
      .concat(subs.map((x) => ({ sub: x, pt: me.pct - dScore(ctx, nature, subs.filter((y) => y !== x), tribe).pct, hbCut: !!(x.hb && me.hbCut) })));
    const table = ctx.level >= 70 ? 70 : 60;
    const open = dRefs(ctx).open;
    const refs = Object.fromEntries(Object.entries(D_REF).map(([key, r]) => [key, { nature: NATURE_BY_JA[r.nature], subs: r.subs.slice(0, open).map((k) => SUB_BY_K[k]) }]));
    return {
      pct: me.pct, rank: dRank(me.pct, tribe, ctx.level), tribe, tribeNo: D_TRIBES[tribe][0], tribeJa: D_TRIBES[tribe][1],
      table, bounds: D_TABLE[table][tribe], weights: D_W[tribe], k: me.k, f: me.f, s: me.s, parts: me.parts, hbCut: me.hbCut,
      items, refs, std: dScore(ctx, NEUTRAL, [], tribe).pct,
    };
  }

  // ---------- where an ideal ratio stands among every combination ----------
  // Every nature x every set of the sub skills open at the level (order not distinguished), as in the 上位○% figure.
  // ゆめのかけらボーナス and リサーチEXPボーナス do not change the checker's score; every other sub skill can.
  const D_NULL = SUBSKILLS.filter((x) => x.k === 'DSB' || x.k === 'REB');
  const D_EFF = SUBSKILLS.filter((x) => !D_NULL.includes(x));
  const dSigCache = new Map();
  function dSignatures(k) {
    // the k-sets of sub skills grouped by what the score depends on, with how many sets each group holds
    if (dSigCache.has(k)) return dSigCache.get(k);
    const map = new Map();
    for (let m = Math.max(0, k - D_NULL.length); m <= Math.min(k, D_EFF.length); m++) {
      const mult = choose(D_NULL.length, k - m);
      combinations(D_EFF.length, m, (idx) => {
        const subs = idx.map((i) => D_EFF[i]);
        const t = sumSubs(subs);
        const sig = [t.hs, t.ingf, t.st, t.inv, t.slu, t.bfs, t.hb, t.erb, subs.some((x) => x.k === 'SEB') ? 1 : 0].join(',');
        const e = map.get(sig);
        if (e) e.w += mult; else map.set(sig, { w: mult, subs });
      });
    }
    const list = [...map.values()];
    dSigCache.set(k, list);
    return list;
  }
  const dSpreadCache = new Map();
  function idealSpread(ctx) {
    const key = [ctx.sp.idx, ctx.level, dAvg(ctx), ctx.maxSkill ? 'max' : 'cur', dTribe(ctx.sp)].join('|');
    if (dSpreadCache.has(key)) return dSpreadCache.get(key);
    const tribe = dTribe(ctx.sp);
    const vals = [], ws = [];
    for (const n of naturesFor(ctx.sp)) {
      for (const g of dSignatures(activeCount(ctx.level))) { vals.push(dScore(ctx, n, g.subs, tribe).pct); ws.push(g.w); }
    }
    const order = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a]); // best first
    const v = new Float64Array(order.length), cum = new Float64Array(order.length);
    let c = 0;
    order.forEach((i, j) => { v[j] = vals[i]; c += ws[i]; cum[j] = c; });
    const r = { v, cum, total: c, tribe };
    dSpreadCache.set(key, r);
    if (dSpreadCache.size > 40) dSpreadCache.delete(dSpreadCache.keys().next().value);
    return r;
  }
  // how many combinations score above x (ties excluded) / at least x (the bound test of dRank)
  function dCountAbove(D, x) {
    let lo = 0, hi = D.v.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (D.v[m] > x + 1e-9) lo = m + 1; else hi = m; }
    return lo ? D.cum[lo - 1] : 0;
  }
  function dCountAtLeast(D, x) {
    let lo = 0, hi = D.v.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (D.v[m] >= x - 1e-9) lo = m + 1; else hi = m; }
    return lo ? D.cum[lo - 1] : 0;
  }
  /** the place of an ideal ratio among all combinations and inside its rank (ties share a place), and each rank's size */
  function idealStanding(ctx, pct) {
    const D = idealSpread(ctx);
    const bounds = D_TABLE[ctx.level >= 70 ? 70 : 60][D.tribe] || D_TABLE[60].S;
    // combinations at or above each rank's lower bound (増田, SS, S, A, B, C, then all for D)
    const upTo = bounds.map((b) => dCountAtLeast(D, b)).concat([D.total]);
    const counts = Object.fromEntries(D_RANKS.map((r, i) => [r, upTo[i] - (i ? upTo[i - 1] : 0)]));
    const rank = dRank(pct, D.tribe, ctx.level);
    const i = D_RANKS.indexOf(rank);
    const above = dCountAbove(D, pct);
    return { rank, total: D.total, place: above + 1, placeInRank: above - (i ? upTo[i - 1] : 0) + 1, inRank: counts[rank], counts };
  }
  /** the ideal ratio and rank alone, for lists: the same figures as evaluate(ind, level).ideal, without the energy
   *  simulation (the checker's score needs only the species, level, ingredients and the skill setting) */
  function idealQuick(ind, level) {
    const ctx = { sp: ind.sp, level, slots: ind.slots, maxSkill: !!(ind.env && ind.env.maxSkill) };
    const r = idealRatio(ctx, ind.nature, activeSubs(ind.subs, level));
    return { pct: r.pct, rank: r.rank, tribe: r.tribe };
  }

  // ---------- place among all individuals (rank X of N, and the chance of catching one at least as good) ----------
  // One day = 24 hours of helping with items collected often and energy kept at 80% or more (help time x0.45), so
  // only the helping speed and the specialty's own rate count. A "class" is the set of sub skills that change the
  // specialty's daily amount, with the nature's effect on it; every other sub skill counts as "-".
  const RANK_SUBS = {
    S: ['HB', 'HSM', 'HSS', 'STM', 'STS'],
    I: ['HB', 'HSM', 'HSS', 'IFM', 'IFS'],
    B: ['HB', 'HSM', 'HSS', 'BFS', 'IFM', 'IFS'],
    A: ['HB', 'HSM', 'HSS', 'BFS', 'IFM', 'IFS', 'STM', 'STS'],
  };
  const RANK_EFFECTS = { S: ['speed', 'skill'], I: ['speed', 'ing'], B: ['speed', 'ing'], A: ['speed', 'ing', 'skill'] };
  /** the amount a class brings in a day: skills (S), ingredients (I), berries (B) or energy (A)
   *  o: {level, ribbon, hbSelf, otherHB, slots, skillStr} */
  function rankAmount(sp, o, nature, tot) {
    const f = Math.min(tot.hs * 0.07 + (tot.hb ? o.hbSelf : 0) + 0.05 * (o.otherHB || 0), 0.35);
    const freq = sp.freq * ftrunc4(((501 - o.level) / 500) * natSpeed(nature) * ribbonSpeed(sp, o.ribbon || 0) * (1 - f));
    const helps = 86400 / (freq * 0.45);
    const ir = ingRate(sp, nature, tot);
    if (sp.spec === 'S') return helps * pityRate(sp, skillRate(sp, nature, tot));
    if (sp.spec === 'B') return helps * (1 - ir) * berryCount(sp, tot);
    const open = o.level < 30 ? 1 : o.level < 60 ? 2 : 3;
    const slots = (o.slots || []).slice(0, open).filter((s) => s && s.count > 0);
    if (sp.spec === 'I') return slots.length ? helps * ir * slots.reduce((a, s) => a + s.count, 0) / slots.length : 0;
    const ingStr = slots.length ? slots.reduce((a, s) => a + (ING_STRENGTH[s.name] || 0) * s.count, 0) / slots.length : 0;
    const skills = helps * pityRate(sp, skillRate(sp, nature, tot));
    return helps * ((1 - ir) * berryCount(sp, tot) * berryStrength(sp.type, o.level) + ir * ingStr * ING_FACTOR) + skills * (o.skillStr || 0);
  }
  // nature classes: the effect raised and the effect lowered among the ones that count ('o' = any other), with
  // the share of natures in each
  function natureClasses(effects, natures) {
    const keys = effects.concat(['o']);
    const of = (e) => (effects.includes(e) ? e : 'o');
    const out = [];
    for (const u of keys) for (const d of keys) {
      if (u === d && u !== 'o') continue;
      const n = natures.filter((x) => of(x.up) === u && of(x.down) === d).length;
      if (n) out.push({ up: u, down: d, p: n / natures.length, rep: { up: u === 'o' ? null : u, down: d === 'o' ? null : d } });
    }
    return out;
  }
  // Sub skill draw: each slot picks a color (white 53%, blue 33%, gold 14%; a gold-guaranteed slot is gold), then
  // one sub skill of that color the Pokémon does not have yet, all equally likely.
  const DRAW_COLOR = { white: 0.53, blue: 0.33, gold: 0.14 };
  const COLOR_SUBS = { white: [], blue: [], gold: [] };
  SUBSKILLS.forEach((s) => COLOR_SUBS[s.r].push(s.i));
  const subDistCache = new Map();
  /** [mask, chance] for every set of sub skills after k slots (mask: bits of SUBSKILLS); goldMask: slots that are gold */
  function subDist(k, goldMask) {
    const key = k + '|' + goldMask;
    if (subDistCache.has(key)) return subDistCache.get(key);
    let cur = new Map([[0, 1]]);
    for (let slot = 0; slot < k; slot++) {
      const next = new Map();
      const colors = goldMask & (1 << slot) ? ['gold'] : ['white', 'blue', 'gold'];
      for (const [mask, p] of cur) {
        const free = {};
        let tot = 0;
        for (const c of colors) { free[c] = COLOR_SUBS[c].filter((i) => !(mask & (1 << i))); if (free[c].length) tot += DRAW_COLOR[c]; }
        if (!tot) continue;
        for (const c of colors) {
          if (!free[c].length) continue;
          const each = (p * DRAW_COLOR[c]) / tot / free[c].length;
          for (const i of free[c]) { const m = mask | (1 << i); next.set(m, (next.get(m) || 0) + each); }
        }
      }
      cur = next;
    }
    const arr = [...cur];
    subDistCache.set(key, arr);
    return arr;
  }
  // Sub Skill Seeds raise a sub skill one step (S to M) when the Pokémon does not have that M yet; with enough of
  // them, every such sub skill ends up raised.
  const SEED_UP = [['HSS', 'HSM'], ['STS', 'STM'], ['IFS', 'IFM'], ['INS', 'INM'], ['INM', 'INL'], ['SLS', 'SLM']];
  function seedAll(mask) {
    let m = mask;
    for (const [a, b] of SEED_UP) {
      const ia = SUB_BY_K[a].i, ib = SUB_BY_K[b].i;
      if (m & (1 << ia) && !(m & (1 << ib))) m = (m & ~(1 << ia)) | (1 << ib);
    }
    return m;
  }
  // Friend medals: bronze makes slot 1 (Lv10) gold, silver slot 2 (Lv25, can be turned off), gold slot 3 (Lv50, can
  // be turned off). The friend levels for the three medals depend on the Pokémon.
  const MEDAL_STEPS = [[10, 40, 100], [10, 30, 60], [10, 25, 50], [10, 20, 40]];
  const MEDAL_GROUPS = [
    'フシギダネ ヒトカゲ ゼニガメ キャタピー トランセル コラッタ アーボ ピカチュウ サンド ピッピ ロコン プリン ディグダ ニャース コダック マンキー ガーディ マダツボミ イシツブテ ヤドン コイル ドードー ゴース カラカラ イーブイ ミニリュウ チコリータ ヒノアラシ ワニノコ ピチュー ピィ ププリン トゲピー ネイティ メリープ ウソッキー ウパー ソーナンス デルビル ヨーギラス キモリ アチャモ ミズゴロウ ラルトス ナマケロ ココドラ ゴクリン ナックラー チルット カゲボウズ ソーナノ タマザラシ タツベイ ナエトル ヒコザル ポッチャマ コリンク フワンテ ウソハチ マネネ ピンプク リオル グレッグル ユキカブリ ムンナ イシズマイ タマゲタケ ワシボン チゴラス バケッチャ オンバット アゴジムシ アブリー ヌイコグマ エレズン ニャオハ ホゲータ クワッス パモ カヌチャン アルクジラ',
    'フシギソウ リザード カメール ラッタ アーボック サンドパン ダグトリオ ペルシアン ゴルダック オコリザル ウツドン ゴローン ヤドラン レアコイル ドードリオ ゴースト ガラガラ バリヤード ハクリュー ベイリーフ マグマラシ アリゲイツ トゲチック ネイティオ モココ ヌオー ヘルガー サナギラス ジュプトル ワカシャモ ヌマクロー キルリア ヤルキモノ コドラ マルノーム ビブラーバ チルタリス トドグラー コモルー ハヤシガメ モウカザル ポッタイシ ルクシオ フワライド ドクロッグ ユキノオー イワパレス モロバレル ウォーグル オンバーン デンヂムシ アブリボン キテルグマ ニャローテ アチゲータ ウェルカモ パモット ナカヌチャン ドオー',
    'プクリン カモネギ イワーク ラッキー ガルーラ カイロス メタモン ヤミカラス ムウマ ツボツボ ヘラクロス ニューラ デリバード ヤミラミ クチート ジュペッタ アブソル ミカルゲ ルチャブル デデンネ キュワワー トゲデマル ミミッキュ ジジーロン ウッウ',
    'フシギバナ リザードン カメックス ピクシー キュウコン ウインディ ウツボット ゴローニャ ゲンガー シャワーズ サンダース ブースター カイリュー ミュウツー ミュウ メガニウム バクフーン オーダイル デンリュウ エーフィ ブラッキー ヤドキング ハガネール ハピナス ライコウ エンテイ スイクン バンギラス ジュカイン バシャーモ ラグラージ サーナイト ケッキング ボスゴドラ フライゴン トドゼルガ ボーマンダ ラティアス ラティオス ドダイトス ゴウカザル エンペルト レントラー ムウマージ ドンカラス ルカリオ マニューラ ジバコイル トゲキッス リーフィア グレイシア エルレイド クレセリア ダークライ ムシャーナ ガチゴラス ニンフィア パンプジン クワガノン ストリンダー マスカーニャ ラウドボーン ウェーニバル パーモット デカヌチャン ハルクジラ',
  ];
  const MEDAL_OF = {};
  MEDAL_GROUPS.forEach((names, g) => names.split(' ').forEach((n) => { if (!(n in MEDAL_OF)) MEDAL_OF[n] = g; }));
  /** the friend levels of the three medals: {steps, known} (unknown Pokémon: guessed from the evolution stage) */
  function medalSteps(sp) {
    const g = MEDAL_OF[String(sp.ja).replace(/\s*[（(].*$/, '')];
    if (g != null) return { steps: MEDAL_STEPS[g], known: true };
    return { steps: MEDAL_STEPS[sp.el > 0 ? (sp.ev > 0 ? 1 : 0) : sp.ev > 0 ? 3 : 2], known: false };
  }
  /** Where an individual stands among all the classes of its Pokémon, and the chance that a new one is at least as good.
   *  o: {level (60/70/80), ribbon, hbSelf (0.25: Helping Bonus valued with its whole team effect, 0.05: own speed only),
   *      otherHB (other Helping Bonus in the team), seeds (Sub Skill Seeds raise S to M), slots, skillStr, friendLevel,
   *      medalSp (the species befriended, for its medals; defaults to sp)} */
  function rankStanding(sp, nature, subs, o) {
    const keys = RANK_SUBS[sp.spec];
    if (!keys || !sp.supported) return null;
    const effects = RANK_EFFECTS[sp.spec];
    const R = keys.map((key) => SUB_BY_K[key]);
    const k = activeCount(o.level);
    const ncls = natureClasses(effects, naturesFor(sp));
    const n = 1 << R.length;
    const amount = [];
    for (let m = 0; m < n; m++) {
      const tot = sumSubs(R.filter((_, j) => m & (1 << j)));
      amount.push(ncls.map((c) => rankAmount(sp, o, c.rep, tot)));
    }
    const toR = (mask) => { let m = 0; R.forEach((s, j) => { if (mask & (1 << s.i)) m |= 1 << j; }); return m; };
    // the individual's own class: its open sub skills (with seeds, every S that can become M has)
    const open = activeSubs(subs, o.level);
    let own = 0;
    open.forEach((s) => { own |= 1 << s.i; });
    const raised = o.seeds ? seedAll(own) : own;
    const myM = toR(raised);
    const of = (e) => (effects.includes(e) ? e : 'o');
    const myC = Math.max(0, ncls.findIndex((c) => c.up === of(nature && nature.up) && c.down === of(nature && nature.down)));
    const mine = amount[myM][myC];
    const atLeast = (v) => v >= mine * (1 - 1e-9) - 1e-12;
    let rank = 0;
    for (let m = 0; m < n; m++) for (let c = 0; c < ncls.length; c++) if (atLeast(amount[m][c])) rank++;
    // per set of counted sub skills: the share of natures that make it at least as good
    const Q = new Float64Array(n);
    for (let m = 0; m < n; m++) ncls.forEach((c, ci) => { if (atLeast(amount[m][ci])) Q[m] += c.p; });
    const memo = {};
    const chance = (gold) => {
      const g = gold & ((1 << k) - 1);
      if (memo[g] == null) {
        let P = 0;
        for (const [mask, p] of subDist(k, g)) P += p * Q[toR(o.seeds ? seedAll(mask) : mask)];
        memo[g] = P;
      }
      return memo[g];
    };
    const probs = [0, 1, 3, 7].map(chance);
    // expected catches from the friend level given: the bronze medal is always on from its level; silver and gold
    // are used when they help
    const medal = medalSteps(o.medalSp || sp);
    const [bz, sv, gd] = medal.steps;
    const best = (fl) => {
      if (fl < bz) return chance(0);
      let p = chance(1);
      if (fl >= sv) p = Math.max(p, chance(3));
      if (fl >= gd) p = Math.max(p, chance(5), chance(7));
      return p;
    };
    const from = Math.max(1, Math.min(100, Math.round(o.friendLevel || 1)));
    let E = 0, S = 1;
    for (let fl = from; fl < gd; fl++) { E += S; S *= 1 - best(fl); }
    const pEnd = best(Math.max(gd, from));
    E = pEnd > 0 ? E + S / pEnd : Infinity;
    // the sub skills as counted, slot by slot: the counted one (raised by seeds) or null for "-"
    const shown = subs.map((s, i) => {
      if (!s || i >= k) return null;
      let t = s;
      if (!(raised & (1 << t.i))) {
        for (const [a, b] of SEED_UP) if (t.k === a && raised & (1 << SUB_BY_K[b].i) && !(own & (1 << SUB_BY_K[b].i))) t = SUB_BY_K[b];
        if (t.k === 'INM' && raised & (1 << SUB_BY_K.INL.i) && !(own & (1 << SUB_BY_K.INL.i))) t = SUB_BY_K.INL;
      }
      return keys.includes(t.k) ? { sub: s, as: t } : null;
    });
    return {
      kind: { S: 'skill', I: 'ing', B: 'berry', A: 'energy' }[sp.spec], amount: mine, rank, total: n * ncls.length, k,
      probs, expected: E, from, medal: medal.steps, medalKnown: medal.known,
      natureClass: { up: ncls[myC].up, down: ncls[myC].down }, shown, effects, relevant: R,
    };
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
      teamHBStr: env.teamHBStr, teamPerHelp: env.teamPerHelp, skillTrigger: env.skillTrigger, maxSkill: !!env.maxSkill,
    });
    const ctx = mk(L);
    const ctxCache = { [L]: ctx };
    const ctxAt = (lv) => ctxCache[lv] || (ctxCache[lv] = mk(lv));
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
    const natureRank = 1 + naturesFor(sp).filter((n) => value(ctx, n, subsL).role > me.role * (1 + 1e-9) + 1e-9).length;

    // ideal ratio (the approach of だいふく's checker); the specialty pattern is decided at Lv60
    const idealAt = {};
    const idealFor = (lv) => idealAt[lv] || (idealAt[lv] = idealRatio(ctxAt(lv), ind.nature, activeSubs(ind.subs, lv)));
    const ideal = idealFor(L);
    const subDetails = ind.subs.map((s, i) => {
      if (!s) return null;
      const lv = Math.max(L, UNLOCK[i]);
      const c2 = ctxAt(lv);
      const item = idealFor(lv).items.find((x) => x.sub === s);
      const act = activeSubs(ind.subs, lv);
      const without = act.filter((x) => x !== s);
      const a = value(c2, ind.nature, act);
      const b = value(c2, ind.nature, without);
      return {
        sub: s, unlock: UNLOCK[i], active: L >= UNLOCK[i], evalAt: lv,
        delta: { role: b.role > 0 ? a.role / b.role - 1 : 0, str: a.str / b.str - 1 },
        pt: item ? item.pt : 0, hbCut: !!(item && item.hbCut),
      };
    });
    return { L, ctx, me, role, str, ideal, n: dist.n, k: dist.k, natureDelta, natureRank, natureCount: dist.natureCount, subDetails, skillLevelBase, carryBase, carryDefault };
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
    loadData, evaluate, checkReading, computeSP, frequency, slotOptions, sumSubs, activeSubs, value, makeContext, energySegments, deriveBase, naturesFor, formForNature,
    idealRatio, idealStanding, idealQuick, dRank, dTribe, isClassified, setTribePicks, D_TABLE, D_TRIBES, D_RANKS, D_REF, D_W,
    rankStanding, medalSteps,
    NATURES, NATURE_BY_JA, NEUTRAL, SUBSKILLS, SUB_BY_JA, SUB_BY_K, UNLOCK, MAX_LEVEL, EFFECT_JA, SPEC_JA, BERRY_JA,
    ING_STRENGTH, maxSkillLevel, berryStrength, skillValue,
    get SPECIES() { return SPECIES; }, get SPECIES_BY_JA() { return SPECIES_BY_JA; },
    get SKILL_JA() { return SKILL_JA; }, get ING_JA() { return ING_JA; }, get TYPE_JA() { return TYPE_JA; },
  };
})();
if (typeof module !== 'undefined') module.exports = PSE;
