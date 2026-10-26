(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').normalize('NFKC').replace(/[\s　]/g, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  PSE.loadData(window.PSE_DATA);

  const SPEC_TYPE = { B: 'きのみタイプ', I: '食材タイプ', S: 'スキルタイプ', A: 'オールタイプ', U: 'とくい不明' };
  const AXIS = { B: 'きのみ', I: '食材', S: 'スキル', A: '総合' };
  const BASIS = { B: 'きのみの量', I: '食材の量', S: 'スキル効果', A: '総合エナジー' };
  const SHORT = { speed: 'おてつだい', energy: 'げんき', ing: '食材', skill: 'スキル', exp: 'EXP' };
  const RANK_WORD = { 増田: '神個体', SS: '大当たり', S: '当たり', A: 'まずまず', B: 'ふつう', C: 'いまひとつ', D: 'ハズレ寄り' };
  // CSS key per rank (the 増田 rank is 'X')
  const rankKey = (r) => ({ 増田: 'X', SS: 'SS', S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' }[r] || 'C');
  const RARITY_JA = { gold: '金', blue: '青', white: '白' };
  const EVAL_LEVELS = [25, 50, 60, 70];
  const SUB_TEXT = {
    HB: 'チーム全員のおてつだい時間が5%短くなる',
    ERB: 'チーム全員の睡眠でのげんき回復が14%増える。睡眠スコアが低い日に効く',
    BFS: 'きのみを1回に1個多く持ってくる',
    SLM: 'メインスキルのレベルが2上がる（上限まで）',
    SLS: 'メインスキルのレベルが1上がる（上限まで）',
    HSM: 'おてつだい時間が14%短くなる',
    HSS: 'おてつだい時間が7%短くなる',
    IFM: '食材を持ってくる確率が36%上がる',
    IFS: '食材を持ってくる確率が18%上がる',
    STM: 'メインスキルの発生確率が36%上がる',
    STS: 'メインスキルの発生確率が18%上がる',
    INL: '最大所持数が18増える',
    INM: '最大所持数が12増える',
    INS: '最大所持数が6増える',
    DSB: 'ゆめのかけらが6%増える（エナジーには影響しない）',
    REB: 'リサーチEXPが9%増える（エナジーには影響しない）',
    SEB: 'チーム全員の睡眠EXPが14%増える（エナジーには影響しない）',
  };

  // ---------- storage (per viewer, best effort) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const HKEY = 'pse:v1:history';
  const SKEY = 'pse:v1:sleep';
  const FKEY = 'pse:v1:field';
  const MKEY = 'pse:v1:maxskill';
  const EKEY = 'pse:v1:evolve';
  const PKEY = 'pse:v1:evopick';
  const BKEY = 'pse:v1:box';
  const BUKEY = 'pse:v1:boxui';
  // short sub skill names for the box list
  const SUB_SHORT = {
    HB: 'おてボ', ERB: 'げんき回復', BFS: 'きのみ数', SLM: 'スキルLvM', SLS: 'スキルLvS', HSM: 'スピードM', HSS: 'スピードS',
    IFM: '食材確率M', IFS: '食材確率S', STM: 'スキル確率M', STS: 'スキル確率S', INL: '所持数L', INM: '所持数M', INS: '所持数S',
    DSB: 'ゆめかけ', REB: 'リサーチEXP', SEB: '睡眠EXP',
  };

  // ---------- individual helpers ----------
  function defaultSlots(sp) {
    return [0, 1, 2].map((i) => PSE.slotOptions(sp, i)[0] || null);
  }
  function sampleInd() {
    const sp = PSE.SPECIES_BY_JA['ウッウ'];
    const o = (i) => PSE.slotOptions(sp, i);
    return {
      sp, level: 22, nature: PSE.NATURE_BY_JA['おとなしい'],
      subs: ['おてつだいスピードS', 'スキル確率アップS', '食材確率アップM', '最大所持数アップM', '最大所持数アップL'].map((j) => PSE.SUB_BY_JA[j]),
      skillLevelShown: 1,
      slots: [o(0)[0], o(1).find((x) => x.name === 'potato'), o(2).find((x) => x.name === 'potato')],
      spShown: 856, helpTimeShown: 2405, carryShown: 19, ribbon: 0, displayName: 'ウッウ',
    };
  }
  const state = {
    ind: sampleInd(),
    flags: {},
    source: 'sample',
    evalLevel: 60,
    sleepScore: store.get(SKEY, 100),
    fieldBonus: store.get(FKEY, 0),
    // Skill Level Up is valued with the seeds it saves by default (as in だいふく's checker)
    maxSkill: store.get(MKEY, true),
    // a pre-evolution is evaluated as its final evolution (as in だいふく's checker)
    evolve: store.get(EKEY, true),
    evoPick: store.get(PKEY, {}),
    files: [],
    autoFix: null,
    // the box entry shown in the checker (edits update it)
    boxId: null,
    boxUi: Object.assign({ sort: 'ideal', type: '', rank: '' }, store.get(BUKEY, {})),
  };

  // ---------- reference calculator (nitoyon/pokesleep-tool, bundled as NITO) ----------
  const REF = (() => {
    if (typeof NITO === 'undefined') return null;
    const params = new Map();
    const param = () => {
      const k = state.fieldBonus + '|' + state.sleepScore + '|' + state.maxSkill;
      if (!params.has(k)) params.set(k, NITO.createStrengthParameter({ fieldBonus: state.fieldBonus, sleepScore: state.sleepScore, maxSkillLevel: !!state.maxSkill }));
      return params.get(k);
    };
    function iv(ind, level, patch) {
      const p = Object.assign({}, ind, patch || {});
      const sp = p.sp;
      const base = PSE.deriveBase(ind).skillLevelBase;
      const slu = PSE.activeSubs(p.subs, p.level).reduce((a, x) => a + x.slu, 0);
      const S = (x) => (x ? new NITO.SubSkill(x.en) : null);
      const props = {
        pokemonName: sp.en, level: p.level,
        skillLevel: Math.max(1, Math.min(PSE.maxSkillLevel(sp.skill), base + slu)),
        subSkills: new NITO.SubSkillList({ lv10: S(p.subs[0]), lv25: S(p.subs[1]), lv50: S(p.subs[2]), lv70: S(p.subs[3]), lv80: S(p.subs[4]) }),
        nature: new NITO.Nature(p.nature.en), ribbon: p.ribbon || 0,
      };
      if (sp.myth) {
        props.ingredient = 'ABC';
        props.mythIng1 = (p.slots[0] && p.slots[0].name) || 'unknown';
        props.mythIng2 = (p.slots[1] && p.slots[1].name) || 'unknown';
        props.mythIng3 = (p.slots[2] && p.slots[2].name) || 'unknown';
      } else {
        props.ingredient = 'A' + [1, 2].map((i) => {
          const o = PSE.slotOptions(sp, i).find((x) => p.slots[i] && x.name === p.slots[i].name && x.count === p.slots[i].count);
          return o ? o.code : 'A';
        }).join('');
      }
      const v = new NITO.PokemonIv(props);
      return level === p.level ? v : v.changeLevel(level);
    }
    function calc(ind, level, patch) {
      const v = iv(ind, level, patch);
      return { iv: v, r: new NITO.PokemonStrength(v, param()).calculate(), rp: new NITO.PokemonRp(v).calculate() };
    }
    const teamCache = new Map();
    function teamHBStr() {
      const k = state.fieldBonus + '|' + state.sleepScore + '|' + state.maxSkill;
      if (!teamCache.has(k)) {
        let t = 0;
        try {
          const p = param();
          t = new NITO.PokemonStrength(p.teamMember, Object.assign({}, p, { addHelpingBonusEffect: false })).calculateImpl().totalStrength;
        } catch { t = 0; }
        teamCache.set(k, 4 * t * (1 / 0.95 - 1));
      }
      return teamCache.get(k);
    }
    // what one skill trigger brings at a level / skill level, measured on a plain individual of the species
    const trig = new Map();
    function skillTrigger(sp) {
      return (level, skillLevel) => {
        const k = [sp.en, level, skillLevel, state.fieldBonus, state.sleepScore, state.maxSkill].join('|');
        if (!trig.has(k)) {
          let v = null;
          try {
            const iv = new NITO.PokemonIv({ pokemonName: sp.en, level, skillLevel });
            const r = new NITO.PokemonStrength(iv, param()).calculateImpl();
            const c = r.skillCount;
            if (c > 0) {
              v = {
                per: r.skillValuePerTrigger || 0, per2: r.skillValuePerTrigger2 || 0, value: (r.skillValue || 0) / c,
                str: ((r.skillStrength || 0) + (r.skillStrength2 || 0)) / c, natE: (iv.nature && iv.nature.energyRecoveryFactor) || 1,
              };
            }
          } catch { v = null; }
          trig.set(k, v);
        }
        return trig.get(k);
      };
    }
    // a teammate's strength per help (used by Helper Boost / Extra Helpful)
    const tph = new Map();
    function teamPerHelp() {
      const k = state.fieldBonus + '|' + state.sleepScore + '|' + state.maxSkill;
      if (!tph.has(k)) {
        let t = 0;
        try {
          const p = param();
          t = new NITO.PokemonStrength(p.teamMember, Object.assign({}, p, { period: -1, addHelpingBonusEffect: false })).calculateImpl().totalStrength;
        } catch { t = 0; }
        tph.set(k, t);
      }
      return tph.get(k);
    }
    const rating = (v) => new NITO.PokemonRating(v).calculate();
    return { iv, calc, teamHBStr, teamPerHelp, skillTrigger, rating };
  })();
  const envFor = (sp) => (REF && sp && sp.supported
    ? { fieldBonus: state.fieldBonus, e4eCount: 3, e4eEnergy: 18, teamHBStr: REF.teamHBStr(), teamPerHelp: REF.teamPerHelp(), skillTrigger: REF.skillTrigger(sp), maxSkill: !!state.maxSkill }
    : { fieldBonus: state.fieldBonus, e4eCount: 3, e4eEnergy: 18, maxSkill: !!state.maxSkill });

  // ---------- evolution: a pre-evolution is evaluated as its final evolution ----------
  function finalForms(sp) {
    if (!sp || !(sp.el > 0)) return [];
    return PSE.SPECIES.filter((s) => s.supported && s !== sp && s.anc === sp.anc && s.el === 0 && s.ev === sp.ev + sp.el);
  }
  // forms that the player chooses between (Toxtricity's form follows the nature instead)
  const evoChoices = (sp) => finalForms(sp).filter((s) => !/^Toxtricity \(/.test(s.en));
  function evolveTarget(sp) {
    const list = finalForms(sp);
    if (!list.length) return null;
    return list.find((s) => s.en === state.evoPick[sp.anc]) || list[0];
  }
  function evolveInd(ind) {
    const sp = ind.sp;
    const to = evolveTarget(sp);
    if (!to) return null;
    const n = sp.el;
    const carry = (x) => x.carry + 5 * Math.max(0, x.ev);
    const slots = ind.slots.map((s, i) => {
      const opts = PSE.slotOptions(to, i);
      return (s && (opts.find((o) => o.name === s.name && o.count === s.count) || opts.find((o) => o.name === s.name))) || opts[0] || null;
    });
    return Object.assign({}, ind, {
      sp: to, from: sp,
      // each evolution raises the main skill level by one, and the inventory by five
      skillLevelShown: Math.min(PSE.maxSkillLevel(to.skill), (ind.skillLevelShown || 1) + n),
      carryShown: ind.carryShown ? ind.carryShown + carry(to) - carry(sp) : null,
      slots, spShown: null, helpTimeShown: null,
    });
  }
  const withSettings = (ind, evolve = state.evolve) => {
    const x = (evolve && evolveInd(ind)) || ind;
    const sp = PSE.formForNature(x.sp, x.nature);
    return Object.assign({}, x, { sp, sleepScore: state.sleepScore, env: envFor(sp) });
  };
  let refCache = new Map();
  function refCalc(ind, L, patch, key) {
    if (!REF) return null;
    const k = key ? L + '|' + key : null;
    if (k && refCache.has(k)) return refCache.get(k);
    let c = null;
    try { c = REF.calc(ind, L, patch); } catch { c = null; }
    if (k) refCache.set(k, c);
    return c;
  }

  // ---------- formatting ----------
  function fmtTop(top) {
    const p = top * 100;
    if (p < 0.1) return '0.1%未満';
    if (p < 10) return (Math.round(p * 10) / 10).toFixed(1) + '%';
    return Math.round(p) + '%';
  }
  const fmtPct = (x) => (Math.round(x * 10) / 10).toFixed(1) + '%';
  const fmtPt = (x) => (x >= 0.05 ? '+' : x <= -0.05 ? '−' : '±') + (Math.round(Math.abs(x) * 10) / 10).toFixed(1) + 'pt';
  const fmtDelta = (d) => {
    const p = Math.round(d * 100);
    return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + '%';
  };
  const fmtTime = (sec) => {
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + '時間' : '') + (m || h ? m + '分' : '') + r + '秒';
  };
  function parseTime(v) {
    const t = norm(v);
    if (!t) return null;
    let m = t.match(/^(\d+):(\d{1,2})$/);
    if (m) return +m[1] * 60 + +m[2];
    m = t.match(/^(?:(\d+)時間)?(?:(\d+)分)?(?:(\d+)秒)?(?:ごと)?$/);
    if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    if (/^\d+$/.test(t)) return +t;
    return null;
  }
  const fmtInt = (x) => Math.round(x).toLocaleString('ja-JP');
  const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const fmt2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
  const fmtNice = (x) => (Math.abs(x) >= 100 ? fmtInt(x) : Math.abs(x) >= 10 ? fmt1(x) : String(Math.round(x * 100) / 100));
  const fmtSp = (x) => x.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtSigned = (x, f) => {
    const body = String(f(Math.abs(x)));
    const zero = !/[1-9]/.test(body);
    return (zero ? '±' : x > 0 ? '+' : '−') + body;
  };
  const fmtMin = (min) => { const m = Math.round(min); return (m >= 60 ? Math.floor(m / 60) + '時間' : '') + (m % 60) + '分'; };
  // species whose stats come from RaenonX (pks.raenonx.cc) until the bundled data has them
  const RAENONX_DATA = new Set(['Misdreavus', 'Mismagius']);
  function skillUnit(skill) {
    if (/^Charge Strength|^Berry Burst|^Berry Zone/.test(skill)) return { label: 'エナジー', u: '', strength: true };
    if (/^Charge Energy|^Energizing Cheer/.test(skill)) return { label: 'げんき', u: '' };
    if (/^Energy for Everyone/.test(skill)) return { label: '全員のげんき', u: '' };
    if (/^Ingredient Magnet|^Ingredient Draw|^Cooking Assist/.test(skill)) return { label: '食材', u: '個' };
    if (/^Dream Shard/.test(skill)) return { label: 'ゆめのかけら', u: '' };
    if (/^Cooking Power-Up|^Cooking Advance/.test(skill)) return { label: 'なべ容量', u: '' };
    if (skill === 'Tasty Chance S') return { label: '大成功率', u: '%' };
    if (skill === 'Extra Helpful S' || skill === 'Helper Boost') return { label: 'おてつだい', u: '回' };
    if (/^Metronome|^Skill Copy/.test(skill)) return { label: '', u: '', count: true };
    return { label: '効果', u: '' };
  }
  const ingLabel = (s) => (s ? `${PSE.ING_JA[s.name] || s.name}×${s.count}` : '—');
  const natureLabel = (n) => (n.up ? `▲${SHORT[n.up]} ▼${SHORT[n.down]}` : '補正なし');
  const rarityClass = (s) => s.r;

  // ---------- reading check ----------
  function runCheck(ind) {
    try { return PSE.checkReading(ind); } catch { return null; }
  }

  // ---------- render: specimen ----------
  function renderSpecimen(ind, chk) {
    const sp = ind.sp;
    const skillJa = PSE.SKILL_JA[sp.skill] || sp.skill;
    const sameName = (a, b) => a === b || b.startsWith(a + '(');
    const nick = ind.displayName && !sameName(norm(ind.displayName), norm(sp.ja)) ? `<p class="note">画面の名前: ${esc(ind.displayName)}</p>` : '';
    const spNow = chk ? chk.calc.rp : null;
    let spBox = '';
    if (spNow != null) {
      const shown = ind.spShown;
      const mark = shown ? (shown === spNow ? '画面と一致' : `画面は ${shown}`) : '計算値';
      spBox = `<div class="sp-box"><div class="k">SP</div><div class="v num">${spNow}</div><div class="note">${mark}</div></div>`;
    }
    $('cardSpecimen').innerHTML = `
      <div class="specimen">
        <div style="display:grid;gap:8px;min-width:0">
          <h2 id="spName">${esc(sp.ja)}<span class="lv num">Lv.${ind.level}</span></h2>
          ${nick}
          <div class="chips">
            <span class="chip spec-${sp.spec}">${SPEC_TYPE[sp.spec]}</span>
            <span class="chip">${esc(PSE.TYPE_JA[sp.type] || sp.type)}・${esc(PSE.BERRY_JA[sp.type] || 'きのみ')}</span>
            <span class="chip">${esc(skillJa)} Lv.${ind.skillLevelShown || 1}</span>
          </div>
          ${boxActionHtml()}
        </div>
        ${spBox}
      </div>`;
  }

  // ---------- render: verdict ----------
  function summaryText(ind, ev) {
    const d = ev.ideal;
    const rows = ev.subDetails.filter(Boolean);
    const seeded = (r) => state.maxSkill && r.sub.slu > 0;
    const active = rows.filter((r) => r.active && !r.sub.util && !seeded(r)).sort((x, y) => y.pt - x.pt);
    const parts = [];
    const [t1, t2] = active;
    if (t1 && t1.pt >= 8) {
      parts.push(`Lv${t1.unlock}の${t1.sub.ja}が大きな武器です（理想個体比 ${fmtPt(t1.pt)}）。`);
      if (t2 && t2.pt >= 4) parts.push(`Lv${t2.unlock}の${t2.sub.ja}も効いています。`);
    } else if (t1 && t1.pt >= 4) {
      parts.push(t2 && t2.pt >= 4
        ? `Lv${t1.unlock}の${t1.sub.ja}とLv${t2.unlock}の${t2.sub.ja}が効いています。`
        : `Lv${t1.unlock}の${t1.sub.ja}が効いています。`);
    } else if (ev.L >= 10) {
      parts.push(`Lv${ev.L}までに開くサブスキルに、1日のエナジーを大きく増やすものがありません。`);
    }
    const neg = rows.filter((r) => r.active && !r.sub.util && r.pt <= -1.5).sort((x, y) => x.pt - y.pt)[0];
    if (neg) parts.push(`${parts.length ? 'ただし' : ''}Lv${neg.unlock}の${neg.sub.ja}は、${negReason(ind.sp.spec, neg.sub) || 'このポケモンでは1日のエナジーが減ります'}（${fmtPt(neg.pt)}）。`);
    const np = d.items[0].pt;
    if (np >= 5) parts.push('せいかくもぴったりです。');
    else if (np >= 2) parts.push('せいかくも向いています。');
    else if (np <= -2) parts.push('せいかくは少しマイナスです。');
    else parts.push('せいかくの影響は小さめです。');
    const slu = rows.filter((r) => r.active && r.sub.slu > 0);
    if (slu.length) {
      parts.push(state.maxSkill
        ? `${slu.map((r) => r.sub.ja).join('と')}は、たねでスキルレベルを最大にする前提なので評価に入れていません。`
        : `${slu.map((r) => r.sub.ja).join('と')}は、メインスキルのたねの節約ぶんも含めて評価しています。`);
    }
    if (rows.some((r) => r.active && r.hbCut)) {
      parts.push(`おてつだいボーナスは、${d.tribe[0] === 'I' ? '食材の数がれいせい' : 'スキルの回数がなまいき'}の個体に届かないので、加点が控えめ（12→2.4）です。`);
    }
    const later = rows.filter((r) => !r.active && r.unlock <= PSE.MAX_LEVEL && !r.sub.util && !seeded(r) && r.pt >= 4);
    if (later.length) parts.push(`Lv${later[0].unlock}で${later[0].sub.ja}が開くと、さらに伸びます。`);
    return parts.join('');
  }

  // the three scores the rank is made of, each against its reference individual (= 100%)
  function roleBars(ind, ev) {
    const d = ev.ideal;
    const own = d.tribe[0] === 'B' ? 'b' : d.tribe[0] === 'I' ? 'i' : 's';
    const w = d.weights;
    const row = (k, lab, v) => `<div class="rb${k === own ? ' hl' : ''}"><span class="lab"><i class="sw ${k}"></i>${lab}</span><span class="bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(1)}%"></i></span><span class="v num">${Math.round(v)}<small>%</small></span></div>`;
    const p = d.parts;
    const bonus = [[p.hb, d.hbCut ? 'おてつだいボーナス（控えめ）' : 'おてつだいボーナス'], [p.bfs, 'きのみの数S'], [p.gold, 'スキルレベルアップ'], [p.side, '睡眠EXP・げんき回復ボーナス'], [p.exp, 'EXPのせいかく']]
      .filter(([v]) => Math.abs(v) > 1e-9).map(([v, t]) => `${t} ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
    return `<div class="role-bars">
      <div class="rb-head">理想個体比の内訳<small>きのみ×${w[0]}＋食材×${w[1]}＋スキル×${w[2]}${bonus.length ? '＋加点' : ''}（それぞれ基準の個体＝100%）</small></div>
      ${row('b', 'きのみ', d.k)}${row('i', '食材', d.f)}${row('s', 'スキル', d.s)}
      ${bonus.length ? `<div class="rb-bonus">加点: ${esc(bonus.join('・'))}</div>` : ''}
    </div>`;
  }

  // the ideal ratio on a 0-100% scale with the rank bands, and its place among the combinations of its rank
  function rankBar(ev) {
    const d = ev.ideal;
    const key = rankKey(d.rank);
    let st = null;
    try { st = PSE.idealStanding(ev.ctx, d.pct); } catch { st = null; }
    const b = d.bounds; // lower bounds of 増田, SS, S, A, B, C
    // 0-100%; some patterns rank above 100%, so the scale grows to show the top band
    const max = Math.max(100, Math.ceil(Math.max(b[0] + 12, d.pct + 4) / 10) * 10);
    const at = (v) => Math.max(0, Math.min(100, (v / max) * 100));
    const ranks = ['D', 'C', 'B', 'A', 'S', 'SS', '増田'];
    const lows = [0, b[5], b[4], b[3], b[2], b[1], b[0]];
    const highs = lows.slice(1).concat([max]);
    const cur = Math.max(0, ranks.indexOf(d.rank));
    const x = at(d.pct);
    const fmtB = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    const n = (v) => v.toLocaleString('ja-JP');
    const labels = ranks.map((r, i) => `<span class="rk-l${i === cur ? ' on' : ''}" data-g="${rankKey(r)}" style="left:${at((lows[i] + highs[i]) / 2).toFixed(2)}%">${r}</span>`).join('');
    const gaps = lows.slice(1).map((v) => `<i class="rk-gap" style="left:${at(v).toFixed(2)}%"></i>`).join('');
    const band = `<span class="rk-band" style="left:${at(lows[cur]).toFixed(2)}%;width:${(at(highs[cur]) - at(lows[cur])).toFixed(2)}%"></span>`;

    // labels under the bar: the value at the end of the fill, 0% and 100% (the ideal), then the end of a longer scale and 50% where they fit
    // (widths in % of the bar, estimated for a narrow phone)
    const PX = 100 / 280;
    const vTxt = fmtPct(d.pct);
    const vw = vTxt.length * 7.8 * PX;
    const spanOf = (p, w, al) => (al === 's' ? [p, p + w] : al === 'e' ? [p - w, p] : [p - w / 2, p + w / 2]);
    const hit = (a, c) => !(a[1] < c[0] - 1.5 || a[0] > c[1] + 1.5);
    const tick = (v) => {
      const p = at(v), al = v === 0 ? 's' : p > 99.9 ? 'e' : '';
      return { v, p, al, span: spanOf(p, String(v).length * 6.4 * PX + 7 * PX, al) };
    };
    const ends = [tick(0), tick(100)];
    const prefs = x > 75 ? ['e', '', 's'] : x < 25 ? ['s', '', 'e'] : ['', 'e', 's'];
    const fits = (al) => { const s = spanOf(x, vw, al); return s[0] >= 0 && s[1] <= 100 && ends.every((t) => !hit(s, t.span)); };
    const vAlign = prefs.find(fits) ?? prefs[0];
    const vSpan = spanOf(x, vw, vAlign);
    const shown = ends.filter((t) => !hit(vSpan, t.span));
    for (const v of (max > 100 ? [max, 50] : [50])) {
      const t = tick(v);
      if (!hit(vSpan, t.span) && shown.every((u) => !hit(u.span, t.span))) shown.push(t);
    }
    const ticks = shown.map((t) => `<span class="rk-t${t.al ? ' ' + t.al : ''}" style="left:${t.p.toFixed(2)}%">${t.v}%</span>`).join('');

    const top = cur === ranks.length - 1;
    const range = top ? `${fmtB(lows[cur])}%超` : cur === 0 ? `${fmtB(highs[cur])}%未満` : `${fmtB(lows[cur])}〜${fmtB(highs[cur])}%`;
    const gap = highs[cur] - d.pct;
    const next = top ? 'いちばん上のランクです' : `${ranks[cur + 1]}まで あと${gap < 0.05 ? '0.1%未満' : fmt1(gap) + '%'}`;
    const place = st
      ? `<p class="rk-place"><b data-g="${key}">${d.rank}</b>の${n(st.inRank)}通りの中で <b class="num">${n(st.placeInRank)}位</b></p>`
      : '';
    const aria = `理想個体比の目盛り（0%〜${max}%）。この個体は${vTxt}で${d.rank}（${range}）${st ? `。${d.rank}の${n(st.inRank)}通りの中で${n(st.placeInRank)}位` : ''}`;
    return `<div class="rank-bar" data-g="${key}">
        <div class="rk-labels" aria-hidden="true">${labels}</div>
        <div class="rk-track" role="img" aria-label="${aria}">${band}<span class="rk-fill" style="width:${x.toFixed(2)}%"></span>${gaps}</div>
        <div class="rk-scale" aria-hidden="true">${ticks}<span class="rk-v num${vAlign ? ' ' + vAlign : ''}" style="left:${x.toFixed(2)}%">${vTxt}</span></div>
        ${place}
        <p class="rk-next">${d.rank}は${range}・${next}</p>
      </div>`;
  }

  // a pre-evolution: which final form the evaluation uses
  function evoNote(ind) {
    const raw = state.ind.sp;
    const list = finalForms(raw);
    if (!list.length) return '';
    if (!state.evolve) {
      return `<div class="evo-note"><span>${esc(raw.ja)}のまま評価しています。</span><button type="button" class="btn btn-small" data-evolve="1">最終進化（${esc(list.map((x) => x.ja).join('・'))}）で評価する</button></div>`;
    }
    const choices = evoChoices(raw);
    const pick = choices.length > 1
      ? `<label class="evo-pick">進化先 <select id="evoPick">${choices.map((x) => `<option value="${esc(x.en)}"${x === ind.sp ? ' selected' : ''}>${esc(x.ja)}</option>`).join('')}</select></label>`
      : '';
    return `<div class="evo-note"><span>進化前なので、<b>${esc(ind.sp.ja)}</b>に進化させた姿（スキルLv.${ind.skillLevelShown}・進化のぶん所持数も増加）で評価しています。</span>${pick}<button type="button" class="btn btn-small" data-evolve="0">${esc(raw.ja)}のまま評価</button></div>`;
  }

  function levelsFor(ind) {
    const lv = Math.min(ind.level, PSE.MAX_LEVEL);
    const set = new Set(EVAL_LEVELS);
    const out = [...EVAL_LEVELS];
    if (!set.has(lv) && lv < PSE.MAX_LEVEL) out.push(lv);
    return out.sort((a, b) => a - b);
  }

  function stripHtml(ind, evs, levels) {
    return levels.map((L) => {
      const ev = evs[L];
      const now = L === Math.min(ind.level, PSE.MAX_LEVEL);
      const label = (now ? 'いま ' : '') + 'Lv' + L + (L === PSE.MAX_LEVEL && !now ? ' 上限' : '');
      const g = ev ? ev.ideal.rank : '';
      return `<button type="button" class="lv-chip" data-l="${L}" data-g="${ev ? rankKey(g) : ''}" aria-pressed="${L === state.evalLevel}" ${ev ? '' : 'disabled'}>
        <span class="l">${label}</span><span class="g">${ev ? g : '…'}</span><span class="p">${ev ? fmtPct(ev.ideal.pct) : '計算中'}</span>
      </button>`;
    }).join('');
  }

  function renderVerdict(ind, ev, evs, levels) {
    const d = ev.ideal;
    const key = rankKey(d.rank);
    const fill = Math.max(2, Math.min(100, Math.round(d.pct)));
    const names = ['増田', 'SS', 'S', 'A', 'B', 'C'];
    const scale = d.bounds.map((v, i) => `${names[i]} ${Number.isInteger(v) ? v : v.toFixed(1)}%${i === 0 ? '超' : '〜'}`).join('・') + '・D それ未満';
    $('cardVerdict').innerHTML = `
      ${evoNote(ind)}
      <div class="verdict">
        <div class="medal" data-g="${key}" style="--fill:${fill}" aria-hidden="true"><span class="${d.rank.length > 1 ? 'two' : ''}">${d.rank}</span></div>
        <div class="verdict-text">
          <span class="eyebrow">${esc(ind.sp.ja)}・${d.tribeNo}${esc(d.tribeJa)}・Lv${ev.L}のとき${ev.L !== ind.level ? `（いまLv${ind.level}）` : ''}</span>
          <span class="big">理想個体の ${fmtPct(d.pct)}<small>${RANK_WORD[d.rank]}</small></span>
          <span class="subline">同じポケモンの${ev.n.toLocaleString('ja-JP')}通りの中では上位${fmtTop(ev.role.top)}（${BASIS[ind.sp.spec]}で比較）</span>
        </div>
      </div>
      ${rankBar(ev)}
      ${roleBars(ind, ev)}
      <p class="summary">${esc(summaryText(ind, ev))}</p>
      <div class="lv-strip" id="lvStrip" role="group" aria-label="評価するレベル" style="grid-template-columns:repeat(${levels.length},minmax(0,1fr))">${stripHtml(ind, evs, levels)}</div>
      <p class="note">ランクの目安（だいふくさんの個体値チェッカーの${esc(d.tribeJa)}・Lv${d.table}基準）: ${scale}</p>`;
  }

  // ---------- render: why ----------
  // pt: share of the ideal individual's total (%)
  function verdictFor(pt, sub) {
    if (sub && sub.util) return { v: 'support', t: 'サポート' };
    if (pt >= 8) return { v: 'great', t: '◎ 大当たり' };
    if (pt >= 4) return { v: 'good', t: '○ 当たり' };
    if (pt >= 1.5) return { v: 'ok', t: '△ ちょい足し' };
    if (pt <= -1.5) return { v: 'bad', t: '▼ マイナス' };
    return { v: 'none', t: '− 効果うすい' };
  }
  // why a sub skill lowers what this specialty brings
  function negReason(spec, s) {
    if (spec === 'S' && (s.bfs || s.ingf)) return '持ち物がいっぱいになりやすく、いっぱいの間はスキルが出ません';
    if (spec === 'I' && s.bfs) return '持ち物がいっぱいになりやすく、いっぱいの間は食材を持ってきません';
    if (spec === 'B' && s.ingf) return '食材を持ってくる回数が増えるぶん、きのみが減ります';
    return '';
  }
  function natureWhy(ind, ev) {
    const n = ind.nature;
    const spec = ind.sp.spec;
    if (!n.up) return 'せいかくによる補正がありません。';
    const fit = { ing: spec === 'I' || spec === 'A', skill: spec === 'S' || spec === 'A' };
    const up = {
      speed: 'おてつだいスピード▲でおてつだいの回数が増えます',
      ing: fit.ing ? '食材おてつだい確率▲で食材が増えます' : '食材おてつだい確率▲は、このタイプには効果が小さめです',
      skill: fit.skill ? 'メインスキル発生確率▲でスキル発動が増えます' : 'メインスキル発生確率▲は、このタイプには効果が小さめです',
      energy: state.sleepScore >= 100 ? 'げんき回復量▲は、睡眠スコア100だと上限に届くのでほぼ効果なしです' : 'げんき回復量▲で朝のげんきが増えます',
      exp: 'EXP獲得量▲は育成が早くなります（エナジーには影響なし）',
    }[n.up];
    const down = {
      speed: 'おてつだいスピード▼で回数が減ります',
      ing: fit.ing ? '食材おてつだい確率▼で食材が減ります' : '食材おてつだい確率▼の影響は小さめです',
      skill: fit.skill ? 'メインスキル発生確率▼でスキル発動が減ります' : 'メインスキル発生確率▼の影響は小さめです',
      energy: 'げんき回復量▼で朝のげんきが減り、おてつだいが少し遅くなります',
      exp: 'EXP獲得量▼は育成が少し遅くなります（エナジーには影響なし）',
    }[n.down];
    return `${up}。${down}。`;
  }
  function natureVerdict(pt) {
    if (pt >= 5) return { v: 'great', t: '◎ ぴったり' };
    if (pt >= 2) return { v: 'good', t: '○ 向いている' };
    if (pt > -2) return { v: 'ok', t: '△ 影響小' };
    return { v: 'bad', t: '× 向いていない' };
  }
  function patternInfo(ind) {
    const sp = ind.sp;
    const e = (s) => (s ? (PSE.ING_STRENGTH[s.name] || 0) * s.count : 0);
    const o0 = PSE.slotOptions(sp, 0), o1 = PSE.slotOptions(sp, 1), o2 = PSE.slotOptions(sp, 2);
    const firsts = sp.myth ? o0 : o0.slice(0, 1);
    const mine = e(ind.slots[0]) + e(ind.slots[1]) + e(ind.slots[2]);
    let better = 0, total = 0;
    for (const a of firsts) for (const b of o1) for (const c of o2) { total++; if (e(a) + e(b) + e(c) > mine + 1e-9) better++; }
    const code = sp.myth ? '' : ind.slots.map((s, i) => {
      if (!s) return '?';
      const opt = PSE.slotOptions(sp, i).find((o) => o.name === s.name);
      return opt ? opt.code : '?';
    }).join('');
    return { rank: better + 1, total, code };
  }

  // role quantity per specialty, from the reference calculator
  function roleQty(spec, c) {
    if (!c) return null;
    const r = c.r;
    if (spec === 'B') return r.berryCount;
    if (spec === 'I') return r.ingredients.reduce((a, x) => a + x.count, 0);
    if (spec === 'S') return r.skillValue > 0 ? r.skillValue : r.skillCount;
    return r.totalStrength;
  }
  function qtyText(spec, dq, wo) {
    const pct = wo > 0 ? `（${fmtSigned(dq / wo * 100, (v) => Math.round(v))}%）` : '';
    if (spec === 'B') return `きのみ ${fmtSigned(dq, fmt1)}個/日${pct}`;
    if (spec === 'I') return `食材 ${fmtSigned(dq, fmt1)}個/日${pct}`;
    if (spec === 'S') return `スキル効果 ${pct.replace(/[（）]/g, '') || '±0%'}`;
    return `エナジー ${fmtSigned(dq, fmtInt)}/日${pct}`;
  }

  function renderWhy(ind, ev) {
    const spec = ind.sp.spec;
    const nd = ev.natureDelta;
    const L = ev.L;
    // nature: actual vs. no-correction nature, measured with the reference calculator
    const cMe = refCalc(ind, L, null, 'me');
    const cNeu = refCalc(ind, L, { nature: PSE.NEUTRAL }, 'neutral');
    const natPt = ev.ideal.items[0].pt;
    let natureEff = `<span class="eff">理想個体比 ${fmtPt(natPt)}</span>`;
    if (cMe && cNeu) {
      const q1 = roleQty(spec, cMe), q0 = roleQty(spec, cNeu);
      natureEff += `・${qtyText(spec, q1 - q0, q0)}` + (spec !== 'A' ? `・エナジー ${fmtSigned(cMe.r.totalStrength - cNeu.r.totalStrength, fmtInt)}/日` : '');
    } else {
      natureEff += `・${AXIS[spec]} ${fmtDelta(nd.role)}`;
    }
    const nv = natureVerdict(natPt);
    const natureRow = `
      <div class="row">
        <span class="when">せいかく</span>
        <span class="name">${esc(ind.nature.ja)}<span class="tag">${natureLabel(ind.nature)}</span></span>
        <span class="verdict-chip" data-v="${nv.v}">${nv.t}</span>
        <span class="why">${natureEff}（補正なしのせいかくと比べて）。${esc(natureWhy(ind, ev))} ${ev.natureCount || 25}種中${ev.natureRank}位。</span>
      </div>`;
    const subRows = ev.subDetails.map((d, i) => {
      const u = PSE.UNLOCK[i];
      if (!d) {
        return `<div class="row"><span class="when"><span class="dot"></span>Lv${u}</span><span class="name" style="color:var(--faint)">（未入力）</span><span></span></div>`;
      }
      const s = d.sub;
      const lv = d.evalAt;
      const cW = refCalc(ind, lv, null, 'me');
      const cWo = refCalc(ind, lv, { subs: ind.subs.map((x, j) => (j === i ? null : x)) }, 'wo' + i);
      let eff = s.util ? (Math.abs(d.pt) >= 0.05 ? `<span class="eff">理想個体比 ${fmtPt(d.pt)}</span>。` : '') : `<span class="eff">理想個体比 ${fmtPt(d.pt)}</span>${s.slu && !state.maxSkill ? '（たねの節約ぶん込み）' : ''}${d.hbCut ? '（役割の量がれいせい・なまいきに届かないので控えめ）' : ''}`;
      if (!s.util && !(cW && cWo)) eff += '。';
      if (cW && cWo && !s.util) {
        const q1 = roleQty(spec, cW), q0 = roleQty(spec, cWo);
        const dE = cW.r.totalStrength - cWo.r.totalStrength;
        const cnt = cW.r.skillCount - cWo.r.skillCount;
        let skillNote = '';
        if (spec === 'S' && Math.abs(cnt) >= 0.01) skillNote = `（発動 ${fmtSigned(cnt, fmt2)}回/日）`;
        else if (spec !== 'S' && s.st && Math.abs(cnt) >= 0.01) skillNote = `（スキル発動 ${fmtSigned(cnt, fmt2)}回/日）`;
        else if (spec !== 'S' && s.slu) skillNote = `（スキルLv +${Math.max(0, cW.iv.skillLevel - cWo.iv.skillLevel)}）`;
        eff += '・' + qtyText(spec, q1 - q0, q0) + skillNote
          + (spec !== 'A' ? `・エナジー ${fmtSigned(dE, fmtInt)}/日` : '')
          + (s.hb ? '（チームへの効果込み）' : '') + '。';
      }
      const seeded = state.maxSkill && s.slu > 0;
      if (seeded) eff = 'メインスキルのたねでスキルレベルを最大にする前提なので、評価に入れていません。';
      const vd = seeded ? { v: 'none', t: '− たねで代わりがきく' } : verdictFor(d.pt, s);
      const neg = d.pt <= -1.5 && !s.util && !seeded ? negReason(spec, s) : '';
      const lockNote = !d.active
        ? (u > PSE.MAX_LEVEL ? `Lv${u}で解放（いまの上限はLv${PSE.MAX_LEVEL}）。Lv${lv}で計算: ` : `Lv${u}で解放。Lv${lv}で計算: `)
        : '';
      return `
        <div class="row${d.active ? '' : ' locked'}">
          <span class="when"><span class="dot ${rarityClass(s)}" title="${RARITY_JA[s.r]}"></span>Lv${u}</span>
          <span class="name ${rarityClass(s)}">${esc(s.ja)}</span>
          <span class="verdict-chip" data-v="${vd.v}">${vd.t}</span>
          <span class="why">${s.util ? '' : seeded ? (d.active ? '' : `Lv${u}で解放。`) : lockNote}${eff}${neg ? esc(neg) + '。' : ''}${esc(SUB_TEXT[s.k] || '')}</span>
        </div>`;
    }).join('');
    const pi = patternInfo(ind);
    const ingRows = ind.slots.map((s, i) => {
      const u = [1, 30, 60][i];
      const locked = ind.level < u;
      const fl = state.flags['ing' + i] ? '<span class="tag">要確認</span>' : '';
      return `<div class="row${locked ? ' locked' : ''}"><span class="when">Lv${u}</span><span class="name">${esc(ingLabel(s))}${locked ? `<span class="tag">Lv${u}で解放</span>` : ''}${fl}</span><span></span></div>`;
    }).join('');
    const best = ev.role.best;
    const idealSubs = best.subs.length ? best.subs.map((x) => esc(x.ja)).join('・') : '（サブスキルなし）';
    const refs = ev.ideal.refs;
    const refText = (r) => `${esc(r.nature.ja)}${r.subs.length ? '＋' + r.subs.map((x) => esc(x.ja)).join('・') : ''}`;
    $('cardWhy').innerHTML = `
      <h2 class="card-title">評価の内訳（Lv${L}・理想個体比で何pt変わるか）</h2>
      <div class="rows">${natureRow}</div>
      <h3 class="card-title">サブスキル（あり・なしの差）</h3>
      <div class="rows">${subRows}</div>
      <h3 class="card-title">食材${pi.code ? `（${pi.code}）` : ''}</h3>
      <div class="rows">${ingRows}</div>
      ${ind.slots.some((x, i) => state.flags['ing' + i] && ind.level < [1, 30, 60][i]) ? '<p class="note">まだ解放されていない食材のうち、アイコンがはっきり見えなかった枠は、仮の組み合わせで計算しています。違うときは「読み取り結果を直す」で選び直してください。</p>' : ''}
      <p class="note">この食材の組み合わせは、Lv60での食材の合計エナジーで ${pi.total}通り中 ${pi.rank}位です。</p>
      <p class="ideal">100%の基準（だいふくさんの方式・Lv${L}で開くぶん）: きのみ＝<b>${refText(refs.k)}</b>、食材＝<b>${refText(refs.f)}</b>、スキル＝<b>${refText(refs.s)}</b></p>
      <p class="note">${BASIS[spec]}がいちばん多くなる組み合わせは <b>${esc(best.nature.ja)}</b> ＋ ${idealSubs} です。</p>`;
  }

  // ---------- render: numbers (reference calculator) ----------
  function fieldSelect() {
    const opts = Array.from({ length: 21 }, (_, i) => i * 5)
      .map((v) => `<option value="${v}"${v === state.fieldBonus ? ' selected' : ''}>${v}%</option>`).join('');
    return `<label class="field-inline" for="fieldBonus">フィールドボーナス<select id="fieldBonus">${opts}</select></label>`;
  }
  function renderNumbers(ind, L) {
    const el = $('cardDay');
    const c = refCalc(ind, L, null, 'me');
    const head = `<div class="num-head"><h2 class="card-title">Lv${L}の数値</h2>${fieldSelect()}</div>`;
    if (!c) {
      el.innerHTML = `${head}<p class="note">このポケモンの数値は計算できませんでした。</p>`;
      return;
    }
    const r = c.r, rp = c.rp, spec = ind.sp.spec;
    const skStr = (r.skillStrength || 0) + (r.skillStrength2 || 0);
    const team = r.helpingBonusStrength || 0;
    const tot = r.totalStrength || 1;
    const share = [['b', r.berryTotalStrength], ['i', r.ingStrength], ['s', skStr], ['t', team]]
      .filter(([, v]) => v > 0).map(([k, v]) => `<span class="${k}" style="width:${(v / tot * 100).toFixed(2)}%"></span>`).join('');
    const ingTotal = r.ingredients.reduce((a, x) => a + x.count, 0);
    const ings = r.ingredients.filter((x) => x.count > 0.005)
      .map((x) => `<div>${esc(PSE.ING_JA[x.name] || x.name)} <b>${fmt1(x.count)}</b>個</div>`).join('') || '<div>—</div>';
    const unit = skillUnit(ind.sp.skill);
    let skillMeta = `確率${fmt2(r.skillRate * 100)}%`;
    const per = r.skillValuePerTrigger || 0;
    if (unit.strength && per > 0) skillMeta += `・1回で${fmtInt(per)}エナジー`;
    else if (!unit.count && per > 0) skillMeta += `・1回で${unit.label} ${unit.u === '%' ? '+' : ''}${fmtNice(per)}${unit.u}（1日 ${unit.u === '%' ? '+' : ''}${fmtNice(r.skillValue)}${unit.u}）`;
    if (ind.sp.skill === 'Cooking Advance S (Mystical Fire)') {
      // the second effect: the next cooking's great success chance (not counted as energy)
      const per2 = r.skillValuePerTrigger2 || 0;
      if (per2 > 0) skillMeta += `・大成功率 +${fmtNice(per2)}%（1日 +${fmtNice(r.skillValue2)}%）`;
    } else if ((r.skillValue2 || 0) > 0 && !(r.skillStrength2 > 0)) skillMeta += `・追加効果 ${fmtNice(r.skillValue2)}`;
    const wake = r.skillProbabilityAfterWakeup || { once: 0, twice: 0 };
    const twice = (spec === 'S' || spec === 'A') && wake.twice > 0 ? `<small>2回ぶん ${fmt1(wake.twice * 100)}%</small>` : '';
    const hl = (k) => (({ B: 'b', I: 'i', S: 's' })[spec] === k ? ' hl' : '');
    el.innerHTML = `
      ${head}
      <div class="energy-head"><span class="k">1日の合計エナジー</span><span class="v">${fmtInt(r.totalStrength)}</span></div>
      <div class="share" aria-hidden="true">${share}</div>
      <div class="yield">
        <div class="y-row${hl('b')}"><span class="lab"><i class="sw b"></i>きのみ</span><span class="main">${fmt1(r.berryCount)}個</span><span class="en">${fmtInt(r.berryTotalStrength)}</span><span class="meta">確率${fmt1(r.berryRate * 100)}%・1個${fmtInt(r.berry1Strength)}エナジー</span></div>
        <div class="y-row${hl('i')}"><span class="lab"><i class="sw i"></i>食材</span><span class="main">${ings}</span><span class="en">${fmtInt(r.ingStrength)}</span><span class="meta">確率${fmt1(r.ingRate * 100)}%・合計${fmt1(ingTotal)}個</span></div>
        <div class="y-row${hl('s')}"><span class="lab"><i class="sw s"></i>スキル</span><span class="main">${fmt2(r.skillCount)}回</span><span class="en">${skStr > 0 ? fmtInt(skStr) : '—'}</span><span class="meta">${esc(PSE.SKILL_JA[ind.sp.skill] || '')} Lv.${state.maxSkill ? PSE.maxSkillLevel(ind.sp.skill) + '（たねで最大）' : c.iv.skillLevel}・${skillMeta}</span></div>
        ${team > 0 ? `<div class="y-row"><span class="lab"><i class="sw t"></i>チーム</span><span class="main">おてつだいボーナス分</span><span class="en">${fmtInt(team)}</span><span class="meta">ほかの4匹のおてつだいが速くなるぶん</span></div>` : ''}
      </div>
      <dl class="kv">
        <div><dt>SP</dt><dd>${fmtInt(rp.rp)}<small>きのみ ${fmtSp(rp.berryRp)}・食材 ${fmtSp(rp.ingredientRp)}・スキル ${fmtSp(rp.skillRp)}</small></dd></div>
        <div><dt>おてつだい時間</dt><dd>${fmtTime(r.baseFreq)}<small>げんきによる短縮の前</small></dd></div>
        <div><dt>おてつだい回数</dt><dd>${fmt1(r.total.all)}回<small>起きている間 ${fmt1(r.awake.all)}・寝ている間 ${fmt1(r.asleep.all)}</small></dd></div>
        <div><dt>最大所持数</dt><dd>${r.carryLimit}個<small>${r.timeToFullInventory < 0 ? '寝ている間にあふれない' : `寝てから${fmtMin(r.timeToFullInventory)}であふれる`}</small></dd></div>
        <div><dt>翌朝スキル発生率</dt><dd>${fmt1(wake.once * 100)}%${twice}</dd></div>
        ${c.iv.pityProcHelpCount > 0 ? `<div><dt>スキルの天井</dt><dd>おてつだい${c.iv.pityProcHelpCount}回<small>スキルが出ないまま続くと、発動が確定する回数</small></dd></div>` : ''}
      </dl>
      <h3 class="card-title">レベルごとの見込み</h3>
      <div class="lvtable-wrap" id="lvTable"></div>
      <p class="note">${ind.from ? `${esc(ind.from.ja)}を${esc(ind.sp.ja)}に進化させた姿の数値です。` : ''}nitoyon さんの「ポケスリ 個体値計算機」と同じ計算です（げんきオール1日3回・料理3回・レシピボーナス25%・レシピLv30・起きている間は3時間ごとに回収・睡眠スコア${state.sleepScore}・好みのきのみなし${state.maxSkill ? '・メインスキルはたねで最大レベル' : ''}）。ランク（理想個体比）は、だいふくさんのチェッカーと同じ別の計算で出しています（「評価のしくみ」を参照）。${/^Tasty Chance|Mystical Fire/.test(ind.sp.skill) ? '料理の大成功確率が上がるぶんは、1日のエナジーには入れていません。' : ''}${RAENONX_DATA.has(ind.sp.en) ? `${esc(ind.sp.ja)}のデータ（おてつだい時間・食材とスキルの確率・食材・最大所持数）${ind.sp.skill === 'Cooking Advance S (Mystical Fire)' ? 'とマジカルフレイムの効果量' : ''}の出典: <a href="https://pks.raenonx.cc/" target="_blank" rel="noopener">RaenonX ポケスリ攻略ツール</a>（登場したばかりのため、確率はこれから少し変わることがあります）。` : ''}</p>`;
    renderLevelTable(ind);
  }
  function renderLevelTable(ind) {
    const el = $('lvTable');
    if (!el) return;
    const spec = ind.sp.spec;
    const qtyHead = { B: 'きのみ/日', I: '食材/日', S: 'スキル/日', A: 'きのみ/日' }[spec];
    const rows = levelsFor(ind).map((L) => {
      const c = refCalc(ind, L, null, 'me');
      const ev = evCache[L];
      const g = ev ? ev.ideal.rank : '…';
      let qty = '—';
      if (c) qty = spec === 'I' ? fmt1(c.r.ingredients.reduce((a, x) => a + x.count, 0)) : spec === 'S' ? fmt2(c.r.skillCount) : fmt1(c.r.berryCount);
      const now = L === Math.min(ind.level, PSE.MAX_LEVEL);
      return `<tr class="${L === state.evalLevel ? 'sel' : ''}"><td>${now ? 'いま ' : ''}Lv${L}</td><td class="g" style="color:var(--g${ev ? rankKey(g) : 'C'})">${g}${ev ? `<small>${fmtPct(ev.ideal.pct)}</small>` : ''}</td><td>${c ? fmtInt(c.rp.rp) : '—'}</td><td>${c ? fmtInt(c.r.totalStrength) : '—'}</td><td>${qty}</td></tr>`;
    }).join('');
    el.innerHTML = `<table class="lvt"><thead><tr><th>レベル</th><th>ランク</th><th>SP</th><th>エナジー/日</th><th>${qtyHead}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- render: check ----------
  function renderCheck(ind, chk) {
    if (!chk) { $('cardCheck').innerHTML = ''; return; }
    const rows = [];
    const row = (cls, ic, html) => rows.push(`<div class="check"><span class="ic ${cls}" aria-hidden="true">${ic}</span><div>${html}</div></div>`);
    if (ind.spShown) {
      if (chk.spOk) row('ok', '✓', `SP ${ind.spShown} は計算と一致しました。せいかく・サブスキル・レベルの読み取りは正しいと考えられます。`);
      else {
        let html = `SPが合いません（画面 ${ind.spShown} ／ 計算 ${chk.calc.rp}）。`;
        if (chk.suggestions.length) {
          html += 'こう直すと一致します:<div class="fixes">' + chk.suggestions.slice(0, 4).map((sg, i) => `<button type="button" class="btn btn-small" data-fix="${i}">${esc(sg.label)}にする</button>`).join('') + '</div>';
        } else html += '読み取り結果を見直してください（サブスキルの S/M、せいかく、食材など）。';
        row('ng', '!', html);
      }
    } else row('na', '–', 'SPが読めなかったので照合していません。画面のSPを入れると照合できます。');
    if (ind.helpTimeShown) {
      row(chk.timeOk ? 'ok' : 'ng', chk.timeOk ? '✓' : '!', `おてつだい時間 ${fmtTime(ind.helpTimeShown)}（計算 ${fmtTime(chk.calc.freq)}）`);
    }
    if (ind.carryShown) {
      let html = `最大所持数 ${ind.carryShown}個（計算 ${chk.carryCalc}個）`;
      if (!chk.carryOk) {
        const diff = chk.carryCalc - ind.carryShown;
        html += diff > 0 && diff % 5 === 0 ? '。進化した姿で出会った個体は、進化ボーナス（1回につき+5）がないぶん少なくなります。評価には画面の値を使っています。' : '。評価には画面の値を使っています。';
      }
      row(chk.carryOk ? 'ok' : 'na', chk.carryOk ? '✓' : '–', html);
    }
    const auto = state.autoFix
      ? `<div class="notice">SPに合わせて「${esc(state.autoFix.label)}」に直しました（読み取りは ${esc(state.autoFix.before)}）。<button type="button" class="btn btn-small" id="undoFix">元に戻す</button></div>`
      : '';
    $('cardCheck').innerHTML = `<h2 class="card-title">読み取りチェック</h2>${auto}<div class="checks">${rows.join('')}</div>`;
    state.lastSuggestions = chk.suggestions;
  }

  function renderUnsupported(ind) {
    const sp = ind.sp;
    const when = sp.arrival ? `（${sp.arrival.replace(/-/g, '/')}登場予定）` : '';
    $('cardVerdict').innerHTML = `<p class="summary">${esc(sp.ja)}はまだデータがそろっていないため評価できません${when}。データが公開されたら対応します。</p>`;
    ['cardWhy', 'cardDay', 'cardCheck'].forEach((id) => { $(id).innerHTML = ''; $(id).hidden = true; });
  }

  // ---------- render orchestration ----------
  let token = 0;
  let evCache = {};
  function scheduleRender() {
    clearTimeout(scheduleRender.t);
    scheduleRender.t = setTimeout(renderAll, 40);
  }
  async function renderAll() {
    const my = ++token;
    $('sampleNote').hidden = state.source !== 'sample';
    if (!state.ind.sp) return;
    const raw = withSettings(state.ind, false);
    const ind = withSettings(state.ind);
    const chk = raw.sp.supported ? runCheck(raw) : null;
    renderSpecimen(raw, chk);
    if (!raw.sp.supported || !ind.sp.supported) { renderUnsupported(raw); return; }
    ['cardWhy', 'cardDay', 'cardCheck'].forEach((id) => { $(id).hidden = false; });
    const levels = levelsFor(ind);
    if (!levels.includes(state.evalLevel)) state.evalLevel = 60;
    evCache = {};
    refCache = new Map();
    const ev = PSE.evaluate(ind, state.evalLevel);
    evCache[state.evalLevel] = ev;
    renderVerdict(ind, ev, evCache, levels);
    renderNumbers(ind, state.evalLevel);
    renderWhy(ind, ev);
    renderCheck(raw, chk);
    for (const L of levels) {
      if (evCache[L]) continue;
      await sleep(0);
      if (my !== token) return;
      evCache[L] = PSE.evaluate(ind, L);
      const strip = $('lvStrip');
      if (strip) strip.innerHTML = stripHtml(ind, evCache, levels);
      renderLevelTable(ind);
    }
  }
  function selectLevel(L) {
    const ind = withSettings(state.ind);
    state.evalLevel = L;
    const ev = evCache[L] || (evCache[L] = PSE.evaluate(ind, L));
    renderVerdict(ind, ev, evCache, levelsFor(ind));
    renderNumbers(ind, L);
    renderWhy(ind, ev);
  }

  // ---------- editor ----------
  function buildEditorStatic() {
    $('speciesList').innerHTML = PSE.SPECIES.map((s) => `<option value="${esc(s.ja)}"></option>`).join('');
    $('inNature').innerHTML = PSE.NATURES.map((n) => `<option value="${n.i}">${esc(n.ja)}（${natureLabel(n)}）</option>`).join('');
    const groups = ['gold', 'blue', 'white'].map((r) => `<optgroup label="${RARITY_JA[r]}">${PSE.SUBSKILLS.filter((s) => s.r === r).map((s) => `<option value="${s.k}">${esc(s.ja)}</option>`).join('')}</optgroup>`).join('');
    $('subFields').innerHTML = PSE.UNLOCK.map((u, i) => `
      <div class="subline-field field" id="f-sub${i}">
        <label class="when" for="inSub${i}"><span class="dot" id="subDot${i}"></span>Lv${u}</label>
        <select id="inSub${i}"><option value="">（なし・不明）</option>${groups}</select>
      </div>`).join('');
    $('sleepSeg').innerHTML = [100, 90, 80, 70].map((v) => `<button type="button" data-sleep="${v}" aria-pressed="${v === state.sleepScore}">${v}</button>`).join('');
    $('skillSeg').innerHTML = [[1, 'たねで最大にする前提'], [0, 'たねの節約ぶんも評価']].map(([v, t]) => `<button type="button" data-maxskill="${v}" aria-pressed="${(v === 1) === !!state.maxSkill}">${t}</button>`).join('');
    $('evoSeg').innerHTML = [[1, '最終進化の姿で評価'], [0, 'そのままの姿で評価']].map(([v, t]) => `<button type="button" data-evolve="${v}" aria-pressed="${(v === 1) === !!state.evolve}">${t}</button>`).join('');
  }
  function buildEditorForSpecies(sp) {
    const max = PSE.maxSkillLevel(sp.skill);
    $('inSkill').innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">Lv.${i + 1}</option>`).join('');
    $('ingFields').innerHTML = [1, 30, 60].map((u, i) => {
      const opts = PSE.slotOptions(sp, i);
      return `<div class="subline-field field" id="f-ing${i}">
        <label class="when" for="inIng${i}">Lv${u}</label>
        <select id="inIng${i}" ${opts.length <= 1 ? 'disabled' : ''}>${opts.map((o, k) => `<option value="${k}">${esc(ingLabel(o))}</option>`).join('')}</select>
      </div>`;
    }).join('');
  }
  let editorSpecies = null;
  function fillEditor() {
    const ind = state.ind;
    const f = state.flags;
    if (editorSpecies !== ind.sp) { buildEditorForSpecies(ind.sp); editorSpecies = ind.sp; }
    $('inSpecies').value = ind.sp.ja;
    $('speciesHint').textContent = f.species
      ? (state.speciesCands ? `候補: ${state.speciesCands.map((x) => x.ja).join('・')}（数値が同じで区別できません）` : '読み取りが不確かです。合っているか確認してください。')
      : `${SPEC_TYPE[ind.sp.spec]}・${PSE.SKILL_JA[ind.sp.skill] || ''}`;
    $('inLevel').value = ind.level;
    $('inSkill').value = String(Math.min(ind.skillLevelShown || 1, PSE.maxSkillLevel(ind.sp.skill)));
    $('inNature').value = String(ind.nature.i);
    ind.subs.forEach((s, i) => {
      $('inSub' + i).value = s ? s.k : '';
      $('subDot' + i).className = 'dot ' + (s ? s.r : '');
    });
    ind.slots.forEach((s, i) => {
      const opts = PSE.slotOptions(ind.sp, i);
      const k = s ? opts.findIndex((o) => o.name === s.name && o.count === s.count) : 0;
      $('inIng' + i).value = String(Math.max(0, k));
    });
    $('inRibbon').value = String(ind.ribbon || 0);
    $('inSp').value = ind.spShown || '';
    $('inTime').value = ind.helpTimeShown ? `${Math.floor(ind.helpTimeShown / 60)}:${String(ind.helpTimeShown % 60).padStart(2, '0')}` : '';
    $('inCarry').value = ind.carryShown || '';
    const flagMap = { 'f-species': f.species, 'f-level': f.level, 'f-skill': f.skill, 'f-nature': f.nature, 'f-sp': f.sp };
    for (let i = 0; i < 5; i++) flagMap['f-sub' + i] = f['sub' + i];
    for (let i = 0; i < 3; i++) flagMap['f-ing' + i] = f['ing' + i];
    for (const [id, on] of Object.entries(flagMap)) { const el = $(id); if (el) el.classList.toggle('flag', !!on); }
  }
  function readEditor(changedId) {
    const ind = Object.assign({}, state.ind);
    const spName = norm($('inSpecies').value);
    const sp = PSE.SPECIES.find((s) => norm(s.ja) === spName);
    if (sp && state.pending) {
      const p = state.pending;
      state.pending = null;
      const f = Object.assign({}, p.flags);
      delete f.species;
      [0, 1, 2].forEach((i) => { if (PSE.slotOptions(sp, i).length > 1) f['ing' + i] = true; });
      const x = Object.assign({}, p.ind, { sp, slots: defaultSlots(sp) });
      applyCounts(sp, x.slots, f, p.data.ingredients);
      if (x.skillLevelShown > PSE.maxSkillLevel(sp.skill)) x.skillLevelShown = PSE.maxSkillLevel(sp.skill);
      finishReading(x, f, Object.assign({}, p.data, { lockSpecies: true }));
      return;
    }
    if (sp && sp !== ind.sp) {
      ind.sp = sp;
      ind.slots = defaultSlots(sp);
      ind.skillLevelShown = Math.max(1, sp.ev + 1);
      ind.spShown = null; ind.helpTimeShown = null; ind.carryShown = null;
      delete state.flags.species;
      state.ind = ind;
      state.autoFix = null;
      fillEditor();
      return;
    }
    const lv = parseInt($('inLevel').value, 10);
    if (lv >= 1 && lv <= 100) ind.level = lv;
    ind.skillLevelShown = parseInt($('inSkill').value, 10) || 1;
    ind.nature = PSE.NATURES[parseInt($('inNature').value, 10)] || PSE.NEUTRAL;
    const subs = [];
    for (let i = 0; i < 5; i++) {
      const s = PSE.SUB_BY_K[$('inSub' + i).value] || null;
      subs.push(s && !subs.includes(s) ? s : null);
      $('subDot' + i).className = 'dot ' + (s ? s.r : '');
    }
    ind.subs = subs;
    ind.slots = [0, 1, 2].map((i) => PSE.slotOptions(ind.sp, i)[parseInt($('inIng' + i).value, 10) || 0] || null);
    ind.ribbon = parseInt($('inRibbon').value, 10) || 0;
    const spv = parseInt($('inSp').value, 10);
    ind.spShown = spv > 0 ? spv : null;
    ind.helpTimeShown = parseTime($('inTime').value);
    const cv = parseInt($('inCarry').value, 10);
    ind.carryShown = cv > 0 ? cv : null;
    const fieldFlag = { inLevel: 'level', inSkill: 'skill', inNature: 'nature', inSp: 'sp' };
    if (changedId) {
      if (fieldFlag[changedId]) delete state.flags[fieldFlag[changedId]];
      const m = changedId.match(/^in(Sub|Ing)(\d)$/);
      if (m) delete state.flags[(m[1] === 'Sub' ? 'sub' : 'ing') + m[2]];
      const el = document.getElementById(changedId)?.closest('.field');
      if (el) el.classList.remove('flag');
    }
    state.ind = ind;
    state.autoFix = null;
  }

  // ---------- history ----------
  function serialize(ind, ev) {
    return {
      t: Date.now(), sp: ind.sp.en, lv: ind.level, n: ind.nature.ja, s: ind.subs.map((x) => (x ? x.k : null)),
      sk: ind.skillLevelShown, i: ind.slots.map((x) => (x ? [x.name, x.count] : null)),
      spv: ind.spShown || null, ht: ind.helpTimeShown || null, c: ind.carryShown || null, r: ind.ribbon || 0,
      d: ind.displayName || '', g: ev ? ev.ideal.rank : '', p: ev ? Math.round(ev.ideal.pct * 10) / 10 : null, gs: gradeSig(),
    };
  }
  function deserialize(o) {
    const sp = PSE.SPECIES.find((s) => s.en === o.sp);
    if (!sp) return null;
    return {
      sp, level: o.lv, nature: PSE.NATURE_BY_JA[o.n] || PSE.NEUTRAL, subs: (o.s || []).map((k) => PSE.SUB_BY_K[k] || null).concat([null, null, null, null, null]).slice(0, 5),
      skillLevelShown: o.sk || 1,
      slots: [0, 1, 2].map((i) => {
        const opts = PSE.slotOptions(sp, i);
        const v = o.i && o.i[i];
        return (v && opts.find((x) => x.name === v[0] && x.count === v[1])) || opts[0] || null;
      }),
      spShown: o.spv, helpTimeShown: o.ht, carryShown: o.c, ribbon: o.r || 0, displayName: o.d || '',
    };
  }
  // grades in the history and the box are re-evaluated when the model or the settings change
  const gradeSig = () => ['m5', state.sleepScore, state.fieldBonus, state.maxSkill ? 1 : 0, state.evolve ? 1 : 0, JSON.stringify(state.evoPick)].join('|');
  // the rank and ideal ratio at Lv60 with the current settings (the same figures as the verdict card)
  function gradeOf(ind) {
    try {
      const x = withSettings(ind);
      if (!x.sp.supported) return null;
      const r = PSE.idealQuick(x, 60);
      return { rank: r.rank, pct: r.pct };
    } catch { return null; }
  }
  const asEv = (g) => (g ? { ideal: g } : null);
  function regradeList(key) {
    const sig = gradeSig();
    const list = store.get(key, []);
    let changed = false;
    for (const o of list) {
      if (o.gs === sig) continue;
      const ind = deserialize(o);
      const g = ind ? gradeOf(ind) : null;
      if (g) { o.g = g.rank; o.p = Math.round(g.pct * 10) / 10; }
      o.gs = sig;
      changed = true;
    }
    if (changed) store.set(key, list);
    return changed;
  }
  function regradeHistory() {
    if (regradeList(HKEY)) renderHistory();
    if (regradeList(BKEY)) { renderMenuCount(); if ($('boxView').open) renderBox(); }
  }
  function saveHistory(ind, replaceT) {
    const item = serialize(ind, asEv(gradeOf(ind)));
    const list = store.get(HKEY, []).filter((x) => x.t !== replaceT && !(x.sp === item.sp && x.lv === item.lv && x.n === item.n && JSON.stringify(x.s) === JSON.stringify(item.s)));
    list.unshift(item);
    store.set(HKEY, list.slice(0, 20));
    renderHistory();
    return item.t;
  }
  function renderHistory() {
    const list = store.get(HKEY, []);
    if (!list.length) {
      $('history').innerHTML = '<p class="empty">スクショを読み取ると、ここに履歴が残ります（このiPhoneの中だけに保存）。</p>';
      return;
    }
    $('history').innerHTML = list.map((o, i) => {
      const sp = PSE.SPECIES.find((s) => s.en === o.sp);
      const name = sp ? sp.ja : o.sp;
      const date = new Date(o.t);
      const d = `${date.getMonth() + 1}/${date.getDate()}`;
      const subs = (o.s || []).filter(Boolean).map((k) => PSE.SUB_BY_K[k]?.ja).filter(Boolean).slice(0, 3).join('・');
      return `<div class="h-item">
        <button type="button" class="h-open" data-h="${i}"><b>${esc(name)}</b> Lv.${o.lv}・${esc(o.n)}<span>${d}｜${esc(subs)}</span></button>
        <span class="h-grade${String(o.g || '').length > 1 ? ' two' : ''}" style="color:var(--g${rankKey(o.g)})" title="Lv60のランク${o.p != null && o.gs && o.gs.startsWith('m5') ? `（理想個体の${o.p}%）` : ''}">${esc(o.g || '')}</span>
        <button type="button" class="h-del" data-hdel="${i}" aria-label="${esc(name)}を履歴から消す">×</button>
      </div>`;
    }).join('');
  }

  // ---------- box: the individuals kept on this device ----------
  // One entry per individual: the same evolution line, nature, sub skills and ingredients is the same individual
  // (re-reading it later, at a higher level or evolved, updates the entry).
  const boxAll = () => store.get(BKEY, []);
  let persistAsked = false;
  const boxPut = (list) => {
    store.set(BKEY, list);
    renderMenuCount();
    // ask the browser to keep this app's storage (best effort; iOS may decide on its own)
    if (!persistAsked && list.length && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
  };
  const speciesOf = (en) => PSE.SPECIES.find((s) => s.en === en) || null;
  const lineOf = (en) => { const sp = speciesOf(en); return sp ? String(sp.anc != null ? sp.anc : sp.en) : String(en); };
  const boxKey = (o) => [lineOf(o.sp), o.n, (o.s || []).map((k) => k || '-').join(','), (o.i || []).map((x) => (x ? x[0] : '-')).join(',')].join('|');
  const newBoxId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // needs checking: the SP on screen did not match, or some fields stayed unsure
  const needsCheck = (ind, unsure) => unsure > 0 || (!!ind.spShown && !spMatches(ind));
  function boxItemOf(ind, extra) {
    const item = serialize(ind, asEv(gradeOf(ind)));
    return Object.assign(item, extra || {});
  }
  /** adds an individual, or updates its entry (by id, or by identity when it is not older than the entry) */
  function boxUpsert(ind, extra, id) {
    const list = boxAll();
    const item = boxItemOf(ind, extra);
    const key = boxKey(item);
    const i = id ? list.findIndex((x) => x.id === id) : list.findIndex((x) => boxKey(x) === key);
    if (i >= 0) {
      const old = list[i];
      if (!id && item.lv < old.lv) return { id: old.id, status: 'kept' };
      list[i] = Object.assign({}, old, item, { id: old.id, a: old.a || old.t });
      boxPut(list);
      return { id: old.id, status: 'updated' };
    }
    item.id = newBoxId();
    item.a = item.t;
    list.unshift(item);
    boxPut(list);
    return { id: item.id, status: 'new' };
  }
  // the box entry of the same individual (by identity), or null
  function boxFind(ind) {
    if (!ind || !ind.sp) return null;
    const key = boxKey(serialize(ind, null));
    return boxAll().find((x) => boxKey(x) === key) || null;
  }
  const boxLinked = () => (state.boxId ? boxAll().find((x) => x.id === state.boxId) || null : null);
  function boxRemove(id) {
    boxPut(boxAll().filter((x) => x.id !== id));
    if (state.boxId === id) state.boxId = null;
  }
  function renderMenuCount() {
    const n = boxAll().length;
    const el = $('menuBoxCount');
    if (el) el.textContent = `${n}匹`;
    const h = $('hBox');
    if (h) { h.hidden = !n; h.textContent = `ボックス ${n}匹`; }
  }

  // ---------- sheets (menu, box, bulk registration, transfer code) ----------
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function openSheet(id) {
    document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== id) d.close(); });
    const d = $(id);
    if (!d.open) d.showModal();
    document.documentElement.classList.add('modal-open');
    if (id === 'menu') $('menuBtn').setAttribute('aria-expanded', 'true');
  }
  function closeSheet(id) {
    const d = $(id);
    if (d && d.open) d.close();
  }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.documentElement.classList.remove('modal-open');
      if (d.id === 'menu') $('menuBtn').setAttribute('aria-expanded', 'false');
    });
    // a tap on the backdrop (outside the panel) closes the menu
    d.addEventListener('click', (e) => { if (e.target === d && d.id === 'menu') d.close(); });
  });

  // ---------- box view ----------
  const RANKS = ['増田', 'SS', 'S', 'A', 'B', 'C', 'D'];
  const TYPE_FILTER = [['', 'すべて'], ['B', 'きのみ'], ['I', '食材'], ['S', 'スキル'], ['A', 'オール']];
  function boxRows() {
    const dexIdx = new Map(PSE.SPECIES.map((s, i) => [s.en, i]));
    return boxAll().map((o) => {
      const sp = speciesOf(o.sp);
      if (!sp) return null;
      const ind = deserialize(o);
      const ev = ind ? withSettings(ind) : null;
      return { o, sp, ind, as: ev ? ev.sp : sp, dex: dexIdx.get(o.sp) ?? 9999 };
    }).filter(Boolean);
  }
  function subChips(o) {
    return (o.s || []).map((k, i) => {
      const s = k && PSE.SUB_BY_K[k];
      if (!s) return '<i class="bx-sub none">？</i>';
      const off = o.lv < PSE.UNLOCK[i];
      return `<i class="bx-sub ${s.r}${off ? ' off' : ''}" title="Lv${PSE.UNLOCK[i]} ${esc(s.ja)}${off ? '（まだ開いていない）' : ''}">${esc(SUB_SHORT[k] || s.ja)}</i>`;
    }).join('');
  }
  function renderBox() {
    regradeList(BKEY);
    const ui = state.boxUi;
    const rows = boxRows();
    $('boxCount').textContent = `${rows.length}匹`;
    // controls
    const types = TYPE_FILTER.filter(([k]) => !k || k !== 'A' || rows.some((r) => r.as.spec === 'A'));
    $('boxType').innerHTML = types.map(([k, t]) => `<button type="button" data-btype="${k}" aria-pressed="${ui.type === k}">${t}</button>`).join('');
    $('boxSort').value = ui.sort;
    const q = norm($('boxSearch').value).toLowerCase();
    let list = rows.filter((r) => (!ui.type || r.as.spec === ui.type)
      && (!q || norm(r.sp.ja).includes(q) || norm(r.as.ja).includes(q) || norm(r.o.d).toLowerCase().includes(q)));
    const counts = Object.fromEntries(RANKS.map((k) => [k, list.filter((r) => r.o.g === k).length]));
    $('boxRanks').innerHTML = RANKS.filter((k) => counts[k] || ui.rank === k).map((k) => `<button type="button" class="rk-chip" data-g="${rankKey(k)}" data-brank="${k}" aria-pressed="${ui.rank === k}"><b>${k}</b>${counts[k]}</button>`).join('');
    if (ui.rank) list = list.filter((r) => r.o.g === ui.rank);
    const byPct = (a, b) => (b.o.p ?? -1) - (a.o.p ?? -1);
    const sorters = {
      ideal: (a, b) => byPct(a, b) || b.o.lv - a.o.lv || (b.o.a || b.o.t) - (a.o.a || a.o.t),
      new: (a, b) => (b.o.a || b.o.t) - (a.o.a || a.o.t),
      dex: (a, b) => a.dex - b.dex || byPct(a, b),
      level: (a, b) => b.o.lv - a.o.lv || byPct(a, b),
    };
    list.sort(sorters[ui.sort] || sorters.ideal);
    if (!rows.length) {
      $('boxList').innerHTML = `<div class="bx-empty">
        <p><b>ボックスはまだ空です。</b></p>
        <p>詳細画面のスクショを何枚かまとめて選ぶと、1枚ずつ読み取ってここに入れます。チェックした個体を「ボックスに入れる」で1匹ずつ足すこともできます。</p>
        <button type="button" class="btn btn-moon" data-go="bulk">まとめて登録する</button>
      </div>`;
      return;
    }
    if (!list.length) { $('boxList').innerHTML = '<p class="bx-empty">条件に合う個体がありません。</p>'; return; }
    $('boxList').innerHTML = `<p class="bx-note">ランクと％は Lv60 のとき（${state.evolve ? '進化前は最終進化の姿' : 'いまの姿'}）の理想個体比です。</p>` + list.map((r) => {
      const o = r.o;
      const g = o.g || '';
      const p = o.p != null ? o.p : null;
      const nat = PSE.NATURE_BY_JA[o.n] || PSE.NEUTRAL;
      const evo = r.as !== r.sp ? `<small class="bx-evo">→${esc(r.as.ja)}で評価</small>` : '';
      const nick = o.d && norm(o.d) !== norm(r.sp.ja) && !norm(o.d).startsWith(norm(r.sp.ja)) ? `<small class="bx-nick">${esc(o.d)}</small>` : '';
      const chk = o.ck ? '<small class="bx-check">要確認</small>' : '';
      return `<div class="bx-item">
        <button type="button" class="bx-open" data-box="${esc(o.id)}">
          <span class="bx-medal" data-g="${rankKey(g)}" style="--fill:${Math.max(0, Math.min(100, p || 0))}"><span class="${g.length > 1 ? 'two' : ''}">${esc(g || '–')}</span></span>
          <span class="bx-text">
            <span class="bx-name"><b>${esc(r.sp.ja)}</b><span class="bx-lv num">Lv.${o.lv}</span>${evo}${nick}${chk}</span>
            <span class="bx-nature">${esc(nat.ja)}<small>${natureLabel(nat)}</small></span>
            <span class="bx-subs">${subChips(o)}</span>
          </span>
          <span class="bx-pct num">${p != null ? `${p.toFixed(1)}<small>%</small>` : '—'}</span>
        </button>
        <button type="button" class="bx-del" data-boxdel="${esc(o.id)}" aria-label="${esc(r.sp.ja)} Lv.${o.lv}をボックスから外す">×</button>
      </div>`;
    }).join('');
  }
  function saveBoxUi() { store.set(BUKEY, state.boxUi); }
  function openBoxItem(id) {
    const o = boxAll().find((x) => x.id === id);
    const ind = o && deserialize(o);
    if (!ind) return;
    state.ind = ind; state.flags = {}; state.source = 'box'; state.autoFix = null; state.historyT = null; state.boxId = id;
    state.pending = null; state.speciesCands = null;
    state.evalLevel = ind.level >= 60 ? 70 : 60;
    closeSheet('boxView'); closeSheet('bulkView');
    fillEditor(); renderAll();
    setStatus(o.ck
      ? `ボックスの${esc(ind.sp.ja)} Lv.${ind.level}です。読み取りに不確かなところがあった個体なので、「読み取り結果を直す」で確かめてください（直すとボックスにも反映します）。`
      : `ボックスの${esc(ind.sp.ja)} Lv.${ind.level}を表示しています。直すとボックスにも反映します。`, o.ck ? '' : 'ok');
    if (o.ck) $('editor').open = true;
    $('cardSpecimen').scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
  // the box status of the individual on screen, under its name
  function boxActionHtml() {
    if (state.source === 'sample' || !state.ind.sp || !state.ind.sp.supported) return '';
    const linked = boxLinked();
    if (linked && linked.ck) {
      return '<div class="box-act"><span class="box-in warn">ボックスに入っています（要確認）</span><button type="button" class="btn btn-small" id="boxChecked">確かめた</button></div>';
    }
    if (linked) {
      return '<div class="box-act"><span class="box-in">ボックスに入っています</span><button type="button" class="btn btn-small" data-go="box">ボックスを見る</button></div>';
    }
    state.boxId = null;
    const hit = boxFind(state.ind);
    if (hit) {
      return `<div class="box-act"><span class="box-in">ボックスに同じ個体（Lv.${hit.lv}）があります</span><button type="button" class="btn btn-small" id="boxUpdate" data-id="${esc(hit.id)}">この内容で更新</button></div>`;
    }
    return '<div class="box-act"><button type="button" class="btn btn-small btn-accent" id="boxAdd">＋ ボックスに入れる</button></div>';
  }
  const currentCheck = () => needsCheck(state.ind, Object.keys(state.flags || {}).filter((k) => !/^ing/.test(k) || state.ind.level >= [1, 30, 60][+k.slice(3)]).length);

  // ---------- on-device reading (OCR) ----------
  function setStatus(html, tone, spinning) {
    const el = $('status');
    el.dataset.tone = tone || '';
    el.innerHTML = (spinning ? '<span class="spinner" aria-hidden="true"></span>' : '') + html;
  }

  const splitSkill = (ja) => String(ja || '').split(/\s*[()（）]\s*/).filter(Boolean);
  const skillNamesOf = (key) => splitSkill(PSE.SKILL_JA[key]).map(norm);
  const OCR_VOCAB = {
    species: PSE.SPECIES.filter((s) => s.ja),
    natures: PSE.NATURES,
    subskills: PSE.SUBSKILLS,
    skills: Object.entries(PSE.SKILL_JA).filter(([, ja]) => ja && !ja.includes('不明'))
      .map(([key, ja]) => ({ key, names: [...new Set([ja.replace(/\s/g, ''), ...splitSkill(ja)])] })),
    effects: { speed: 'おてつだいスピード', energy: 'げんき回復量', ing: '食材おてつだい確率', skill: 'メインスキル発生確率', exp: 'EXP獲得量' },
  };

  const num = (v) => { const n = typeof v === 'number' ? v : parseInt(norm(v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  function effectFromLabel(s) {
    const t = norm(s);
    if (!t) return null;
    if (t.includes('スピード')) return 'speed';
    if (t.includes('げんき') || t.includes('元気')) return 'energy';
    if (t.includes('食材')) return 'ing';
    if (t.includes('スキル')) return 'skill';
    if (t.toUpperCase().includes('EXP')) return 'exp';
    return null;
  }
  function matchSpecies(name, display) {
    const tries = [name, display].filter(Boolean).map(norm);
    for (const t of tries) { const hit = PSE.SPECIES.find((s) => norm(s.ja) === t); if (hit) return { sp: hit, sure: true }; }
    const base = (x) => norm(x).replace(/[（(].*$/, '');
    for (const t of tries) {
      const hits = PSE.SPECIES.filter((s) => base(s.ja) === base(t));
      if (hits.length) return { sp: hits.find((h) => !/[（(]/.test(h.ja)) || hits[0], sure: hits.length === 1 };
    }
    return { sp: null, sure: false };
  }
  // A name read short can be the start of an evolution's name (ムウマージ read as ムウマ). When the skill on
  // screen belongs to that evolution, follow the skill, and ask to check the name.
  function followSkill(sp, data, flags) {
    const skill = data && data.mainSkillName ? norm(data.mainSkillName) : null;
    if (!sp || !skill || skillNamesOf(sp.skill).includes(skill)) return sp;
    const kin = PSE.SPECIES.filter((s) => s.supported && s !== sp && s.anc === sp.anc && norm(s.ja).startsWith(norm(sp.ja))
      && skillNamesOf(s.skill).includes(skill));
    if (kin.length !== 1) return sp;
    flags.species = true;
    return kin[0];
  }
  function matchNature(name, up, down) {
    const byName = PSE.NATURES.find((n) => norm(n.ja) === norm(name));
    const u = effectFromLabel(up), d = effectFromLabel(down);
    let byArrows = null;
    if (u && d) {
      const c = PSE.NATURES.filter((n) => n.up === u && n.down === d);
      if (c.length === 1) byArrows = c[0];
    }
    if (byName && (!byArrows || byArrows === byName)) return { nature: byName, sure: true };
    if (byName) return { nature: byName, sure: false };
    if (byArrows) return { nature: byArrows, sure: true };
    return { nature: PSE.NEUTRAL, sure: false };
  }

  function buildFromReading(data) {
    const flags = {};
    const m = matchSpecies(data.species, data.displayName);
    if (!m.sure) flags.species = true;
    const sp = followSkill(m.sp, data, flags);
    let level = num(data.level);
    if (!level || level > 100) { level = 30; flags.level = true; }
    const nat = matchNature(data.nature, data.natureUp, data.natureDown);
    if (!nat.sure) flags.nature = true;
    const subs = [null, null, null, null, null];
    (Array.isArray(data.subSkills) ? data.subSkills : []).forEach((x, k) => {
      if (!x || !x.name) return;
      const s = PSE.SUB_BY_JA[norm(x.name)] || PSE.SUBSKILLS.find((y) => norm(y.ja) === norm(x.name));
      let idx = PSE.UNLOCK.indexOf(num(x.unlock));
      if (idx < 0) idx = k;
      if (idx > 4 || !s || subs.includes(s)) return;
      subs[idx] = s;
      if (x.unsure) flags['sub' + idx] = true;
    });
    subs.forEach((s, i) => { if (!s) flags['sub' + i] = true; });
    let skillLevelShown = num(data.mainSkillLevel);
    const maxSl = sp ? PSE.maxSkillLevel(sp.skill) : 8;
    if (!skillLevelShown || skillLevelShown > maxSl) { skillLevelShown = sp ? Math.max(1, sp.ev + 1) : 1; flags.skill = true; }
    let helpTime = typeof data.helpTime === 'number' ? Math.round(data.helpTime) : parseTime(data.helpTime);
    if (!(helpTime > 0)) helpTime = null;
    // ingredients are icons: start from the first option of each slot, use the "x4" badge counts read
    // under locked slots, and let the SP decide the unlocked ones later
    const slots = sp ? defaultSlots(sp) : [null, null, null];
    if (sp) {
      [0, 1, 2].forEach((i) => { if (PSE.slotOptions(sp, i).length > 1) flags['ing' + i] = true; });
      applyCounts(sp, slots, flags, data.ingredients);
    }
    return {
      flags,
      ind: {
        sp, level, nature: nat.nature, subs, skillLevelShown, slots,
        spShown: num(data.sp), helpTimeShown: helpTime, carryShown: num(data.carry),
        ribbon: 0, displayName: typeof data.displayName === 'string' ? data.displayName.slice(0, 40) : '',
      },
    };
  }

  // The ingredient whose icon fits clearly best among the given options, or null. Fits are trusted only
  // when the icon was seen cleanly (not hidden behind the name card) and one option stands out.
  const ICON_OK = 200, ICON_MARGIN = 1.8;
  function iconRank(c, options) {
    if (!c || !c.icon || !c.icon.err) return [];
    return [...new Set(options.map((o) => o.name))].map((n) => ({ name: n, err: c.icon.err[n] }))
      .filter((x) => x.err != null).sort((a, b) => a.err - b.err);
  }
  function iconPick(c, options, margin) {
    const r = iconRank(c, options);
    if (!r.length || r[0].err > ICON_OK) return null;
    if (r.length > 1 && r[1].err < r[0].err * (margin || ICON_MARGIN)) return null;
    return r[0].name;
  }

  // The count on a badge among the counts this slot can have: { n, strong } or null. A badge read by the badge
  // font's glyphs scores every count, so the slot's own counts are compared directly; "strong" when one of them
  // fits clearly and well.
  function countPick(c, options) {
    if (!c) return null;
    const counts = [...new Set(options.map((o) => o.count))];
    if (c.countScores) {
      const r = counts.map((n) => ({ n, e: c.countScores[n] })).filter((x) => x.e != null).sort((a, b) => a.e - b.e);
      if (!r.length || r[0].e > 0.18) return null;
      if (r.length === 1) return { n: r[0].n, strong: false };
      if (r[0].e >= 0.8 * r[1].e) return null;
      return { n: r[0].n, strong: r[0].e <= 0.12 && r[0].e < 0.6 * r[1].e };
    }
    return c.count && counts.includes(c.count) ? { n: c.count, strong: false } : null;
  }

  // Ingredients from the badges: the icon itself, the "x4" count, and identical icons across slots
  // (or different ones) carrying a known slot's ingredient over (or ruling it out).
  function applyCounts(sp, slots, flags, counts) {
    const U = [1, 30, 60];
    const byU = {};
    for (const c of counts || []) byU[c.unlock] = c;
    if (!Object.keys(byU).length) return;
    const all = [0, 1, 2].map((i) => PSE.slotOptions(sp, i));
    const cand = all.map((o) => o.slice());
    const unsure = [false, false, false];
    [0, 1, 2].forEach((i) => {
      const c = byU[U[i]];
      if (!c) return;
      const cn = countPick(c, all[i]);
      if (cn) { const f = cand[i].filter((o) => o.count === cn.n); if (f.length) cand[i] = f; }
      const pick = iconPick(c, cand[i]);
      if (pick) cand[i] = cand[i].filter((o) => o.name === pick);
      // an icon that clearly shows an ingredient the count rules out: one of the two is wrong. A clearly read
      // count stands; otherwise the icon does. Either way the slot is marked for checking.
      const other = iconPick(c, all[i], 3);
      if (other && !cand[i].some((o) => o.name === other)) {
        if (!(cn && cn.strong)) cand[i] = all[i].filter((o) => o.name === other);
        unsure[i] = true;
      }
    });
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if (i === j || cand[j].length !== 1) continue;
        const rel = byU[U[i]] && byU[U[i]].same ? byU[U[i]].same[U[j]] : undefined;
        if (rel === undefined) continue;
        const name = cand[j][0].name;
        const f = cand[i].filter((o) => (rel ? o.name === name : o.name !== name));
        if (f.length) cand[i] = f;
      }
    }
    [0, 1, 2].forEach((i) => {
      if (!byU[U[i]] || !cand[i].length) return;
      if (cand[i].length > 1) {
        // still open: lean on whichever fits the icon best, even without a clear margin
        const r = iconRank(byU[U[i]], cand[i]);
        if (r.length && r[0].err <= ICON_OK) cand[i].sort((a, b) => (a.name === r[0].name ? -1 : b.name === r[0].name ? 1 : 0));
      }
      slots[i] = cand[i][0];
      if (cand[i].length === 1 && !unsure[i]) delete flags['ing' + i]; else flags['ing' + i] = true;
    });
  }

  function spMatches(x) {
    const tot = PSE.sumSubs(PSE.activeSubs(x.subs, x.level));
    const r = PSE.computeSP(x.sp, {
      level: x.level, nature: x.nature, subs: x.subs, slots: x.slots, ribbon: x.ribbon || 0,
      skillLevelBase: Math.max(1, (x.skillLevelShown || 1) - tot.slu),
    });
    if (r.rp !== x.spShown) return false;
    if (x.helpTimeShown && !timeMatches(x, tot)) return false;
    return true;
  }
  // help time on screen, with or without the Pokémon's own Helping Bonus
  function timeMatches(x, tot) {
    const f = (hb) => Math.floor(PSE.frequency(x.sp, x.level, x.nature, tot, x.ribbon || 0, hb));
    return Math.abs(f(0) - x.helpTimeShown) <= 1 || (tot.hb > 0 && Math.abs(f(1) - x.helpTimeShown) <= 1);
  }
  function carryFits(sp, tot, carryShown) {
    if (!carryShown) return true;
    const d = carryShown - (sp.carry + 5 * Math.max(0, sp.ev) + 6 * tot.inv);
    return [0, 1, 3, 6, 8].some((r) => d - r <= 0 && (d - r) % 5 === 0);
  }
  function slotCombos(sp, level, current) {
    const opts = [0, 1, 2].map((i) => {
      const o = PSE.slotOptions(sp, i);
      if (!o.length) return [null];
      const unlocked = level >= [1, 30, 60][i];
      if (unlocked) return o;
      const cur = current && current[i] && o.find((x) => x.name === current[i].name && x.count === current[i].count);
      return [cur || o[0]];
    });
    if (!sp.myth) opts[0] = opts[0].slice(0, 1);
    const out = [];
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) out.push([a, b, c]);
    return out;
  }
  // Search the readings that reproduce the SP (and help time) shown on screen.
  function resolveReading(ind, flags, data) {
    const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
    const eff = data.effectsSeen || [];
    let natures = [ind.nature];
    if (flags.nature) {
      if (data.natureNeutral) natures = [PSE.NEUTRAL];
      else if (eff.length >= 2) natures = PSE.NATURES.filter((n) => n.up && eff.includes(n.up) && eff.includes(n.down));
      else natures = PSE.NATURES;
      if (!natures.length) natures = PSE.NATURES;
    }
    const levels = [ind.level, ...(data.levelCandidates || [])].filter((v, i, a) => v >= 1 && v <= 100 && a.indexOf(v) === i);
    if (!ind.spShown) return resolveWithoutSP(ind, flags, data, natures, levels);
    const search = (list) => {
      const out = [];
      for (const sp of list) {
        const sls = flags.skill ? range(PSE.maxSkillLevel(sp.skill)) : [Math.min(ind.skillLevelShown || 1, PSE.maxSkillLevel(sp.skill))];
        for (const nature of natures) for (const level of levels) for (const skillLevelShown of sls) {
          if (ind.carryShown && !carryFits(sp, PSE.sumSubs(PSE.activeSubs(ind.subs, level)), ind.carryShown)) continue;
          for (const slots of slotCombos(sp, level, sp === ind.sp ? ind.slots : null)) {
            const x = Object.assign({}, ind, { sp, nature, level, skillLevelShown, slots });
            if (spMatches(x)) out.push(x);
          }
        }
      }
      return out;
    };
    let found = ind.sp && ind.sp.supported ? search([ind.sp]) : [];
    if (!found.length && !data.lockSpecies) {
      const skill = data.mainSkillName ? norm(data.mainSkillName) : null;
      found = search(PSE.SPECIES.filter((s) => s.supported && s !== ind.sp && (!skill || skillNamesOf(s.skill).includes(skill))));
    }
    if (!found.length) return null;
    // another species of the read name's evolution line is likelier than an unrelated one (ムウマージ read as ムウマ)
    const kin = (s) => ind.sp && s.anc === ind.sp.anc;
    const diff = (x) => (x.sp === ind.sp ? 0 : kin(x.sp) ? 4 : 8) + (x.level === ind.level ? 0 : 4) + (x.nature === ind.nature ? 0 : 2) + (x.skillLevelShown === ind.skillLevelShown ? 0 : 1);
    // when several ingredient choices give the same SP, the one that fits the icons (and the "x4"
    // counts) better comes first
    const byU = {};
    for (const c of data.ingredients || []) byU[c.unlock] = c;
    const iconCost = (x) => {
      let cost = 0;
      [0, 1, 2].forEach((i) => {
        const c = byU[[1, 30, 60][i]];
        if (!c || !x.slots[i]) return;
        const cn = countPick(c, PSE.slotOptions(x.sp, i));
        if (cn && x.slots[i].count !== cn.n) cost += Math.log(cn.strong ? 16 : 4);
        const r = iconRank(c, PSE.slotOptions(x.sp, i));
        if (!r.length || r[0].err > ICON_OK) return;
        const e = r.find((y) => y.name === x.slots[i].name);
        if (e) cost += Math.log(Math.max(e.err, 1) / Math.max(r[0].err, 1));
      });
      return cost;
    };
    found.forEach((x) => { x.$cost = iconCost(x); });
    found.sort((a, b) => diff(a) - diff(b) || a.$cost - b.$cost);
    const best = found[0];
    const close = found.filter((x) => diff(x) === diff(best) && x.$cost - best.$cost < Math.log(ICON_MARGIN));
    found.forEach((x) => { delete x.$cost; });
    const f = Object.assign({}, flags);
    const uniq = (fn) => new Set(found.map(fn)).size === 1;
    const setFlag = (k, on) => { if (on) f[k] = true; else delete f[k]; };
    setFlag('species', !uniq((x) => x.sp.en));
    setFlag('level', !uniq((x) => x.level));
    setFlag('nature', !uniq((x) => x.nature.up + '|' + x.nature.down));
    setFlag('skill', !uniq((x) => x.skillLevelShown));
    [0, 1, 2].forEach((i) => {
      if (PSE.slotOptions(best.sp, i).length <= 1) { delete f['ing' + i]; return; }
      if (best.level >= [1, 30, 60][i]) setFlag('ing' + i, new Set(close.map((x) => x.slots[i] && x.slots[i].name + x.slots[i].count)).size > 1);
    });
    const cands = [...new Set(found.map((x) => x.sp))];
    return { ind: best, flags: f, speciesCands: cands.length > 1 ? cands : null };
  }

  // No SP on screen: the species can still be told apart by its help time and carry limit.
  function resolveWithoutSP(ind, flags, data, natures, levels) {
    if (!ind.helpTimeShown || (ind.sp && !flags.species) || data.lockSpecies) return null;
    const skill = data.mainSkillName ? norm(data.mainSkillName) : null;
    const hits = new Map();
    for (const sp of PSE.SPECIES) {
      if (!sp.supported || (skill && !skillNamesOf(sp.skill).includes(skill))) continue;
      for (const nature of natures) for (const level of levels) {
        const tot = PSE.sumSubs(PSE.activeSubs(ind.subs, level));
        const x = { sp, level, nature, ribbon: ind.ribbon || 0, helpTimeShown: ind.helpTimeShown };
        if (timeMatches(x, tot) && carryFits(sp, tot, ind.carryShown) && !hits.has(sp)) hits.set(sp, { nature, level });
      }
    }
    if (hits.size !== 1) return null;
    const [[sp, v]] = [...hits];
    const f = Object.assign({}, flags, { species: true });
    const slots = defaultSlots(sp);
    [0, 1, 2].forEach((i) => { if (PSE.slotOptions(sp, i).length > 1) f['ing' + i] = true; });
    applyCounts(sp, slots, f, data.ingredients);
    return { ind: Object.assign({}, ind, { sp, slots, nature: v.nature, level: v.level }), flags: f };
  }

  // Carry limit on screen: lower by 5 per evolution if caught already evolved, higher with a Good Night Ribbon.
  function checkCarry(ind, flags) {
    if (!ind.carryShown) return;
    const tot = PSE.sumSubs(PSE.activeSubs(ind.subs, ind.level));
    const calc = ind.sp.carry + 5 * Math.max(0, ind.sp.ev) + 6 * tot.inv;
    const diff = ind.carryShown - calc;
    if (diff <= 0 && diff % 5 === 0) return;
    if (ind.sp.el === 0) {
      const r = [1, 2, 3, 4].find((k) => { const d = diff - [0, 1, 3, 6, 8][k]; return d <= 0 && d % 5 === 0; });
      if (r) { ind.ribbon = r; return; }
    }
    ind.carryShown = null;
  }

  function describeChanges(before, after) {
    const out = [];
    if (before.sp !== after.sp) out.push(after.sp.ja);
    if (before.level !== after.level) out.push(`Lv.${after.level}`);
    if (before.nature !== after.nature) out.push(`せいかく ${after.nature.ja}`);
    if (before.skillLevelShown !== after.skillLevelShown) out.push(`メインスキル Lv.${after.skillLevelShown}`);
    return out;
  }
  function describePatch(ind, patch) {
    if (patch.skillLevelShown) return `メインスキル Lv.${ind.skillLevelShown}`;
    if (patch.ribbon != null) return `おやすみリボン ${ind.ribbon || 0}`;
    if (patch.nature) return `せいかく ${ind.nature.ja}`;
    if (patch.level) return `Lv.${ind.level}`;
    if (patch.subs) { const i = patch.subs.findIndex((s, k) => s !== ind.subs[k]); return i >= 0 ? `Lv${PSE.UNLOCK[i]}のサブスキル ${ind.subs[i] ? ind.subs[i].ja : '（なし）'}` : '元の読み取り'; }
    if (patch.slots) return `食材 ${ind.slots.slice(1).map(ingLabel).join(' / ')}`;
    return '元の読み取り';
  }

  function applyReading(data) {
    if (!data || !data.isDetailScreen) {
      setStatus('ポケモンの詳細画面が見つかりませんでした。名前・SP・サブスキル・せいかくが写っている画面を選んでください。', 'error');
      return;
    }
    const r = buildFromReading(data);
    finishReading(r.ind, r.flags, data);
  }
  // A reading -> the individual it most likely is. Nothing on screen changes (used by single and bulk reading).
  // preset: the individual and flags already built from the reading.
  function resolveData(data, preset) {
    if (!data || !data.isDetailScreen) return { error: 'screen' };
    let read, flags;
    if (preset) { read = preset.ind; flags = preset.flags; } else { const b = buildFromReading(data); read = b.ind; flags = b.flags; }
    let ind = Object.assign({}, read);
    let autoFix = null;
    let res = resolveReading(ind, flags, data);
    // "1,276" whose comma was read as a digit ("11276"): try the number without it
    if (!res && data.spAlt && data.spAlt !== ind.spShown) {
      res = resolveReading(Object.assign({}, ind, { spShown: data.spAlt }), flags, data);
      if (res) read = Object.assign({}, read, { spShown: data.spAlt });
    }
    if (res) {
      const changes = describeChanges(read, res.ind);
      if (changes.length && read.sp) autoFix = { label: changes.join('・'), before: describeChanges(res.ind, read).join('・'), prev: read };
      ind = res.ind;
      flags = res.flags;
    }
    const speciesCands = res && res.speciesCands ? res.speciesCands : null;
    if (!ind.sp) return { error: 'species', ind, flags };
    if (!res && ind.sp.supported) {
      const chk = runCheck(withSettings(ind, false));
      if (chk && chk.spOk === false && chk.suggestions.length === 1) {
        const before = ind;
        ind = Object.assign({}, ind, chk.suggestions[0].patch);
        autoFix = { label: chk.suggestions[0].label, before: describePatch(before, chk.suggestions[0].patch), prev: before };
      }
    }
    if (ind.sp.supported) checkCarry(ind, flags);
    const unsure = Object.keys(flags).filter((k) => !/^ing/.test(k) || ind.level >= [1, 30, 60][+k.slice(3)]).length;
    return { ind, flags, autoFix, speciesCands, unsure, spOk: ind.spShown ? spMatches(ind) : null };
  }
  function finishReading(read, flags, data) {
    const r = resolveData(data, { ind: read, flags });
    state.speciesCands = r.speciesCands || null;
    if (r.error === 'species') {
      state.pending = { ind: r.ind, flags: r.flags, data };
      setStatus('ポケモンの種類を特定できませんでした。下の「読み取り結果を直す・手入力する」でポケモンを選ぶと、読み取った内容で評価します。', 'error');
      $('editor').open = true;
      $('inSpecies').value = '';
      $('inSpecies').focus();
      return;
    }
    state.pending = null;
    const ind = r.ind;
    state.flags = r.flags;
    state.ind = ind;
    state.source = 'ocr';
    state.autoFix = r.autoFix;
    state.evalLevel = ind.level >= 60 ? 70 : 60;
    // the same individual already in the box: keep its entry up to date
    state.boxId = null;
    let boxNote = '';
    if (ind.sp.supported) {
      const hit = boxFind(ind);
      if (hit && ind.level >= hit.lv) {
        state.boxId = boxUpsert(ind, { ck: needsCheck(ind, r.unsure) }, hit.id).id;
        boxNote = 'ボックスの同じ個体も更新しました。';
      } else if (hit) {
        boxNote = `ボックスには同じ個体のLv.${hit.lv}のデータがあります。`;
      }
    }
    const spNote = r.spOk === null ? 'SPが読めなかったので、照合はしていません。' : r.spOk ? 'SPも計算と一致しました。' : 'SPが計算と合いません。下の「読み取りチェック」を見てください。';
    const candNote = state.speciesCands ? `ポケモンは ${state.speciesCands.map((x) => x.ja).join('・')} のどれかで、数値だけでは区別できません。違うときは選び直してください。` : '';
    const note = (state.readNote || '') + boxNote;
    state.readNote = '';
    setStatus(r.unsure
      ? `読み取りました。${spNote}${candNote}確認してほしい項目が${r.unsure}つあります（「読み取り結果を直す」のオレンジ色の欄）。${note}`
      : `読み取りました。${spNote}${note}`, 'ok');
    fillEditor();
    state.historyT = ind.sp.supported ? saveHistory(ind) : null;
    renderAll();
    $('cardVerdict').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  // Two screenshots belong together (top and bottom of one Pokémon's screen) unless what both show disagrees:
  // the SP, the level, the species, the nature or a sub skill read on both.
  function sameIndividual(a, b) {
    if (!a || !b) return true;
    const sa = [a.sp, a.spAlt].filter((v) => v != null), sb = [b.sp, b.spAlt].filter((v) => v != null);
    if (sa.length && sb.length && !sa.some((v) => sb.includes(v))) return false;
    if (a.level != null && b.level != null && a.level !== b.level) return false;
    if (a.species && b.species && a.species !== b.species) return false;
    if (a.nature && b.nature && a.nature !== b.nature) return false;
    for (let i = 0; i < 5; i++) {
      const x = (a.subSkills || [])[i], y = (b.subSkills || [])[i];
      if (x && y && x.name && y.name && !x.unsure && !y.unsure && x.name !== y.name) return false;
    }
    return true;
  }

  // what the reader is doing, for a progress line: { stage, pct } or null (nothing worth showing)
  function ocrStage(m, which) {
    const st = String(m.status || '');
    if (st === 'pass') return { stage: `${which}読み取り中…（${m.pass}/${m.total}）`, pct: null };
    if (st === 'counts') return { stage: `${which}食材の個数を確認中…`, pct: null };
    if (m.eng && st.includes('loading language traineddata')) return { stage: '数字データを読み込み中…', pct: m.progress };
    if (m.eng) return null;
    if (st.includes('loading tesseract core')) return { stage: '読み取りの準備中（初回だけ約9MBを読み込みます）…', pct: m.progress };
    if (st.includes('loading language traineddata')) return { stage: '日本語データを読み込み中…', pct: m.progress };
    if (st.includes('recognizing text')) return { stage: null, pct: m.progress };
    return null;
  }

  let reading = false, readAgain = false;
  async function startReading() {
    if (!state.files.length) return;
    if (bulk.running) { setStatus('まとめて登録の途中です。終わってからもう一度選んでください。', 'error'); return; }
    if (reading) { readAgain = true; return; }
    reading = true;
    let stage = '読み取りの準備中…', pct = null;
    const paint = () => setStatus(`${stage}${pct != null ? ` ${Math.round(pct * 100)}%` : ''}`, '', true);
    paint();
    try {
      // each screenshot is read once; the result is kept with it
      const todo = state.files.filter((x) => !x.result);
      for (let i = 0; i < todo.length; i++) {
        const which = todo.length > 1 ? `${i + 1}枚目を` : '';
        todo[i].result = await OCR.read(todo[i].file, {
          vocab: OCR_VOCAB,
          onProgress: (m) => {
            const s = ocrStage(m, which);
            if (!s) return;
            if (s.stage) stage = s.stage;
            pct = s.pct;
            paint();
          },
        });
      }
      // only the screenshots of the newest one's Pokémon are read together; older ones of another
      // individual are put away (picking a new Pokémon's screenshot without removing the last one)
      const last = state.files[state.files.length - 1];
      const keep = state.files.filter((x) => x === last || sameIndividual(x.result, last.result));
      state.readNote = '';
      if (keep.length < state.files.length) {
        state.files.filter((x) => !keep.includes(x)).forEach((x) => URL.revokeObjectURL(x.url));
        state.files = keep;
        renderThumbs();
        state.readNote = '前のスクショは別の個体だったので外しました。';
      }
      applyReading(OCRParse.merge(keep.map((x) => x.result).reverse()));
    } catch (e) {
      console.error(e);
      setStatus('読み取りに失敗しました。通信状態を確かめてもう一度試すか、下の「読み取り結果を直す・手入力する」で入力してください。 <button type="button" class="btn btn-night btn-small" id="retryRead">もう一度読み取る</button>', 'error');
    } finally {
      reading = false;
      if (readAgain) { readAgain = false; startReading(); }
    }
  }

  // ---------- bulk registration: many screenshots, one individual each, into the box ----------
  const bulk = { running: false, stop: false, rows: [], cur: -1, stage: '', pct: null, lock: null };
  const BULK_MARK = { ok: '✓', check: '!', fail: '×', merged: '↓', wait: '', reading: '' };
  function bulkRowHtml(r) {
    const open = !bulk.running && (r.state === 'ok' || r.state === 'check') && r.id;
    const body = `<span class="bk-no num">${r.k + 1}</span>
      <span class="bk-text">${r.state === 'reading' ? '<span class="spinner dark" aria-hidden="true"></span>' : ''}${r.html || '<span class="bk-wait">待っています</span>'}</span>
      <span class="bk-mark" aria-hidden="true">${BULK_MARK[r.state] || ''}</span>`;
    return open
      ? `<button type="button" class="bk-row" data-state="${r.state}" data-box="${esc(r.id)}">${body}</button>`
      : `<div class="bk-row" data-state="${r.state}">${body}</div>`;
  }
  function bulkSummary() {
    const rows = bulk.rows;
    const n = (f) => rows.filter(f).length;
    const added = n((r) => (r.state === 'ok' || r.state === 'check') && r.status === 'new');
    const updated = n((r) => (r.state === 'ok' || r.state === 'check') && r.status === 'updated');
    const kept = n((r) => (r.state === 'ok' || r.state === 'check') && r.status === 'kept');
    const check = n((r) => r.state === 'check');
    const fail = n((r) => r.state === 'fail');
    const read = n((r) => r.state !== 'wait' && r.state !== 'reading');
    const parts = [`${read}枚を読み取りました。`];
    const box = [added && `新しく${added}匹`, updated && `更新${updated}匹`].filter(Boolean).join('・');
    parts.push(box ? `ボックスに${box}。` : 'ボックスに入った個体はありません。');
    if (kept) parts.push(`${kept}匹は、ボックスの方が新しいデータでした。`);
    if (check) parts.push(`<b>確認が必要な個体が${check}匹</b>あります（!の行）。タップして直してください。`);
    if (fail) parts.push(`${fail}枚は読み取れませんでした。`);
    return parts.join('');
  }
  function renderBulk() {
    const total = bulk.rows.length;
    $('bulkRun').hidden = !total;
    $('bulkPick').hidden = bulk.running;
    if (!total) { $('bulkList').innerHTML = ''; return; }
    const done = bulk.rows.filter((r) => r.state !== 'wait' && r.state !== 'reading').length;
    $('bulkHead').innerHTML = bulk.running
      ? `<b class="num">${Math.min(done + 1, total)} / ${total}枚</b><span>${esc(bulk.stop ? '止めています…（この1枚が終わったら止まります）' : (bulk.stage || '読み取り中…') + (bulk.pct != null ? ` ${Math.round(bulk.pct * 100)}%` : ''))}</span>`
      : `<span>${bulkSummary()}</span>`;
    $('bulkBar').style.width = `${(done / total) * 100}%`;
    $('bulkStop').hidden = !bulk.running;
    $('bulkDone').hidden = bulk.running;
    $('bulkList').innerHTML = bulk.rows.map(bulkRowHtml).join('');
  }
  function bulkResultHtml(r, how) {
    const ind = r.ind;
    const g = gradeOf(ind);
    const grade = g ? `<b class="bk-g" data-g="${rankKey(g.rank)}">${esc(g.rank)}</b> ${(Math.round(g.pct * 10) / 10).toFixed(1)}%` : '';
    const what = { new: '新しく入れました', updated: 'ボックスの個体を更新しました', kept: 'ボックスの方が新しいデータです' }[how] || '';
    const why = r.spOk === false ? 'SPが計算と合いません' : r.unsure ? `確かめてほしい項目が${r.unsure}つ` : '';
    return `<b>${esc(ind.sp.ja)}</b> <span class="num">Lv.${ind.level}</span> ${grade}<small>${what}${why ? `・${why}` : ''}</small>`;
  }
  async function keepAwake(on) {
    try {
      if (on && !bulk.lock && navigator.wakeLock && document.visibilityState === 'visible') bulk.lock = await navigator.wakeLock.request('screen');
      if (!on && bulk.lock) { await bulk.lock.release(); bulk.lock = null; }
    } catch { bulk.lock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (bulk.running && document.visibilityState === 'visible') { bulk.lock = null; keepAwake(true); } });
  async function runBulk(files) {
    const imgs = [...files].filter((f) => f && /^image\//.test(f.type || 'image/'));
    if (!imgs.length) return;
    renderMenuCount();
    openSheet('bulkView');
    if (bulk.running) return;
    if (reading) { bulk.rows = []; renderBulk(); $('bulkNote').textContent = 'いま1匹ぶんを読み取り中です。終わってからもう一度選んでください。'; return; }
    $('bulkNote').textContent = '';
    bulk.running = true; bulk.stop = false; bulk.stage = '読み取りの準備中…'; bulk.pct = null;
    bulk.rows = imgs.map((f, k) => ({ k, state: 'wait', html: '' }));
    renderBulk();
    keepAwake(true);
    // the previous screenshot's reading: its other half may come next
    let prev = null;
    try {
      for (let k = 0; k < imgs.length; k++) {
        if (bulk.stop) break;
        const row = bulk.rows[k];
        row.state = 'reading'; bulk.stage = '読み取り中…'; bulk.pct = null;
        renderBulk();
        let data = null;
        try {
          data = await OCR.read(imgs[k], {
            vocab: OCR_VOCAB,
            onProgress: (m) => {
              const s = ocrStage(m, '');
              if (!s) return;
              if (s.stage) bulk.stage = s.stage;
              bulk.pct = s.pct;
              const head = $('bulkHead');
              if (head && head.lastElementChild) head.lastElementChild.textContent = bulk.stop ? '止めています…（この1枚が終わったら止まります）' : bulk.stage + (bulk.pct != null ? ` ${Math.round(bulk.pct * 100)}%` : '');
            },
          });
        } catch (e) { console.error(e); data = null; }
        if (!data || !data.isDetailScreen) {
          Object.assign(row, { state: 'fail', html: data ? 'ポケモンの詳細画面ではありませんでした' : '読み取りに失敗しました' });
          prev = null;
          renderBulk();
          continue;
        }
        // top and bottom halves of one screen: read together when that reproduces the SP on screen
        let r = resolveData(data);
        let merged = false;
        if (prev && sameIndividual(prev.data, data)) {
          const m = OCRParse.merge([data, prev.data]);
          const rm = resolveData(m);
          if (!rm.error && rm.spOk === true && r.spOk !== true) { r = rm; data = m; merged = true; }
        }
        if (merged) {
          const pr = bulk.rows[prev.k];
          // the entry made from the first half alone is replaced by the whole reading
          if (pr.id && pr.status === 'new') boxRemove(pr.id);
          Object.assign(pr, { state: 'merged', html: '次のスクショと合わせて1匹ぶんとして読み取りました', id: null });
        }
        if (r.error || !r.ind.sp.supported) {
          Object.assign(row, { state: 'fail', html: r.error ? 'ポケモンの種類を特定できませんでした' : `${esc(r.ind.sp.ja)}はまだ評価できません` });
          prev = { data, k };
          renderBulk();
          continue;
        }
        const ck = needsCheck(r.ind, r.unsure);
        const u = boxUpsert(r.ind, { ck });
        Object.assign(row, { state: ck ? 'check' : 'ok', id: u.id, status: u.status, html: bulkResultHtml(r, u.status) + (merged ? '<small>（前のスクショと合わせて読み取り）</small>' : '') });
        prev = { data, k };
        renderBulk();
      }
    } finally {
      bulk.rows.forEach((r) => { if (r.state === 'reading' || r.state === 'wait') { r.state = 'wait'; r.html = bulk.stop ? '止めたので読み取っていません' : ''; } });
      bulk.running = false;
      bulk.stop = false;
      keepAwake(false);
      renderBulk();
      renderMenuCount();
      if ($('boxView').open) renderBox();
    }
  }
  function askStopBulk() {
    if (!bulk.running) return true;
    if (!confirm('まとめて登録を止めますか？ ここまでに読み取った個体はボックスに入っています。')) return false;
    bulk.stop = true;
    renderBulk();
    return false;
  }

  // ---------- transfer code: the box as text, to move it to another device ----------
  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const pipeBytes = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  // only known fields with sane values are kept from a code (it is text from outside)
  function cleanItem(o) {
    if (!o || typeof o !== 'object' || typeof o.sp !== 'string' || !speciesOf(o.sp)) return null;
    const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
    const lv = int(o.lv, 1, 100);
    if (!lv || typeof o.n !== 'string' || !PSE.NATURE_BY_JA[o.n]) return null;
    const s = Array.from({ length: 5 }, (_, i) => (Array.isArray(o.s) && typeof o.s[i] === 'string' && PSE.SUB_BY_K[o.s[i]] ? o.s[i] : null));
    const i3 = Array.from({ length: 3 }, (_, i) => {
      const v = Array.isArray(o.i) ? o.i[i] : null;
      return Array.isArray(v) && typeof v[0] === 'string' && PSE.ING_STRENGTH[v[0]] !== undefined && int(v[1], 1, 99) ? [v[0], v[1]] : null;
    });
    const now = Date.now();
    const time = (v) => (Number.isFinite(v) && v > 1.6e12 && v < now + 864e5 ? v : null);
    return {
      t: time(o.t) || now, a: time(o.a) || time(o.t) || now, sp: o.sp, lv, n: o.n, s, sk: int(o.sk, 1, 8) || 1, i: i3,
      spv: int(o.spv, 1, 99999), ht: int(o.ht, 1, 99999), c: int(o.c, 1, 999), r: int(o.r, 0, 4) || 0,
      d: typeof o.d === 'string' ? o.d.slice(0, 40) : '', ck: o.ck === true, id: typeof o.id === 'string' && /^b[0-9a-z]{4,20}$/.test(o.id) ? o.id : null,
      g: '', p: null, gs: '',
    };
  }
  async function encodeBox(items) {
    const slim = items.map((o) => { const x = Object.assign({}, o); delete x.g; delete x.p; delete x.gs; return x; });
    let bytes = new TextEncoder().encode(JSON.stringify({ v: 1, at: Date.now(), box: slim }));
    let ver = '0';
    if (typeof CompressionStream === 'function') {
      try { bytes = await pipeBytes(bytes, new CompressionStream('deflate-raw')); ver = '1'; } catch { ver = '0'; bytes = new TextEncoder().encode(JSON.stringify({ v: 1, at: Date.now(), box: slim })); }
    }
    return `PSB${ver}.${b64url(bytes)}`;
  }
  async function decodeBox(text) {
    const m = String(text || '').replace(/\s+/g, '').match(/PSB([01])\.([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('format');
    let bytes = unb64url(m[2]);
    if (m[1] === '1') {
      if (typeof DecompressionStream !== 'function') throw new Error('unsupported');
      bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    }
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || !Array.isArray(obj.box)) throw new Error('format');
    return obj.box.map(cleanItem).filter(Boolean);
  }
  // what reading a code would do: { list, added, updated, same }
  function planImport(items, replace) {
    const list = replace ? [] : boxAll().slice();
    let added = 0, updated = 0, same = 0;
    for (const it of items) {
      const key = boxKey(it);
      const i = list.findIndex((x) => boxKey(x) === key);
      if (i >= 0) {
        const old = list[i];
        if (it.lv > old.lv || (it.lv === old.lv && it.t > old.t)) { list[i] = Object.assign({}, it, { id: old.id, a: Math.min(old.a || old.t, it.a) }); updated++; } else same++;
      } else {
        list.push(Object.assign({}, it, { id: it.id && !list.some((x) => x.id === it.id) ? it.id : newBoxId() }));
        added++;
      }
    }
    return { list, added, updated, same };
  }
  const transfer = { items: null };
  function renderTransfer() {
    const n = boxAll().length;
    $('exportInfo').textContent = n ? `このiPhoneのボックスの${n}匹をコードにします。` : 'ボックスに個体がないので、書き出すものがありません。';
    $('exportMake').disabled = !n;
    $('exportOut').hidden = true;
    $('importOut').hidden = true;
    $('importMsg').textContent = '';
    transfer.items = null;
  }
  async function checkImport() {
    $('importOut').hidden = true;
    transfer.items = null;
    const text = $('importCode').value;
    if (!text.trim()) { $('importMsg').textContent = 'コードを貼り付けてください。'; return; }
    let items;
    try { items = await decodeBox(text); } catch (e) {
      $('importMsg').textContent = e.message === 'unsupported'
        ? 'このブラウザでは読み込めない形式です。iOSを新しくするか、別のブラウザで開いてください。'
        : 'コードを読み取れませんでした。最初の「PSB」から最後まで、全部をコピーできているか確かめてください。';
      return;
    }
    if (!items.length) { $('importMsg').textContent = 'コードの中に個体がありませんでした。'; return; }
    transfer.items = items;
    const plan = planImport(items, false);
    $('importInfo').innerHTML = `コードの中身: <b>${items.length}匹</b>（このボックスにない個体 ${plan.added}・同じ個体 ${plan.updated + plan.same}）`;
    $('importMsg').textContent = '';
    $('importOut').hidden = false;
  }
  function applyImport(replace) {
    if (!transfer.items) return;
    if (replace && boxAll().length && !confirm(`いまのボックス（${boxAll().length}匹）を消して、コードの${transfer.items.length}匹に置き換えますか？`)) return;
    const plan = planImport(transfer.items, replace);
    plan.list.forEach((x) => { x.gs = ''; });
    boxPut(plan.list);
    regradeList(BKEY);
    renderMenuCount();
    $('importOut').hidden = true;
    transfer.items = null;
    $('importCode').value = '';
    $('importMsg').textContent = replace
      ? `ボックスをコードの${plan.list.length}匹に置き換えました。`
      : `${plan.added}匹を追加し、${plan.updated}匹を新しいデータに更新しました。`;
    $('exportInfo').textContent = `このiPhoneのボックスの${boxAll().length}匹をコードにします。`;
    $('exportMake').disabled = !boxAll().length;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
    const ta = $('exportCode');
    ta.focus(); ta.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- files ----------
  function renderThumbs() {
    $('thumbs').innerHTML = state.files.map((x, i) => `<div class="thumb"><img src="${x.url}" alt="スクショ${i + 1}"><button type="button" data-rm="${i}" aria-label="スクショ${i + 1}を外す">×</button></div>`).join('');
    $('dropTitle').textContent = state.files.length ? 'スクショを追加・入れ替え' : 'スクショを選ぶ';
  }
  function addFiles(list) {
    const imgs = [...list].filter((f) => f && /^image\//.test(f.type || 'image/'));
    if (!imgs.length) return;
    // four or more at once: one individual each, into the box
    if (imgs.length > 3) { runBulk(imgs); return; }
    for (const f of imgs) state.files.push({ file: f, url: URL.createObjectURL(f) });
    while (state.files.length > 3) { const x = state.files.shift(); URL.revokeObjectURL(x.url); }
    renderThumbs();
    clearTimeout(addFiles.t);
    addFiles.t = setTimeout(startReading, 450);
  }

  // ---------- events ----------
  $('file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); addFiles(e.dataTransfer.files); });
  document.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile());
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    // ---- menu, box, bulk registration, transfer code ----
    if (t.id === 'menuBtn') { renderMenuCount(); openSheet('menu'); return; }
    if (t.dataset.close != null) {
      const d = t.closest('dialog');
      if (d && d.id === 'bulkView' && !askStopBulk()) return;
      if (d) d.close();
      return;
    }
    if (t.dataset.go) {
      const go = t.dataset.go;
      if (go === 'box') { renderBox(); openSheet('boxView'); }
      else if (go === 'bulk') { renderBulk(); openSheet('bulkView'); }
      else if (go === 'transfer') { renderTransfer(); openSheet('transferView'); }
      else if (go === 'method') { closeSheet('menu'); $('method').open = true; $('method').scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' }); }
      return;
    }
    if (t.dataset.box) { openBoxItem(t.dataset.box); return; }
    if (t.dataset.boxdel) {
      const o = boxAll().find((x) => x.id === t.dataset.boxdel);
      const sp = o && speciesOf(o.sp);
      if (o && confirm(`${sp ? sp.ja : o.sp} Lv.${o.lv}（${o.n}）をボックスから外しますか？`)) { boxRemove(o.id); renderBox(); renderAll(); }
      return;
    }
    if (t.dataset.btype != null) { state.boxUi.type = t.dataset.btype; state.boxUi.rank = ''; saveBoxUi(); renderBox(); return; }
    if (t.dataset.brank != null) { state.boxUi.rank = state.boxUi.rank === t.dataset.brank ? '' : t.dataset.brank; saveBoxUi(); renderBox(); return; }
    if (t.id === 'boxAdd' || t.id === 'boxUpdate') {
      if (!state.ind.sp || !state.ind.sp.supported) return;
      state.boxId = boxUpsert(state.ind, { ck: currentCheck() }, t.id === 'boxUpdate' ? t.dataset.id : undefined).id;
      renderAll();
      return;
    }
    if (t.id === 'boxChecked') {
      const list = boxAll();
      const o = list.find((x) => x.id === state.boxId);
      if (o) { o.ck = false; boxPut(list); }
      renderAll();
      return;
    }
    if (t.id === 'bulkStop') { askStopBulk(); return; }
    if (t.id === 'exportMake') {
      t.disabled = true;
      encodeBox(boxAll()).then((code) => {
        $('exportCode').value = code;
        $('exportOut').hidden = false;
        $('exportShare').hidden = !navigator.share;
        $('exportMsg').textContent = `${boxAll().length}匹ぶん・${code.length.toLocaleString('ja-JP')}文字のコードです。`;
      }).catch(() => { $('exportMsg').textContent = 'コードを作れませんでした。'; $('exportOut').hidden = false; })
        .finally(() => { t.disabled = false; });
      return;
    }
    if (t.id === 'exportCopy') {
      copyText($('exportCode').value).then((ok) => { $('exportMsg').textContent = ok ? 'コピーしました。もう1台の「引き継ぎコード」→「読み込む」に貼り付けてください。' : 'コピーできませんでした。コードを長押しして全部選び、コピーしてください。'; });
      return;
    }
    if (t.id === 'exportShare') {
      navigator.share({ title: 'ポケスリ個体チェッカーのボックス', text: $('exportCode').value }).catch(() => {});
      return;
    }
    if (t.id === 'exportSave') {
      const blob = new Blob([$('exportCode').value + '\n'], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pokesleep-box-${stamp()}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return;
    }
    if (t.id === 'importCheck') { checkImport(); return; }
    if (t.id === 'importMerge') { applyImport(false); return; }
    if (t.id === 'importReplace') { applyImport(true); return; }
    if (t.dataset.rm != null) {
      const [x] = state.files.splice(+t.dataset.rm, 1);
      if (x) URL.revokeObjectURL(x.url);
      renderThumbs();
      return;
    }
    if (t.id === 'retryRead') { startReading(); return; }
    if (t.classList.contains('lv-chip') && !t.disabled) { selectLevel(+t.dataset.l); return; }
    if (t.dataset.fix != null) {
      const sg = (state.lastSuggestions || [])[+t.dataset.fix];
      if (sg) { state.ind = Object.assign({}, state.ind, sg.patch); state.autoFix = null; fillEditor(); renderAll(); }
      return;
    }
    if (t.id === 'undoFix' && state.autoFix) { state.ind = state.autoFix.prev; state.autoFix = null; fillEditor(); renderAll(); return; }
    if (t.dataset.sleep) {
      state.sleepScore = +t.dataset.sleep;
      store.set(SKEY, state.sleepScore);
      document.querySelectorAll('#sleepSeg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.sleep === state.sleepScore)));
      renderAll();
      regradeHistory();
      return;
    }
    if (t.dataset.evolve != null) {
      state.evolve = t.dataset.evolve === '1';
      store.set(EKEY, state.evolve);
      document.querySelectorAll('#evoSeg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.evolve === '1') === state.evolve)));
      renderAll();
      regradeHistory();
      return;
    }
    if (t.dataset.maxskill != null) {
      state.maxSkill = t.dataset.maxskill === '1';
      store.set(MKEY, state.maxSkill);
      document.querySelectorAll('#skillSeg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.maxskill === '1') === state.maxSkill)));
      renderAll();
      regradeHistory();
      return;
    }
    if (t.dataset.h != null) {
      const o = store.get(HKEY, [])[+t.dataset.h];
      const ind = o && deserialize(o);
      if (ind) {
        state.ind = ind; state.flags = {}; state.source = 'history'; state.autoFix = null; state.historyT = o.t; state.boxId = null;
        state.evalLevel = ind.level >= 60 ? 70 : 60;
        fillEditor(); renderAll();
        $('cardSpecimen').scrollIntoView({ block: 'start' });
      }
      return;
    }
    if (t.dataset.hdel != null) {
      const list = store.get(HKEY, []);
      list.splice(+t.dataset.hdel, 1);
      store.set(HKEY, list);
      renderHistory();
    }
  });
  document.addEventListener('change', (e) => {
    const id = e.target && e.target.id;
    if (id === 'boxSort') { state.boxUi.sort = e.target.value; saveBoxUi(); renderBox(); return; }
    if (id === 'bulkFile') { const f = e.target.files; runBulk(f); e.target.value = ''; return; }
    if (id === 'importFile') {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) f.text().then((txt) => { $('importCode').value = txt.trim(); checkImport(); }).catch(() => { $('importMsg').textContent = 'ファイルを読めませんでした。'; });
      return;
    }
    if (e.target && e.target.id === 'evoPick') {
      const from = state.ind.sp;
      state.evoPick = Object.assign({}, state.evoPick, { [from.anc]: e.target.value });
      store.set(PKEY, state.evoPick);
      renderAll();
      regradeHistory();
      return;
    }
    if (e.target && e.target.id === 'fieldBonus') {
      state.fieldBonus = parseInt(e.target.value, 10) || 0;
      store.set(FKEY, state.fieldBonus);
      renderAll();
      regradeHistory();
    }
  });
  $('form').addEventListener('submit', (e) => e.preventDefault());
  function afterEdit() {
    if (state.source === 'sample') state.source = 'manual';
    scheduleRender();
    clearTimeout(afterEdit.t);
    afterEdit.t = setTimeout(() => {
      if ((state.source === 'ocr' || state.source === 'history') && state.historyT && state.ind.sp.supported) state.historyT = saveHistory(state.ind, state.historyT);
      // an individual opened from the box (or linked to it) keeps its entry up to date
      if (boxLinked() && state.ind.sp.supported) boxUpsert(state.ind, { ck: currentCheck() }, state.boxId);
    }, 800);
  }
  $('boxSearch').addEventListener('input', () => renderBox());
  $('bulkView').addEventListener('cancel', (e) => { if (bulk.running) { e.preventDefault(); askStopBulk(); } });
  $('form').addEventListener('change', (e) => {
    readEditor(e.target.id);
    afterEdit();
  });
  $('form').addEventListener('input', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    if (e.target.id === 'inSpecies' && !PSE.SPECIES.some((s) => norm(s.ja) === norm(e.target.value))) return;
    readEditor(e.target.id);
    afterEdit();
  });
  $('saveManual').addEventListener('click', () => {
    if (!state.ind.sp.supported) return;
    state.historyT = saveHistory(state.ind);
    if (state.source === 'sample' || state.source === 'manual') state.source = 'history';
    $('saveManual').textContent = '保存しました';
    setTimeout(() => { $('saveManual').textContent = 'この内容を履歴に保存'; }, 1600);
  });

  // ---------- boot ----------
  (() => {
    const last = store.get(HKEY, [])[0];
    const ind = last && deserialize(last);
    if (ind) {
      state.ind = ind; state.source = 'history'; state.historyT = last.t;
      state.evalLevel = ind.level >= 60 ? 70 : 60;
    }
  })();
  buildEditorStatic();
  fillEditor();
  regradeList(HKEY);
  regradeList(BKEY);
  renderHistory();
  renderMenuCount();
  renderAll();

  // home-screen install hint (iPhone Safari, not yet installed)
  const IKEY = 'pse:v1:installHintClosed';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone && ios && !store.get(IKEY, false)) $('installHint').hidden = false;
  $('installClose').addEventListener('click', () => { $('installHint').hidden = true; store.set(IKEY, true); });

  // start loading the reader while the photo picker is open
  $('drop').addEventListener('click', () => { if (window.OCR) OCR.warmup().catch(() => {}); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}); });
  }
})();
