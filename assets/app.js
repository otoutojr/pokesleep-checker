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
  const GRADE_WORD = { S: '大当たり', A: '当たり', B: 'まずまず', C: 'いまひとつ', D: 'ハズレ寄り' };
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
    files: [],
    autoFix: null,
  };

  // ---------- reference calculator (nitoyon/pokesleep-tool, bundled as NITO) ----------
  const REF = (() => {
    if (typeof NITO === 'undefined') return null;
    const params = new Map();
    const param = () => {
      const k = state.fieldBonus + '|' + state.sleepScore;
      if (!params.has(k)) params.set(k, NITO.createStrengthParameter({ fieldBonus: state.fieldBonus, sleepScore: state.sleepScore }));
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
      const k = state.fieldBonus + '|' + state.sleepScore;
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
    const trig = new Map();
    function skillStrPerTrigger(sp) {
      return (level, skillLevel) => {
        const k = [sp.en, level, skillLevel, state.fieldBonus, state.sleepScore].join('|');
        if (!trig.has(k)) {
          let v = 0;
          try {
            const r = new NITO.PokemonStrength(new NITO.PokemonIv({ pokemonName: sp.en, level, skillLevel }), param()).calculateImpl();
            v = r.skillCount > 0 ? ((r.skillStrength || 0) + (r.skillStrength2 || 0)) / r.skillCount : 0;
          } catch { v = 0; }
          trig.set(k, v);
        }
        return trig.get(k);
      };
    }
    const rating = (v) => new NITO.PokemonRating(v).calculate();
    return { iv, calc, teamHBStr, skillStrPerTrigger, rating };
  })();
  const envFor = (sp) => (REF && sp && sp.supported
    ? { fieldBonus: state.fieldBonus, e4eCount: 3, e4eEnergy: 18, teamHBStr: REF.teamHBStr(), skillStrPerTrigger: REF.skillStrPerTrigger(sp) }
    : { fieldBonus: state.fieldBonus, e4eCount: 3, e4eEnergy: 18 });
  const withSettings = (ind) => Object.assign({}, ind, { sleepScore: state.sleepScore, env: envFor(ind.sp) });
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
  function skillUnit(skill) {
    if (/^Charge Strength|^Berry Burst|^Berry Zone/.test(skill)) return { label: 'エナジー', u: '', strength: true };
    if (/^Charge Energy|^Energizing Cheer/.test(skill)) return { label: 'げんき', u: '' };
    if (/^Energy for Everyone/.test(skill)) return { label: '全員のげんき', u: '' };
    if (/^Ingredient Magnet|^Ingredient Draw|^Cooking Assist/.test(skill)) return { label: '食材', u: '個' };
    if (/^Dream Shard/.test(skill)) return { label: 'ゆめのかけら', u: '' };
    if (/^Cooking Power-Up/.test(skill)) return { label: 'なべ容量', u: '' };
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
    const nick = ind.displayName && norm(ind.displayName) !== norm(sp.ja) ? `<p class="note">画面の名前: ${esc(ind.displayName)}</p>` : '';
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
        </div>
        ${spBox}
      </div>`;
  }

  // ---------- render: verdict ----------
  function summaryText(ind, ev) {
    const type = SPEC_TYPE[ind.sp.spec];
    const rows = ev.subDetails.filter(Boolean);
    const active = rows.filter((r) => r.active && !r.sub.util).sort((a, b) => b.delta.role - a.delta.role);
    const parts = [];
    const [t1, t2] = active;
    if (t1 && t1.delta.role >= 0.15) {
      parts.push(`Lv${t1.unlock}の${t1.sub.ja}が大きな武器です。`);
      if (t2 && t2.delta.role >= 0.07) parts.push(`Lv${t2.unlock}の${t2.sub.ja}も効いています。`);
    } else if (t1 && t1.delta.role >= 0.07) {
      parts.push(t2 && t2.delta.role >= 0.07
        ? `Lv${t1.unlock}の${t1.sub.ja}とLv${t2.unlock}の${t2.sub.ja}が効いています。`
        : `Lv${t1.unlock}の${t1.sub.ja}が効いています。`);
    } else if (ev.L >= 10) {
      parts.push(`Lv${ev.L}までに開くサブスキルに、${type}向きのものがほとんどありません。`);
    }
    const nd = ev.natureDelta.role;
    if (nd >= 0.08) parts.push(`せいかくも${type}にぴったりです。`);
    else if (nd >= 0.02) parts.push(`せいかくも${type}に向いています。`);
    else if (nd <= -0.02) parts.push(`せいかくは${type}には少しマイナスです。`);
    else parts.push('せいかくの影響は小さめです。');
    const later = rows.filter((r) => !r.active && r.unlock <= PSE.MAX_LEVEL && !r.sub.util && r.delta.role >= 0.07);
    if (later.length) parts.push(`Lv${later[0].unlock}で${later[0].sub.ja}が開くと、さらに伸びます。`);
    return parts.join('');
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
      const g = ev ? ev.role.grade : '';
      return `<button type="button" class="lv-chip" data-l="${L}" data-g="${g}" aria-pressed="${L === state.evalLevel}" ${ev ? '' : 'disabled'}>
        <span class="l">${label}</span><span class="g">${ev ? g : '…'}</span><span class="p">${ev ? '上位' + fmtTop(ev.role.top) : '計算中'}</span>
      </button>`;
    }).join('');
  }

  function renderVerdict(ind, ev, evs, levels) {
    const spec = ind.sp.spec;
    const r = ev.role;
    const s = ev.str;
    const fill = Math.max(2, Math.round((1 - r.top) * 100));
    const strNote = spec === 'A' ? '' : (() => {
      const diff = 'SABCD'.indexOf(s.grade) - 'SABCD'.indexOf(r.grade);
      let t = `総合エナジーで見ると <b>${s.grade}</b>（上位${fmtTop(s.top)}）。`;
      if (diff >= 1) t += 'とくい以外の力（きのみの数Sやスキルレベルアップなど）は総合のほうで評価しています。';
      else if (diff <= -1) t += 'とくい以外でも強いサブスキルを持っているので、総合ではさらに上です。';
      return `<p class="note">${t}</p>`;
    })();
    $('cardVerdict').innerHTML = `
      <div class="verdict">
        <div class="medal" data-g="${r.grade}" style="--fill:${fill}" aria-hidden="true"><span>${r.grade}</span></div>
        <div class="verdict-text">
          <span class="eyebrow">${SPEC_TYPE[spec]}として・Lv${ev.L}のとき</span>
          <span class="big">上位 ${fmtTop(r.top)}<small>${GRADE_WORD[r.grade]}</small></span>
          <span class="subline">理想の${Math.round(r.ratio * 100)}%｜同じポケモンの${ev.n.toLocaleString('ja-JP')}通り中</span>
        </div>
      </div>
      <p class="summary">${esc(summaryText(ind, ev))}</p>
      <div class="lv-strip" id="lvStrip" role="group" aria-label="評価するレベル" style="grid-template-columns:repeat(${levels.length},minmax(0,1fr))">${stripHtml(ind, evs, levels)}</div>
      ${strNote}`;
  }

  // ---------- render: why ----------
  function verdictFor(d, sub, dStr) {
    if (sub && sub.util) return { v: 'support', t: 'サポート' };
    if (d >= 0.15) return { v: 'great', t: '◎ 大当たり' };
    if (d >= 0.07) return { v: 'good', t: '○ 当たり' };
    if (d >= 0.02) return { v: 'ok', t: '△ ちょい足し' };
    if (dStr >= 0.02) return { v: 'none', t: '− 役割外' };
    return { v: 'none', t: '− 効果うすい' };
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
  function natureVerdict(d) {
    if (d >= 0.08) return { v: 'great', t: '◎ ぴったり' };
    if (d >= 0.02) return { v: 'good', t: '○ 向いている' };
    if (d > -0.02) return { v: 'ok', t: '△ 影響小' };
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
    let natureEff = '';
    let natureMetric = nd.role;
    if (cMe && cNeu) {
      const q1 = roleQty(spec, cMe), q0 = roleQty(spec, cNeu);
      natureMetric = q0 > 0 ? q1 / q0 - 1 : nd.role;
      natureEff = `<span class="eff">${qtyText(spec, q1 - q0, q0)}</span>` + (spec !== 'A' ? `・エナジー ${fmtSigned(cMe.r.totalStrength - cNeu.r.totalStrength, fmtInt)}/日` : '');
    } else {
      natureEff = `<span class="eff">${AXIS[spec]} ${fmtDelta(nd.role)}</span>`;
    }
    const nv = natureVerdict(natureMetric);
    const natureRow = `
      <div class="row">
        <span class="when">せいかく</span>
        <span class="name">${esc(ind.nature.ja)}<span class="tag">${natureLabel(ind.nature)}</span></span>
        <span class="verdict-chip" data-v="${nv.v}">${nv.t}</span>
        <span class="why">${natureEff}（補正なしのせいかくと比べて）。${esc(natureWhy(ind, ev))} 25種中${ev.natureRank}位。</span>
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
      let eff = '';
      let metric = spec === 'A' ? d.delta.str : d.delta.role;
      if (cW && cWo && !s.util) {
        const q1 = roleQty(spec, cW), q0 = roleQty(spec, cWo);
        const dE = cW.r.totalStrength - cWo.r.totalStrength;
        const e0 = cWo.r.totalStrength;
        metric = s.hb || s.erb ? (e0 > 0 ? dE / e0 : 0) : (q0 > 0 ? q1 / q0 - 1 : 0);
        const cnt = cW.r.skillCount - cWo.r.skillCount;
        let skillNote = '';
        if (spec === 'S' && Math.abs(cnt) >= 0.01) skillNote = `（発動 ${fmtSigned(cnt, fmt2)}回/日）`;
        else if (spec !== 'S' && s.st && Math.abs(cnt) >= 0.01) skillNote = `（スキル発動 ${fmtSigned(cnt, fmt2)}回/日）`;
        else if (spec !== 'S' && s.slu) skillNote = `（スキルLv +${Math.max(0, cW.iv.skillLevel - cWo.iv.skillLevel)}）`;
        eff = `<span class="eff">${qtyText(spec, q1 - q0, q0)}</span>` + skillNote
          + (spec !== 'A' ? `・エナジー ${fmtSigned(dE, fmtInt)}/日` : '')
          + (s.hb ? '（チームへの効果込み）' : '') + '。';
      }
      const vd = verdictFor(metric, s, d.delta.str);
      const lockNote = !d.active
        ? (u > PSE.MAX_LEVEL ? `Lv${u}で解放（いまの上限はLv${PSE.MAX_LEVEL}）。Lv${lv}で計算: ` : `Lv${u}で解放。Lv${lv}で計算: `)
        : '';
      return `
        <div class="row${d.active ? '' : ' locked'}">
          <span class="when"><span class="dot ${rarityClass(s)}" title="${RARITY_JA[s.r]}"></span>Lv${u}</span>
          <span class="name ${rarityClass(s)}">${esc(s.ja)}</span>
          <span class="verdict-chip" data-v="${vd.v}">${vd.t}</span>
          <span class="why">${s.util ? '' : lockNote}${eff}${esc(SUB_TEXT[s.k] || '')}</span>
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
    $('cardWhy').innerHTML = `
      <h2 class="card-title">評価の内訳（Lv${L}・${BASIS[spec]}で比較）</h2>
      <div class="rows">${natureRow}</div>
      <h3 class="card-title">サブスキル（あり・なしの差）</h3>
      <div class="rows">${subRows}</div>
      <h3 class="card-title">食材${pi.code ? `（${pi.code}）` : ''}</h3>
      <div class="rows">${ingRows}</div>
      ${ind.slots.some((x, i) => state.flags['ing' + i] && ind.level < [1, 30, 60][i]) ? '<p class="note">まだ解放されていない食材は画像から読めないので、仮の組み合わせで計算しています。違うときは「読み取り結果を直す」で選び直してください。</p>' : ''}
      <p class="note">この食材の組み合わせは、Lv60での食材の合計エナジーで ${pi.total}通り中 ${pi.rank}位です。</p>
      <p class="ideal">このポケモンの理想（Lv${L}・${BASIS[spec]}）: <b>${esc(best.nature.ja)}</b> ＋ ${idealSubs}</p>`;
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
    if ((r.skillValue2 || 0) > 0 && !(r.skillStrength2 > 0)) skillMeta += `・追加効果 ${fmtNice(r.skillValue2)}`;
    const wake = r.skillProbabilityAfterWakeup || { once: 0, twice: 0 };
    const twice = (spec === 'S' || spec === 'A') && wake.twice > 0 ? `<small>2回ぶん ${fmt1(wake.twice * 100)}%</small>` : '';
    let rating = null;
    try { rating = REF.rating(c.iv); } catch { rating = null; }
    const hl = (k) => (({ B: 'b', I: 'i', S: 's' })[spec] === k ? ' hl' : '');
    el.innerHTML = `
      ${head}
      <div class="energy-head"><span class="k">1日の合計エナジー</span><span class="v">${fmtInt(r.totalStrength)}</span></div>
      <div class="share" aria-hidden="true">${share}</div>
      <div class="yield">
        <div class="y-row${hl('b')}"><span class="lab"><i class="sw b"></i>きのみ</span><span class="main">${fmt1(r.berryCount)}個</span><span class="en">${fmtInt(r.berryTotalStrength)}</span><span class="meta">確率${fmt1(r.berryRate * 100)}%・1個${fmtInt(r.berry1Strength)}エナジー</span></div>
        <div class="y-row${hl('i')}"><span class="lab"><i class="sw i"></i>食材</span><span class="main">${ings}</span><span class="en">${fmtInt(r.ingStrength)}</span><span class="meta">確率${fmt1(r.ingRate * 100)}%・合計${fmt1(ingTotal)}個</span></div>
        <div class="y-row${hl('s')}"><span class="lab"><i class="sw s"></i>スキル</span><span class="main">${fmt2(r.skillCount)}回</span><span class="en">${skStr > 0 ? fmtInt(skStr) : '—'}</span><span class="meta">${esc(PSE.SKILL_JA[ind.sp.skill] || '')} Lv.${c.iv.skillLevel}・${skillMeta}</span></div>
        ${team > 0 ? `<div class="y-row"><span class="lab"><i class="sw t"></i>チーム</span><span class="main">おてつだいボーナス分</span><span class="en">${fmtInt(team)}</span><span class="meta">ほかの4匹のおてつだいが速くなるぶん</span></div>` : ''}
      </div>
      <dl class="kv">
        <div><dt>SP</dt><dd>${fmtInt(rp.rp)}<small>きのみ ${fmtSp(rp.berryRp)}・食材 ${fmtSp(rp.ingredientRp)}・スキル ${fmtSp(rp.skillRp)}</small></dd></div>
        <div><dt>おてつだい時間</dt><dd>${fmtTime(r.baseFreq)}<small>げんきによる短縮の前</small></dd></div>
        <div><dt>おてつだい回数</dt><dd>${fmt1(r.total.all)}回<small>起きている間 ${fmt1(r.awake.all)}・寝ている間 ${fmt1(r.asleep.all)}</small></dd></div>
        <div><dt>最大所持数</dt><dd>${r.carryLimit}個<small>${r.timeToFullInventory < 0 ? '寝ている間にあふれない' : `寝てから${fmtMin(r.timeToFullInventory)}であふれる`}</small></dd></div>
        <div><dt>翌朝スキル発生率</dt><dd>${fmt1(wake.once * 100)}%${twice}</dd></div>
        <div><dt>個体評価（100点満点）</dt><dd>${rating ? `${Math.round(rating.berryScore)}・${Math.round(rating.ingScore)}・${Math.round(rating.skillScore)}` : '—'}<small>きのみ・食材・スキル。性格とサブスキルの理想を100とした割合</small></dd></div>
      </dl>
      <h3 class="card-title">レベルごとの見込み</h3>
      <div class="lvtable-wrap" id="lvTable"></div>
      <p class="note">nitoyon さんの「ポケスリ 個体値計算機」と同じ計算です（げんきオール1日3回・料理3回・レシピボーナス25%・レシピLv30・睡眠スコア${state.sleepScore}・好みのきのみなし）。</p>`;
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
      const g = ev ? ev.role.grade : '…';
      let qty = '—';
      if (c) qty = spec === 'I' ? fmt1(c.r.ingredients.reduce((a, x) => a + x.count, 0)) : spec === 'S' ? fmt2(c.r.skillCount) : fmt1(c.r.berryCount);
      const now = L === Math.min(ind.level, PSE.MAX_LEVEL);
      return `<tr class="${L === state.evalLevel ? 'sel' : ''}"><td>${now ? 'いま ' : ''}Lv${L}</td><td class="g" style="color:var(--g${ev ? g : 'C'})">${g}</td><td>${c ? fmtInt(c.rp.rp) : '—'}</td><td>${c ? fmtInt(c.r.totalStrength) : '—'}</td><td>${qty}</td></tr>`;
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
    const ind = withSettings(state.ind);
    $('sampleNote').hidden = state.source !== 'sample';
    if (!ind.sp) return;
    const chk = ind.sp.supported ? runCheck(ind) : null;
    renderSpecimen(ind, chk);
    if (!ind.sp.supported) { renderUnsupported(ind); return; }
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
    renderCheck(ind, chk);
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
      d: ind.displayName || '', g: ev ? ev.role.grade : '', p: ev ? ev.role.top : null,
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
  function saveHistory(ind, replaceT) {
    let ev = null;
    try { ev = PSE.evaluate(withSettings(ind), 60); } catch { ev = null; }
    const item = serialize(ind, ev);
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
        <span class="h-grade" style="color:var(--g${esc(o.g || 'C')})" title="Lv60のランク">${esc(o.g || '')}</span>
        <button type="button" class="h-del" data-hdel="${i}" aria-label="${esc(name)}を履歴から消す">×</button>
      </div>`;
    }).join('');
  }

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
    const sp = m.sp;
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

  // Ingredients from the badges: "x4" counts narrow each slot, and identical icons across slots
  // (or different ones) carry a known slot's ingredient over (or rule it out).
  function applyCounts(sp, slots, flags, counts) {
    const U = [1, 30, 60];
    const byU = {};
    for (const c of counts || []) byU[c.unlock] = c;
    if (!Object.keys(byU).length) return;
    const cand = [0, 1, 2].map((i) => PSE.slotOptions(sp, i));
    [0, 1, 2].forEach((i) => {
      const c = byU[U[i]];
      if (c && c.count) { const f = cand[i].filter((o) => o.count === c.count); if (f.length) cand[i] = f; }
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
      slots[i] = cand[i][0];
      if (cand[i].length === 1) delete flags['ing' + i]; else flags['ing' + i] = true;
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
    const diff = (x) => (x.sp === ind.sp ? 0 : 8) + (x.level === ind.level ? 0 : 4) + (x.nature === ind.nature ? 0 : 2) + (x.skillLevelShown === ind.skillLevelShown ? 0 : 1);
    found.sort((a, b) => diff(a) - diff(b));
    const best = found[0];
    const f = Object.assign({}, flags);
    const uniq = (fn) => new Set(found.map(fn)).size === 1;
    const setFlag = (k, on) => { if (on) f[k] = true; else delete f[k]; };
    setFlag('species', !uniq((x) => x.sp.en));
    setFlag('level', !uniq((x) => x.level));
    setFlag('nature', !uniq((x) => x.nature.up + '|' + x.nature.down));
    setFlag('skill', !uniq((x) => x.skillLevelShown));
    [0, 1, 2].forEach((i) => {
      if (PSE.slotOptions(best.sp, i).length <= 1) { delete f['ing' + i]; return; }
      if (best.level >= [1, 30, 60][i]) setFlag('ing' + i, !uniq((x) => x.slots[i] && x.slots[i].name + x.slots[i].count));
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
  function finishReading(read, flags, data) {
    let ind = Object.assign({}, read);
    let autoFix = null;
    const res = resolveReading(ind, flags, data);
    if (res) {
      const changes = describeChanges(read, res.ind);
      if (changes.length && read.sp) autoFix = { label: changes.join('・'), before: describeChanges(res.ind, read).join('・'), prev: read };
      ind = res.ind;
      flags = res.flags;
    }
    state.speciesCands = res && res.speciesCands ? res.speciesCands : null;
    if (!ind.sp) {
      state.pending = { ind, flags, data };
      setStatus('ポケモンの種類を特定できませんでした。下の「読み取り結果を直す・手入力する」でポケモンを選ぶと、読み取った内容で評価します。', 'error');
      $('editor').open = true;
      $('inSpecies').value = '';
      $('inSpecies').focus();
      return;
    }
    state.pending = null;
    if (!res && ind.sp.supported) {
      const chk = runCheck(withSettings(ind));
      if (chk && chk.spOk === false && chk.suggestions.length === 1) {
        const before = ind;
        ind = Object.assign({}, ind, chk.suggestions[0].patch);
        autoFix = { label: chk.suggestions[0].label, before: describePatch(before, chk.suggestions[0].patch), prev: before };
      }
    }
    if (ind.sp.supported) checkCarry(ind, flags);
    state.flags = flags;
    state.ind = ind;
    state.source = 'ocr';
    state.autoFix = autoFix;
    state.evalLevel = ind.level >= 60 ? 70 : 60;
    const unsure = Object.keys(flags).filter((k) => !/^ing/.test(k) || ind.level >= [1, 30, 60][+k.slice(3)]).length;
    const spNote = ind.spShown ? (spMatches(ind) ? 'SPも計算と一致しました。' : 'SPが計算と合いません。下の「読み取りチェック」を見てください。') : 'SPが読めなかったので、照合はしていません。';
    const candNote = state.speciesCands ? `ポケモンは ${state.speciesCands.map((x) => x.ja).join('・')} のどれかで、数値だけでは区別できません。違うときは選び直してください。` : '';
    setStatus(unsure
      ? `読み取りました。${spNote}${candNote}確認してほしい項目が${unsure}つあります（「読み取り結果を直す」のオレンジ色の欄）。`
      : `読み取りました。${spNote}`, 'ok');
    fillEditor();
    state.historyT = ind.sp.supported ? saveHistory(ind) : null;
    renderAll();
    $('cardVerdict').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  let reading = false, readAgain = false;
  async function startReading() {
    if (!state.files.length) return;
    if (reading) { readAgain = true; return; }
    reading = true;
    let stage = '読み取りの準備中…', pct = null;
    const paint = () => setStatus(`${stage}${pct != null ? ` ${Math.round(pct * 100)}%` : ''}`, '', true);
    paint();
    try {
      const results = [];
      for (let i = 0; i < state.files.length; i++) {
        const which = state.files.length > 1 ? `${i + 1}枚目を` : '';
        results.push(await OCR.read(state.files[i].file, {
          vocab: OCR_VOCAB,
          onProgress: (m) => {
            const st = String(m.status || '');
            if (st === 'pass') { stage = `${which}読み取り中…（${m.pass}/${m.total}）`; pct = null; }
            else if (st === 'counts') { stage = `${which}食材の個数を確認中…`; pct = null; }
            else if (m.eng && st.includes('loading language traineddata')) { stage = '数字データを読み込み中…'; pct = m.progress; }
            else if (m.eng) return;
            else if (st.includes('loading tesseract core')) { stage = '読み取りの準備中（初回だけ約9MBを読み込みます）…'; pct = m.progress; }
            else if (st.includes('loading language traineddata')) { stage = '日本語データを読み込み中…'; pct = m.progress; }
            else if (st.includes('recognizing text')) pct = m.progress;
            else return;
            paint();
          },
        }));
      }
      applyReading(OCRParse.merge(results));
    } catch (e) {
      console.error(e);
      setStatus('読み取りに失敗しました。通信状態を確かめてもう一度試すか、下の「読み取り結果を直す・手入力する」で入力してください。 <button type="button" class="btn btn-night btn-small" id="retryRead">もう一度読み取る</button>', 'error');
    } finally {
      reading = false;
      if (readAgain) { readAgain = false; startReading(); }
    }
  }

  // ---------- files ----------
  function renderThumbs() {
    $('thumbs').innerHTML = state.files.map((x, i) => `<div class="thumb"><img src="${x.url}" alt="スクショ${i + 1}"><button type="button" data-rm="${i}" aria-label="スクショ${i + 1}を外す">×</button></div>`).join('');
    $('dropTitle').textContent = state.files.length ? 'スクショを追加・入れ替え' : 'スクショを選ぶ';
  }
  function addFiles(list) {
    const imgs = [...list].filter((f) => f && /^image\//.test(f.type || 'image/'));
    if (!imgs.length) return;
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
      return;
    }
    if (t.dataset.h != null) {
      const o = store.get(HKEY, [])[+t.dataset.h];
      const ind = o && deserialize(o);
      if (ind) {
        state.ind = ind; state.flags = {}; state.source = 'history'; state.autoFix = null; state.historyT = o.t;
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
    if (e.target && e.target.id === 'fieldBonus') {
      state.fieldBonus = parseInt(e.target.value, 10) || 0;
      store.set(FKEY, state.fieldBonus);
      renderAll();
    }
  });
  $('form').addEventListener('submit', (e) => e.preventDefault());
  function afterEdit() {
    if (state.source === 'sample') state.source = 'manual';
    scheduleRender();
    clearTimeout(afterEdit.t);
    afterEdit.t = setTimeout(() => {
      if ((state.source === 'ocr' || state.source === 'history') && state.historyT && state.ind.sp.supported) state.historyT = saveHistory(state.ind, state.historyT);
    }, 800);
  }
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
  renderHistory();
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
