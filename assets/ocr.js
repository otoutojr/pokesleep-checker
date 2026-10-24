/* On-device screenshot reading with Tesseract.js (Apache-2.0). Nothing leaves the device:
 * the OCR engine, its Japanese model and the screenshot are all handled locally.
 * Exposes window.OCR.read(file, { vocab, onProgress }) -> parsed fields (see ocr-parse.js). */
(function () {
  'use strict';
  const BASE = new URL('./', document.baseURI).href;
  let workerPromise = null;
  let progressFn = null;

  function getWorker() {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('jpn', 1, {
        workerPath: BASE + 'vendor/tesseract/worker.min.js',
        corePath: BASE + 'vendor/tesseract/',
        langPath: BASE + 'vendor/tessdata',
        workerBlobURL: false,
        logger: (m) => { if (progressFn) progressFn(m); },
      }).then(async (w) => {
        // sparse-text mode finds the scattered labels and boxes of a game screen far better than one block
        await w.setParameters({ tessedit_pageseg_mode: '11' });
        return w;
      }).catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  async function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); } catch (e) { /* fall back to <img> */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  // Small screenshots (resized when shared) are enlarged: the OCR reads small text much worse.
  function toCanvas(src, maxW, minW) {
    const w0 = src.width, h0 = src.height;
    const scale = w0 > maxW ? maxW / w0 : minW && w0 < minW ? minW / w0 : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * scale);
    c.height = Math.round(h0 * scale);
    c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // th150: dark text only (values, nature name). minc: also keeps the pale text of locked sub skills.
  function variant(src, kind) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const id = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const v = kind === 'th150'
        ? (0.299 * r + 0.587 * g + 0.114 * b < 150 ? 0 : 255)
        : (Math.min(r, g, b) < 170 ? 0 : 255);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    c.getContext('2d').putImageData(id, 0, 0);
    return c;
  }

  // Up arrows next to a nature effect are orange-red, down arrows are blue.
  function arrowSampler(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const W = canvas.width, H = canvas.height;
    return (b) => {
      const x0 = Math.min(W - 1, Math.round(b.x1 + 0.01 * W)), x1 = Math.min(W, Math.round(b.x1 + 0.32 * W));
      const y0 = Math.max(0, Math.round(b.y0)), y1 = Math.min(H, Math.round(b.y1));
      if (x1 <= x0 || y1 <= y0) return null;
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let red = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], bl = d[i + 2];
        if (r > 200 && g < 150 && bl < 120) red++;
        else if (bl > 180 && r < 130 && g < 200) blue++;
      }
      const min = Math.max(12, (W / 1206) ** 2 * 40);
      if (red > min && red > blue * 2) return 'up';
      if (blue > min && blue > red * 2) return 'down';
      return null;
    };
  }

  // Sub skill boxes are colored by rarity (white: S of speed / ingredient / skill trigger / inventory;
  // blue: their M (and 最大所持数アップM・L), スキルレベルアップS; gold: きのみの数S, スキルレベルアップM, bonuses),
  // also when the slot is still locked (paler). The color settles S / M when the letter is misread.
  function boxColorSampler(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const W = canvas.width, H = canvas.height;
    const classify = (r, g, b) => {
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 6 && Math.min(r, g, b) >= 236) return 'white';
      if (b - r >= 8 && b >= 225 && g >= r) return 'blue';
      if (r >= 225 && r - b >= 25 && g >= b) return 'gold';
      return null;
    };
    const at = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return null;
      const d = ctx.getImageData(x - 1, y - 1, 3, 3).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      return classify(r / 9, g / 9, b / 9);
    };
    return (bb) => {
      const cy = (bb.y0 + bb.y1) / 2, cx = (bb.x0 + bb.x1) / 2;
      const pts = [[bb.x0 - 0.02 * W, cy], [bb.x0 - 0.035 * W, cy], [bb.x1 + 0.02 * W, cy], [bb.x1 + 0.035 * W, cy],
        [cx, bb.y0 - 0.008 * W], [cx, bb.y1 + 0.008 * W]];
      const votes = {};
      for (const [x, y] of pts) { const c = at(x, y); if (c) votes[c] = (votes[c] || 0) + 1; }
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      return best && best[1] >= 3 ? best[0] : null;
    };
  }

  // ---- ingredient counts ("x4") on the badges under the "Lv.30" / "Lv.60" lock labels ----
  // The Japanese model misreads these Latin digits, so a small English model reads them.
  let engPromise = null;
  function getEngWorker() {
    if (!engPromise) {
      engPromise = (async () => {
        const w = await Tesseract.createWorker('eng', 1, {
          workerPath: BASE + 'vendor/tesseract/worker.min.js',
          corePath: BASE + 'vendor/tesseract/',
          langPath: BASE + 'vendor/tessdata',
          workerBlobURL: false,
          logger: (m) => { if (progressFn) progressFn(Object.assign({}, m, { eng: true })); },
        });
        await w.setParameters({ tessedit_pageseg_mode: '8', tessedit_char_whitelist: 'xX×0123456789' });
        return w;
      })().catch((e) => { engPromise = null; throw e; });
    }
    return engPromise;
  }
  const isGolden = (d, i) => d[i] > 210 && d[i + 1] > 140 && d[i + 1] < 215 && d[i + 2] < 120 && d[i] - d[i + 2] > 120;
  // a count badge is white inside with a little dark text
  function looksLikeBadge(canvas, box) {
    const w = box.x1 - box.x0, h = box.y1 - box.y0;
    if (w < 4 || h < 4) return false;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(box.x0, box.y0, w, h).data;
    let white = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum > 235) white++;
      else if (lum < 150) dark++;
    }
    const n = d.length / 4;
    return white / n > 0.45 && dark / n > 0.02 && dark / n < 0.45;
  }
  // The count badge is a white pill with a golden border, somewhere below its lock label.
  function findBadgeBelow(canvas, lb) {
    const W = canvas.width, H = canvas.height;
    const x0 = Math.max(0, Math.round(lb.x0 - 0.06 * W)), x1 = Math.min(W, Math.round(lb.x1 + 0.12 * W));
    const y0 = Math.max(0, Math.round(lb.y1)), y1 = Math.min(H, Math.round(lb.y1 + 0.26 * W));
    if (x1 <= x0 || y1 <= y0) return null;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const w = x1 - x0;
    const minRun = 0.035 * W;
    const bands = [];
    for (let y = 0; y < y1 - y0; y++) {
      let best = null, cur = null;
      for (let x = 0; x < w; x++) {
        if (isGolden(d, (y * w + x) * 4)) { if (!cur) cur = { a: x, b: x }; else cur.b = x; }
        else if (cur && x - cur.b > 2) { if (!best || cur.b - cur.a > best.b - best.a) best = cur; cur = null; }
      }
      if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur;
      if (!best || best.b - best.a < minRun) continue;
      const last = bands[bands.length - 1];
      if (last && y - last.y1 <= 2) { last.y1 = y; last.a = Math.min(last.a, best.a); last.b = Math.max(last.b, best.b); }
      else bands.push({ y0: y, y1: y, a: best.a, b: best.b });
    }
    for (let i = 0; i + 1 < bands.length; i++) {
      const t = bands[i], u = bands[i + 1];
      const h = u.y0 - t.y1;
      if (h > 0.018 * W && h < 0.045 * W && Math.abs(t.a - u.a) < 0.02 * W) {
        const box = { x0: x0 + Math.min(t.a, u.a), x1: x0 + Math.max(t.b, u.b), y0: y0 + t.y1 + 1, y1: y0 + u.y0 - 1 };
        if (looksLikeBadge(canvas, box)) return box;
      }
    }
    return null;
  }
  function badgeCrop(canvas, box) {
    const W = canvas.width;
    const pad = Math.round(0.006 * W);
    const bx = box.x0 + pad, bw = Math.max(1, box.x1 - pad - bx), by = box.y0 + 1, bh = Math.max(1, box.y1 - by);
    const S = 3, M = 24;
    const c = document.createElement('canvas');
    c.width = bw * S + 2 * M;
    c.height = bh * S + 2 * M;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, bx, by, bw, bh, M, M, bw * S, bh * S);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 170 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }
  // Every count badge in the same row as a known one (unlocked slots have no lock label).
  function badgesInRow(canvas, ref) {
    const W = canvas.width;
    const y0 = Math.max(0, ref.y0 - 8), y1 = Math.min(canvas.height, ref.y1 + 8);
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, y0, W, y1 - y0).data;
    const runs = (yy) => {
      const out = []; let cur = null;
      for (let x = 0; x < W; x++) {
        if (isGolden(d, ((yy - y0) * W + x) * 4)) { if (!cur) cur = { a: x, b: x }; else cur.b = x; }
        else if (cur && x - cur.b > 2) { out.push(cur); cur = null; }
      }
      if (cur) out.push(cur);
      return out.filter((r) => r.b - r.a >= 0.026 * W);
    };
    const tops = [];
    for (let y = Math.max(y0, ref.y0 - 6); y <= Math.min(y1 - 1, ref.y0 + 2); y++) {
      for (const r of runs(y)) if (!tops.some((t) => Math.abs((t.a + t.b) / 2 - (r.a + r.b) / 2) < 0.03 * W)) tops.push(r);
    }
    const out = [];
    for (const r of tops) {
      let ok = false;
      for (let y = Math.max(y0, ref.y1 - 2); y <= Math.min(y1 - 1, ref.y1 + 6) && !ok; y++) {
        ok = runs(y).some((q) => q.a < r.b + 10 && q.b > r.a - 10);
      }
      const box = { x0: r.a, x1: r.b, y0: ref.y0, y1: ref.y1 };
      if (ok && looksLikeBadge(canvas, box)) out.push(box);
    }
    return out.sort((p, q) => p.x0 - q.x0);
  }
  // Mean pixel difference between the ingredient icons above two badges (same ingredient = same sprite).
  function iconDiff(canvas, b1, b2) {
    const W = canvas.width;
    const w = Math.round(0.11 * W), h = Math.round(0.07 * W);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const grab = (b, pad) => {
      const x = Math.max(0, b.x1 - Math.round(0.095 * W) - pad), y = Math.max(0, b.y0 - Math.round(0.082 * W) - pad);
      return { x, y, img: ctx.getImageData(x, y, w + 2 * pad, h + 2 * pad) };
    };
    const A = grab(b1, 0), B = grab(b2, 8);
    let best = Infinity;
    for (let dx = 0; dx <= 16; dx += 2) for (let dy = 0; dy <= 16; dy += 2) {
      let sum = 0, n = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const i = (y * A.img.width + x) * 4, j = ((y + dy) * B.img.width + x + dx) * 4;
        const a = A.img.data, c = B.img.data;
        sum += Math.abs(a[i] - c[j]) + Math.abs(a[i + 1] - c[j + 1]) + Math.abs(a[i + 2] - c[j + 2]);
        n += 3;
      }
      if (n && sum / n < best) best = sum / n;
    }
    return best;
  }
  // The badges of the ingredient row, each tied to its slot (Lv1 / Lv30 / Lv60 from left to right):
  // from the lock labels when some slots are still locked, else from the badges' own shape and place.
  function ingredientSlots(canvas, labels) {
    const W = canvas.width;
    const anchors = labels.map((lb) => ({ lv: lb.lv, box: findBadgeBelow(canvas, lb.bbox) })).filter((x) => x.box);
    if (!anchors.length) {
      return window.IngIcons ? window.IngIcons.findRow(canvas).map((r) => ({ idx: r.slot, box: r.box })) : [];
    }
    const row = badgesInRow(canvas, anchors[0].box);
    for (const an of anchors) if (!row.some((b) => Math.abs(b.x0 - an.box.x0) < 0.03 * W)) row.push(an.box);
    row.sort((p, q) => p.x0 - q.x0);
    const step = 0.163 * W;
    const ref = anchors[0];
    const refIdx = [1, 30, 60].indexOf(ref.lv);
    const slots = [];
    for (const b of row) {
      const idx = refIdx - Math.round((ref.box.x0 - b.x0) / step);
      const off = Math.abs((ref.box.x0 - b.x0) - (refIdx - idx) * step);
      if (idx < 0 || idx > 2 || off > 0.04 * W || slots.some((x) => x.idx === idx)) continue;
      slots.push({ idx, box: b });
    }
    return slots;
  }
  async function readIngredientRow(canvas, labels) {
    const slots = ingredientSlots(canvas, labels || []);
    if (!slots.length) return [];
    const out = [];
    for (const sl of slots) {
      // the count by the badge font's glyphs (every count x1-x20 scored); general OCR only when no text was found
      let badge = null;
      try { badge = window.IngIcons && window.IngIcons.readCount ? window.IngIcons.readCount(canvas, sl.box) : null; } catch (e) { badge = null; }
      let count = badge ? badge.count : null;
      if (!badge) {
        const eng = await getEngWorker();
        const { data } = await eng.recognize(badgeCrop(canvas, sl.box));
        const m = String(data.text || '').replace(/\s/g, '').match(/(\d{1,2})/);
        count = m && +m[1] >= 1 && +m[1] <= 20 ? +m[1] : null;
      }
      let icon = null;
      try { icon = window.IngIcons ? window.IngIcons.score(canvas, sl.box) : null; } catch (e) { icon = null; }
      out.push({ unlock: [1, 30, 60][sl.idx], count, countScores: badge ? badge.scores : null, same: {}, box: sl.box, icon });
    }
    // same sprite or not, only between icons drawn the same way (a locked icon is faded)
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const fi = out[i].icon && out[i].icon.faded, fj = out[j].icon && out[j].icon.faded;
      if (fi == null || fj == null || fi !== fj) continue;
      const diff = iconDiff(canvas, slots[i].box, slots[j].box);
      const same = diff < 12 ? true : diff > 24 ? false : undefined;
      if (same === undefined) continue;
      out[i].same[out[j].unlock] = same;
      out[j].same[out[i].unlock] = same;
    }
    return out;
  }

  async function recognize(worker, canvas) {
    const { data } = await worker.recognize(canvas);
    return {
      lines: (data.lines || []).map((l) => ({
        text: l.text,
        bbox: l.bbox,
        words: (l.words || []).map((w) => ({ text: w.text, bbox: w.bbox, conf: w.confidence })),
      })),
    };
  }

  async function read(file, opts) {
    const onProgress = (opts && opts.onProgress) || null;
    progressFn = onProgress;
    try {
      const worker = await getWorker();
      const bmp = await loadBitmap(file);
      const base = toCanvas(bmp, 1300, 1080);
      if (bmp.close) bmp.close();
      const img = { width: base.width, height: base.height, passes: [], arrowAt: arrowSampler(base), boxColor: boxColorSampler(base) };
      const plan = [() => base, () => variant(base, 'th150')];
      for (let i = 0; i < plan.length; i++) {
        if (onProgress) onProgress({ status: 'pass', pass: i + 1, total: plan.length });
        img.passes.push(await recognize(worker, plan[i]()));
      }
      let res = OCRParse.parse(img, opts.vocab);
      const missing = res.subSkills.some((s) => !s.name) || (!res.nature && !(res.natureUp && res.natureDown));
      if (missing) {
        if (onProgress) onProgress({ status: 'pass', pass: 3, total: 3 });
        img.passes.push(await recognize(worker, variant(base, 'minc')));
        res = OCRParse.parse(img, opts.vocab);
      }
      if (onProgress) onProgress({ status: 'counts' });
      try { res.ingredients = await readIngredientRow(base, res.lockLabels || []); } catch (e) { res.ingredients = []; }
      window.OCR.last = res; // kept for troubleshooting
      return res;
    } finally {
      progressFn = null;
    }
  }

  window.OCR = { read, warmup: () => getWorker() };
})();
