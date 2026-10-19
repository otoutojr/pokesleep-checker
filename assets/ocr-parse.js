/* Reads the Pokémon Sleep "Pokémon details" screen from OCR output.
 * Pure functions (no DOM): input is Tesseract.js line/word boxes from one or more passes over the
 * same screenshot, output is the fields the app needs. Works in the browser (window.OCRParse) and in Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OCRParse = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- text helpers ----------
  const norm = (s) => String(s == null ? '' : s).normalize('NFKC').replace(/[\s　]/g, '').toUpperCase();

  // Characters OCR tends to swap. Substituting within a group costs 0.3 instead of 1.
  const GROUPS = [
    'S5$', 'L1I|', 'ー一-－—ｰ~〜', 'ッツっつ', 'ャヤゃや', 'ュユゅゆ', 'ョヨょよ', 'ァアぁあ', 'ィイぃい', 'ゥウぅう', 'ェエぇえ', 'ォオぉお',
    'へヘ', 'べベ', 'ぺペ', 'りリ', 'カ力か', 'ロ口', 'エ工', 'ニ二', 'ハ八', 'タ夕', 'ト卜', 'オ才', 'O0', 'ばぱは', 'びぴひ', 'ぶぷふ', 'ぼぽほ',
    'バパハ', 'ビピヒ', 'ブプフ', 'ボポホ', 'がか', 'ぎき', 'ぐく', 'げけ', 'ごこ', 'ざさ', 'じし', 'ずす', 'ぜせ', 'ぞそ', 'だた', 'ぢち', 'づつ',
    'でて', 'どと', 'ガカ', 'ギキ', 'グク', 'ゲケ', 'ゴコ', 'ザサ', 'ジシ', 'ズス', 'ゼセ', 'ゾソ', 'ダタ', 'ヂチ', 'ヅツ', 'デテ', 'ドト',
    '秒秘', '個固箇', '量罰',
  ];
  const GROUP_OF = new Map();
  GROUPS.forEach((g, i) => { for (const ch of g) GROUP_OF.set(ch, i); });
  function sub(a, b) {
    if (a === b) return 0;
    const ga = GROUP_OF.get(a);
    return ga !== undefined && ga === GROUP_OF.get(b) ? 0.3 : 1;
  }

  // Best alignment of the whole pattern against any substring of text (Sellers' algorithm).
  function fuzzyFind(pattern, text) {
    const P = [...pattern], T = [...text];
    const m = P.length, n = T.length;
    if (!m) return { cost: 0, start: 0, end: 0 };
    if (!n) return { cost: m, start: 0, end: 0 };
    let prev = new Float64Array(n + 1), prevSt = new Int32Array(n + 1);
    for (let j = 0; j <= n; j++) { prev[j] = 0; prevSt[j] = j; }
    for (let i = 1; i <= m; i++) {
      const cur = new Float64Array(n + 1), curSt = new Int32Array(n + 1);
      cur[0] = i; curSt[0] = 0;
      for (let j = 1; j <= n; j++) {
        let best = prev[j - 1] + sub(P[i - 1], T[j - 1]), st = prevSt[j - 1];
        const del = prev[j] + 1;
        if (del < best) { best = del; st = prevSt[j]; }
        const ins = cur[j - 1] + 1;
        if (ins < best) { best = ins; st = curSt[j - 1]; }
        cur[j] = best; curSt[j] = st;
      }
      prev = cur; prevSt = curSt;
    }
    let bj = 1;
    for (let j = 2; j <= n; j++) if (prev[j] < prev[bj]) bj = j;
    return { cost: prev[bj], start: prevSt[bj], end: bj };
  }

  // ---------- geometry ----------
  const cy = (b) => (b.y0 + b.y1) / 2;
  const cx = (b) => (b.x0 + b.x1) / 2;
  const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  // bounding box of the words that hold characters [start, end) of the line text
  function spanBox(line, start, end) {
    let pos = 0, box = null;
    for (const w of line.words) {
      const len = [...norm(w.text)].length;
      if (pos < end && pos + len > start) box = box ? union(box, w.bbox) : { ...w.bbox };
      pos += len;
    }
    return box || line.bbox;
  }

  // Lines from all passes, plus phrases (word runs separated by wide gaps) inside each line.
  function collect(img) {
    const W = img.width;
    const gap = Math.max(18, 0.035 * W);
    const lines = [];
    img.passes.forEach((pass, pi) => {
      for (const l of pass.lines || []) {
        const words = (l.words || []).filter((w) => norm(w.text));
        if (!words.length) continue;
        words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        const phrases = [];
        let cur = null;
        for (const w of words) {
          if (cur && w.bbox.x0 - cur.bbox.x1 <= gap) {
            cur.text += norm(w.text); cur.bbox = union(cur.bbox, w.bbox); cur.words.push(w);
          } else {
            cur = { text: norm(w.text), bbox: { ...w.bbox }, words: [w] };
            phrases.push(cur);
          }
        }
        const bbox = words.reduce((a, w) => union(a, w.bbox), { ...words[0].bbox });
        lines.push({ pass: pi, text: words.map((w) => norm(w.text)).join(''), bbox, words, phrases });
      }
    });
    return lines;
  }

  // ---------- vocabulary matching ----------
  function bestMatch(text, cands, keyOf, limit) {
    let best = null, second = null;
    for (const c of cands) {
      const key = keyOf(c);
      const r = fuzzyFind(key, text);
      const lim = limit(key);
      if (r.cost > lim) continue;
      const item = { c, cost: r.cost, start: r.start, end: r.end, key };
      if (!best || r.cost < best.cost || (r.cost === best.cost && key.length > best.key.length)) { second = best; best = item; }
      else if (!second || r.cost < second.cost) second = item;
    }
    return best ? { ...best, margin: second ? second.cost - best.cost : 9 } : null;
  }

  const SUB_SUFFIX = /[SML5$1I|]$/;

  function parse(img, vocab) {
    const W = img.width, H = img.height;
    const lines = collect(img);
    const out = {
      isDetailScreen: false, displayName: null, species: null, level: null, levelCandidates: [], sp: null, helpTime: null, carry: null,
      mainSkill: null, mainSkillLevel: null, nature: null, natureUp: null, natureDown: null, natureNeutral: false,
      subSkills: [], ingredients: [], ribbon: null, debug: {},
    };

    // section anchors
    const anchor = (key, maxCost) => {
      let best = null;
      for (const l of lines) {
        const r = fuzzyFind(key, l.text);
        if (r.cost <= maxCost && (!best || r.cost < best.cost)) best = { cost: r.cost, y: cy(l.bbox), bbox: l.bbox };
      }
      return best;
    };
    const hdrSub = anchor(norm('メインスキル・サブスキル'), 3) || anchor(norm('サブスキル'), 1);
    const hdrDetail = anchor(norm('詳細ステータス'), 2);
    out.debug.hdrSub = hdrSub && Math.round(hdrSub.y);
    out.debug.hdrDetail = hdrDetail && Math.round(hdrDetail.y);
    const inTop = (l) => !hdrSub || cy(l.bbox) < hdrSub.y;
    const inSubArea = (l) => (!hdrSub || cy(l.bbox) > hdrSub.y) && (!hdrDetail || cy(l.bbox) < hdrDetail.y);
    const inDetail = (l) => hdrDetail ? cy(l.bbox) > hdrDetail.y : true;

    // ---- main skill and its level ----
    const skillKeys = [];
    for (const s of vocab.skills) for (const name of s.names) skillKeys.push({ skill: s.key, name: norm(name) });
    let skillHit = null;
    for (const l of lines) {
      if (!inSubArea(l) && hdrSub) continue;
      const m = bestMatch(l.text, skillKeys, (k) => k.name, (k) => Math.max(0.6, k.length * 0.18));
      if (m && (!skillHit || m.cost < skillHit.cost)) skillHit = { ...m, line: l };
    }
    const skillLines = new Set();
    if (skillHit) {
      out.mainSkill = skillHit.c.skill;
      out.mainSkillName = skillHit.c.name;
      // skill level: "Lv.N" on any line at the same height as the skill name (any pass)
      for (const l of lines) {
        if (Math.abs(cy(l.bbox) - cy(skillHit.line.bbox)) > 0.03 * W) continue;
        skillLines.add(l);
        const mm = l.text.match(/L[VY][.,:I]?([1-8])(?!\d)/);
        if (mm && out.mainSkillLevel == null) out.mainSkillLevel = +mm[1];
      }
      out.debug.skill = skillHit.key + ' cost ' + skillHit.cost;
    }

    // ---- sub skills ----
    const hits = [];
    const subLines = new Set();
    for (const l of lines) {
      if (!inSubArea(l) || skillLines.has(l)) continue;
      for (const ph of l.phrases) {
        if (ph.text.length < 5) continue;
        const m = bestMatch(ph.text, vocab.subskills, (s) => norm(s.ja), (k) => Math.min(2.2, Math.max(1, k.length * 0.22)));
        if (!m) continue;
        const matched = ph.text.slice(m.start, m.end);
        if (!SUB_SUFFIX.test(matched) && !SUB_SUFFIX.test(ph.text)) continue;
        hits.push({ sub: m.c, cost: m.cost, margin: m.margin, x: cx(ph.bbox), y: cy(ph.bbox), pass: l.pass });
        subLines.add(l);
      }
    }
    // merge the same box seen in several passes
    const boxes = [];
    for (const h of hits.sort((a, b) => a.cost - b.cost)) {
      const near = boxes.find((b) => Math.abs(b.y - h.y) < 0.05 * W && (b.x < W / 2) === (h.x < W / 2));
      if (near) {
        if (near.sub === h.sub) near.seen++;
        else near.alts.push(h);
        continue;
      }
      boxes.push({ ...h, seen: 1, alts: [] });
    }
    // rows: anchored on the "詳細ステータス" header when visible, else by clustering
    const pitch = 0.156 * W;
    const rowOf = (y) => {
      if (hdrDetail) return Math.max(0, Math.min(2, 2 - Math.round((hdrDetail.y - y - 0.174 * W) / pitch)));
      return null;
    };
    let rows = boxes.map((b) => rowOf(b.y));
    if (rows.some((r) => r == null)) {
      const ys = [...new Set(boxes.map((b) => Math.round(b.y)))].sort((a, b) => a - b);
      const clusters = [];
      for (const y of ys) { const c = clusters.find((cl) => Math.abs(cl - y) < 0.06 * W); if (!c) clusters.push(y); }
      let base = 0;
      // a right-column box in the lowest cluster means that cluster cannot be the Lv80 row
      if (clusters.length === 2 && Math.abs(clusters[1] - clusters[0]) > 1.5 * pitch) base = 0;
      rows = boxes.map((b) => {
        const idx = clusters.findIndex((cl) => Math.abs(cl - b.y) < 0.06 * W);
        const r0 = clusters.length >= 2 ? Math.round((clusters[idx] - clusters[0]) / pitch) : 0;
        return Math.min(2, base + r0);
      });
    }
    const slots = [null, null, null, null, null];
    boxes.forEach((b, i) => {
      const slot = rows[i] * 2 + (b.x < W / 2 ? 0 : 1);
      if (slot > 4) return;
      const unsure = b.margin < 0.5 || b.alts.some((a) => a.cost - b.cost < 0.5);
      if (!slots[slot] || slots[slot].cost > b.cost) slots[slot] = { name: b.sub.ja, cost: b.cost, unsure };
    });
    out.subSkills = slots.map((s, i) => ({ unlock: [10, 25, 50, 70, 80][i], name: s ? s.name : null, unsure: s ? s.unsure : true }));
    out.debug.subBoxes = boxes.map((b, i) => `${b.sub.ja}@${Math.round(b.x)},${Math.round(b.y)} r${rows[i]} c${b.cost.toFixed(1)}`);

    // ---- nature and its effect labels ----
    let natHit = null;
    for (const l of lines) {
      if (!inDetail(l)) continue;
      const m = bestMatch(l.text, vocab.natures, (n) => norm(n.ja), (k) => (k.length <= 3 ? 0.35 : 0.7));
      if (m && (!natHit || m.cost < natHit.cost)) natHit = m;
    }
    if (natHit) out.nature = natHit.c.ja;
    const effects = [];
    for (const l of lines) {
      if (!inDetail(l)) continue;
      if (!hdrDetail && subLines.has(l)) continue;
      for (const [eff, label] of Object.entries(vocab.effects)) {
        const key = norm(label);
        const r = fuzzyFind(key, l.text);
        if (r.cost <= Math.max(1, key.length * 0.25)) effects.push({ eff, bbox: spanBox(l, r.start, r.end), cost: r.cost });
      }
      if (fuzzyFind(norm('せいかくによる特徴なし'), l.text).cost <= 2) out.natureNeutral = true;
    }
    const effByName = new Map();
    for (const e of effects.sort((a, b) => a.cost - b.cost)) if (!effByName.has(e.eff)) effByName.set(e.eff, e);
    out.debug.effects = [...effByName.keys()];
    if (img.arrowAt) {
      for (const e of effByName.values()) {
        const dir = img.arrowAt(e.bbox);
        if (dir === 'up' && !out.natureUp) out.natureUp = vocab.effects[e.eff];
        if (dir === 'down' && !out.natureDown) out.natureDown = vocab.effects[e.eff];
      }
    }
    out.effectsSeen = [...effByName.keys()];

    // ---- help time ----
    for (const l of lines) {
      const t = l.text;
      const m = t.match(/(?:(\d{1,2})時間)?(\d{1,2})分(?:(\d{1,2})[秒秘])?/) || t.match(/(\d{1,2})時間(?:(\d{1,2})[秒秘])?/);
      if (!m) continue;
      let sec;
      if (t.includes('分')) sec = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
      else sec = (+m[1]) * 3600 + (+(m[2] || 0));
      if (sec >= 600 && sec <= 3 * 3600) { out.helpTime = sec; out.debug.helpLineY = cy(l.bbox); break; }
    }

    // ---- carry limit ----
    for (const l of lines) {
      if (!inTop(l)) continue;
      const m = l.text.match(/^[^\d]{0,2}(\d{1,3})[個固箇加]/);
      if (m && +m[1] >= 5 && +m[1] <= 200 && (!out.debug.helpLineY || cy(l.bbox) > out.debug.helpLineY)) { out.carry = +m[1]; break; }
    }

    // ---- SP ----
    for (const l of lines.filter(inTop).sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
      const m = l.text.match(/[S5$]P(\d{2,5})/);
      if (m) { out.sp = +m[1]; out.debug.spY = cy(l.bbox); break; }
    }

    // ---- species ----
    let spHit = null;
    for (const l of lines) {
      if (!inTop(l)) continue;
      const m = bestMatch(l.text, vocab.species, (s) => norm(s.ja.replace(/\s*\(.*\)$/, '')), (k) => (k.length <= 3 ? 0 : Math.min(1, k.length * 0.2)));
      if (m && (!spHit || m.cost < spHit.cost || (m.cost === spHit.cost && m.key.length > spHit.key.length))) spHit = { ...m, line: l };
    }
    if (spHit) out.species = spHit.c.ja;

    // ---- level (and the "Lv.30" / "Lv.60" labels over locked ingredients) ----
    const lvCands = [];
    for (const l of lines) {
      if (!inTop(l) || skillLines.has(l)) continue;
      const re = /L[VY][.,:I]?(\d{1,3})/g;
      let m;
      while ((m = re.exec(l.text))) {
        let v = +m[1];
        if (v > 100 && m[1][0] === '1') v = +m[1].slice(1);
        if (!(v >= 1 && v <= 100)) continue;
        const box = spanBox(l, m.index, m.index + m[0].length);
        const onSpeciesLine = spHit && Math.abs(cy(l.bbox) - cy(spHit.line.bbox)) < 0.03 * W;
        let score = (onSpeciesLine ? -100 : 0) + (cx(box) < 0.5 * W ? -10 : 0) + cy(l.bbox) / H;
        if (out.debug.spY && cy(l.bbox) < out.debug.spY - 0.02 * W) score += 5;
        lvCands.push({ v, score, box, exact: /^LV[.]?\d+$/.test(m[0]) });
      }
    }
    lvCands.sort((a, b) => a.score - b.score);
    out.levelCandidates = [...new Set(lvCands.map((c) => c.v))];
    if (lvCands.length) out.level = lvCands[0].v;
    const levelBox = lvCands.length ? lvCands[0].box : null;
    // lock labels: "Lv.30" / "Lv.60" (OCR often turns the 60 into "EO" or "6O")
    const lockCands = lvCands.filter((c) => c.v === 30 || c.v === 60).map((c) => ({ v: c.v, box: c.box, exact: c.exact, score: c.score }));
    for (const l of lines) {
      if (!inTop(l) || skillLines.has(l)) continue;
      const re = /L[VY][.,:I]?([36EGB])([0OD])(?![0-9])/g;
      let m;
      while ((m = re.exec(l.text))) {
        if (/^\d\d$/.test(m[1] + m[2])) continue; // already a plain number above
        const v = m[1] === '3' || m[1] === 'B' ? 30 : 60;
        lockCands.push({ v, box: spanBox(l, m.index, m.index + m[0].length), exact: false });
      }
    }
    out.lockLabels = [];
    for (const c of lockCands) {
      if (levelBox && Math.abs(cx(c.box) - cx(levelBox)) < 0.02 * W && Math.abs(cy(c.box) - cy(levelBox)) < 0.02 * W) continue;
      const dup = out.lockLabels.find((x) => x.lv === c.v);
      if (dup) { if (c.exact && !dup.exact) Object.assign(dup, { bbox: c.box, exact: true }); continue; }
      out.lockLabels.push({ lv: c.v, bbox: c.box, exact: c.exact });
    }
    // both slots are locked below Lv30; their labels sit side by side
    const l30 = out.lockLabels.find((x) => x.lv === 30), l60 = out.lockLabels.find((x) => x.lv === 60);
    const step = 0.163 * W;
    if (l30 && !l60) out.lockLabels.push({ lv: 60, bbox: { x0: l30.bbox.x0 + step, x1: l30.bbox.x1 + step, y0: l30.bbox.y0, y1: l30.bbox.y1 }, guessed: true });
    if (l60 && !l30 && out.level && out.level < 30) out.lockLabels.push({ lv: 30, bbox: { x0: l60.bbox.x0 - step, x1: l60.bbox.x1 - step, y0: l60.bbox.y0, y1: l60.bbox.y1 }, guessed: true });

    // display name: what follows the level on the name line
    if (spHit) out.displayName = spHit.c.ja;
    else {
      const nameLine = lines.find((l) => inTop(l) && /L[VY][.,:I]?\d{1,3}/.test(l.text) && /[ぁ-んァ-ヶ一-龠]{2,}/.test(l.text.replace(/^.*L[VY][.,:I]?\d{1,3}/, '')));
      if (nameLine) {
        const rest = nameLine.text.replace(/^.*?L[VY][.,:I]?\d{1,3}/, '').match(/[ぁ-んァ-ヶー一-龠]{2,}/);
        if (rest) out.displayName = rest[0];
      }
    }

    const found = [out.subSkills.some((s) => s.name), !!out.nature || out.effectsSeen.length > 0, out.sp != null, out.helpTime != null].filter(Boolean).length;
    out.isDetailScreen = found >= 2;
    return out;
  }

  // Merge results from several screenshots of the same Pokémon (e.g. top and bottom halves).
  function merge(results) {
    if (results.length === 1) return results[0];
    const out = { ...results[0] };
    for (const k of ['displayName', 'species', 'level', 'sp', 'helpTime', 'carry', 'mainSkill', 'mainSkillLevel', 'nature', 'natureUp', 'natureDown', 'ribbon']) {
      if (out[k] == null) { const r = results.find((x) => x[k] != null); if (r) out[k] = r[k]; }
    }
    out.levelCandidates = [...new Set(results.flatMap((r) => r.levelCandidates || []))];
    const ings = results.flatMap((r) => r.ingredients || []);
    out.ingredients = [1, 30, 60].map((u) => ings.find((x) => x.unlock === u)).filter(Boolean);
    out.effectsSeen = [...new Set(results.flatMap((r) => r.effectsSeen || []))];
    out.natureNeutral = results.some((r) => r.natureNeutral);
    out.subSkills = [0, 1, 2, 3, 4].map((i) => {
      const c = results.map((r) => r.subSkills[i]).filter((s) => s && s.name);
      c.sort((a, b) => (a.unsure - b.unsure));
      return c[0] || { unlock: [10, 25, 50, 70, 80][i], name: null, unsure: true };
    });
    out.isDetailScreen = results.some((r) => r.isDetailScreen);
    return out;
  }

  return { parse, merge, fuzzyFind, norm };
});
