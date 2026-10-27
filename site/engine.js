/* Kirtan Follow engine (browser + Node). Port of phonetic.py / engine.py / controller.py.
   Data: data/meta.json, data/index.txt, data/s/<n>.json, data/b/<id>.json  (built by build_web.py) */
(function (root) {
  "use strict";

  // ---------- sound key (must match phonetic.py exactly) ----------
  const INDEPENDENT = { "ਆ": "ਅਾ", "ਇ": "ਅਿ", "ਈ": "ਅਿ", "ਉ": "ਅੁ", "ਊ": "ਅੁ",
    "ਏ": "ਅੇ", "ਐ": "ਅੇ", "ਓ": "ਅੋ", "ਔ": "ਅੋ", "ੲ": "ਅ", "ੳ": "ਅ" };
  const FOLD = [["ੀ", "ਿ"], ["ੂ", "ੁ"], ["ੈ", "ੇ"], ["ੌ", "ੋ"], ["ਣ", "ਨ"], ["ਙ", "ਨ"], ["ਞ", "ਨ"],
    ["ਸ਼", "ਸ"], ["ਜ਼", "ਜ"], ["ਫ਼", "ਫ"], ["ਖ਼", "ਖ"], ["ਗ਼", "ਗ"], ["ਲ਼", "ਲ"],
    ["ੰ", ""], ["ਂ", ""], ["ੱ", ""], ["਼", ""], ["ੑ", ""], ["ੵ", ""], ["ੴ", "ਇਕੋਕਾਰ"]];

  function soundKey(text) {
    let t = text.replace(/[.;,]/g, " ").replace(/[੦-੯।॥]/g, " ").split("ਰਹਾਉ").join(" ");
    for (const [a, b] of FOLD) t = t.split(a).join(b);
    t = t.replace(/੍/g, "").replace(/[^਀-੿ ]/g, " ");
    const words = [];
    for (let w of t.split(/\s+/)) {
      if (!w) continue;
      const cs = Array.from(w);
      if (cs.length > 1 && (cs[cs.length - 1] === "ੁ" || cs[cs.length - 1] === "ਿ")) {
        const p = cs[cs.length - 2];
        if (p >= "ਕ" && p <= "ਫ਼") cs.pop();
      }
      w = cs.map(ch => INDEPENDENT[ch] || ch).join("");
      if (w) words.push(w);
    }
    return words.join(" ");
  }

  const FILLER = /(ਵਾਹਿਗੁਰੂ|ਵਾਹਗੁਰੂ|ਵਾਹਿਗੁਰ|ਸਾਧ ਸੰਗਤ ਜੀ|ਸਾਧ ਸੰਗਤ|ਬੋਲੋ ਜੀ)/g;
  const DEVA_SPECIAL = { "ष": "ਸ਼", "ऋ": "ਰਿ", "ॠ": "ਰੀ", "ऍ": "ਐ", "ऑ": "ਔ", "ॅ": "ੈ", "ॉ": "ੌ",
    "ृ": "੍ਰਿ", "ॄ": "੍ਰੀ", "ः": "", "ँ": "ਂ", "ऽ": "", "क़": "ਕ", "ख़": "ਖ਼", "ग़": "ਗ਼", "ज़": "ਜ਼",
    "ड़": "ੜ", "ढ़": "ੜ੍ਹ", "फ़": "ਫ਼", "य़": "ਯ" };
  function cleanAsr(text) {
    let out = "";
    for (const ch of text) {
      if (DEVA_SPECIAL[ch] !== undefined) out += DEVA_SPECIAL[ch];
      else if (ch >= "ऀ" && ch <= "ॿ") out += String.fromCharCode(ch.charCodeAt(0) + 0x100);
      else out += ch;
    }
    return out.replace(FILLER, " ");
  }

  // ---------- fuzzy matching (rapidfuzz ratio / partial_ratio) ----------
  let dpRow = new Uint16Array(256);
  function lcs(a, as, ae, b, bs, be) {
    const m = be - bs;
    if (dpRow.length < m + 1) dpRow = new Uint16Array(m + 1);
    const row = dpRow; row.fill(0, 0, m + 1);
    for (let i = as; i < ae; i++) {
      const ca = a.charCodeAt(i);
      let prev = 0;
      for (let j = 1; j <= m; j++) {
        const tmp = row[j];
        row[j] = ca === b.charCodeAt(bs + j - 1) ? prev + 1 : (row[j] > row[j - 1] ? row[j] : row[j - 1]);
        prev = tmp;
      }
    }
    return row[m];
  }
  function ratio(a, b) {
    if (!a.length && !b.length) return 100;
    return 200 * lcs(a, 0, a.length, b, 0, b.length) / (a.length + b.length);
  }
  function partialRatio(a, b) {
    if (!a.length || !b.length) return 0;
    let s = a, l = b;
    if (s.length > l.length) { s = b; l = a; }
    const m = s.length, n = l.length;
    let best = 0;
    for (let start = -(m - 1); start < n; start++) {
      const ws = Math.max(0, start), we = Math.min(n, start + m);
      const wl = we - ws;
      if (200 * Math.min(m, wl) / (m + wl) <= best) continue;   // can't beat best
      const r = 200 * lcs(s, 0, m, l, ws, we) / (m + wl);
      if (r > best) { best = r; if (best === 100) break; }
    }
    return best;
  }

  // ---------- data ----------
  class Gurbani {
    constructor(base, fetcher) { this.base = base; this.fetch = fetcher; this.shardCache = new Map(); }
    async load(onProgress) {
      this.meta = JSON.parse(await this.fetch(this.base + "meta.json"));
      this.toAscii = {};
      for (const [a, g] of Object.entries(this.meta.cmap)) this.toAscii[g] = a;
      const txt = await this.fetch(this.base + "index.txt", onProgress);
      const L = txt.split("\n");
      const n = L.length;
      this.shabad = new Int32Array(n); this.idx = new Int16Array(n); this.type = new Int8Array(n);
      this.page = new Int16Array(n); this.fl = new Array(n); this.key = new Array(n);
      let k = 0;
      for (const line of L) {
        if (!line) continue;
        const p = line.split("\t");
        this.shabad[k] = +p[0]; this.idx[k] = +p[1]; this.type[k] = +p[2]; this.page[k] = +p[3];
        this.fl[k] = p[4]; this.key[k] = p[5] || ""; k++;
      }
      this.count = k;
    }
    asciiKey(gurmukhiKey) {
      let o = "";
      for (const ch of gurmukhiKey) o += ch === " " ? " " : (this.toAscii[ch] || "·");
      return o;
    }
    async shard(num) {
      const s = num % this.meta.shards;
      if (!this.shardCache.has(s)) {
        const pr = this.fetch(`${this.base}s/${s}.json`).then(JSON.parse);
        pr.catch(() => this.shardCache.delete(s));   // don't remember a failed download
        this.shardCache.set(s, pr);
      }
      return (await this.shardCache.get(s))[num];
    }
    async shabadData(num) {
      const sh = await this.shard(num);
      const lines = sh.l.map((r, i) => ({ type: r[0], page: r[1], gurmukhi: r[2], english: r[3], punjabi: r[4],
        translit: r[5], ref: [num, i], key: this.lineKey(num, i) }));
      return { meta: { num, source: sh.m[0], pageLabel: sh.m[1], writer: sh.m[2], section: sh.m[3],
        page: lines[0] && lines[0].page }, lines };
    }
    async baniData(id) {
      const b = JSON.parse(await this.fetch(`${this.base}b/${id}.json`));
      const lines = b.l.map((r, i) => ({ type: r[0], page: r[1], gurmukhi: r[2], english: r[3], punjabi: r[4],
        translit: r[5], ref: b.refs[i], key: this.lineKey(b.refs[i][0], b.refs[i][1]) }));
      return { meta: { bani: id, name: b.m[0], namePa: b.m[1] }, lines };
    }
    lineKey(num, i) {
      if (!this.rowOf) {
        this.rowOf = new Map();
        for (let k = 0; k < this.count; k++) if (this.idx[k] === 0) this.rowOf.set(this.shabad[k], k);
      }
      const r = this.rowOf.get(num);
      return r === undefined ? "" : this.key[r + i] || "";
    }
    // search: STTM first letters (knsr), Gurmukhi first letters (ਕਨਸਰ), Gurmukhi words, or Ang number
    search(q, limit = 20) {
      q = q.trim();
      if (!q) return [];
      const out = [];
      if (/^\d+$/.test(q)) {
        const ang = +q;
        for (let k = 0; k < this.count && out.length < 80; k++)
          if (this.meta.src[this.shabad[k]] === 0 && this.page[k] === ang && this.type[k] >= 3) out.push(k);
        return out.slice(0, limit);
      }
      const hasG = /[਀-੿]/.test(q);
      if (hasG && /\s/.test(q)) {                         // words: match on sound
        const key = this.asciiKey(soundKey(q));
        for (let k = 0; k < this.count && out.length < limit; k++) if (this.key[k].includes(key)) out.push(k);
        return out;
      }
      const fl = hasG ? gurmukhiToSttm(q) : q;
      const starts = [], contains = [];
      for (let k = 0; k < this.count; k++) {
        const f = this.fl[k];
        if (f.startsWith(fl)) { starts.push(k); if (starts.length >= limit) break; }
        else if (contains.length < limit && f.includes(fl)) contains.push(k);
      }
      return starts.concat(contains).slice(0, limit);
    }
  }

  // Gurmukhi first letters -> SikhiToTheMax keyboard letters
  const STTM = { "ੳ": "a", "ਅ": "A", "ੲ": "e", "ਸ": "s", "ਹ": "h", "ਕ": "k", "ਖ": "K", "ਗ": "g", "ਘ": "G",
    "ਙ": "|", "ਚ": "c", "ਛ": "C", "ਜ": "j", "ਝ": "J", "ਞ": "\\", "ਟ": "t", "ਠ": "T", "ਡ": "f", "ਢ": "F",
    "ਣ": "x", "ਤ": "q", "ਥ": "Q", "ਦ": "d", "ਧ": "D", "ਨ": "n", "ਪ": "p", "ਫ": "P", "ਬ": "b", "ਭ": "B",
    "ਮ": "m", "ਯ": "X", "ਰ": "r", "ਲ": "l", "ਵ": "v", "ੜ": "V", "ਸ਼": "S", "ਖ਼": "^", "ਗ਼": "Z", "ਜ਼": "z",
    "ਫ਼": "&", "ਲ਼": "L", "ੴ": "<>", "ਆ": "A", "ਇ": "e", "ਈ": "e", "ਏ": "e", "ਐ": "A", "ਉ": "a", "ਊ": "a",
    "ਓ": "a", "ਔ": "A" };
  function gurmukhiToSttm(q) {
    let o = "";
    for (const ch of q.normalize("NFC")) if (STTM[ch]) o += STTM[ch];
    return o;
  }

  // ---------- shabad finder (Full Auto) ----------
  class ShabadFinder {
    constructor(gb) {
      this.gb = gb; this.rows = []; this.votes = new Map(); this.bestLine = new Map();
      const post = new Map();
      for (let k = 0; k < gb.count; k++) {
        const t = gb.type[k], key = gb.key[k];
        if ((t !== 3 && t !== 4) || key.split(" ").length < 3) continue;
        const i = this.rows.length; this.rows.push(k);
        for (const g of trigrams(key)) { let a = post.get(g); if (!a) post.set(g, a = []); a.push(i); }
      }
      this.n = this.rows.length; this.post = new Map(); this.idf = new Map();
      for (const [g, a] of post) { this.post.set(g, Int32Array.from(a)); this.idf.set(g, Math.log(this.n / (1 + a.length))); }
      this.score = new Float32Array(this.n);
    }
    candidates(qk, top = 40) {
      const q = [...trigrams(qk)].filter(g => (this.idf.get(g) || 0) > 2.0);
      if (q.length < 4) return [];
      let total = 0; const sc = this.score; sc.fill(0); const touched = [];
      for (const g of q) {
        const w = this.idf.get(g); total += w;
        for (const i of this.post.get(g)) { if (sc[i] === 0) touched.push(i); sc[i] += w; }
      }
      touched.sort((x, y) => sc[y] - sc[x]);
      const out = [];
      for (const i of touched.slice(0, top)) {
        const cov = sc[i] / total;
        if (cov < 0.3) continue;
        const fine = partialRatio(this.gb.key[this.rows[i]], qk);
        out.push([fine * 0.7 + cov * 100 * 0.3, i]);
      }
      return out.sort((a, b) => b[0] - a[0]);
    }
    update(qk) {
      for (const [s, v] of this.votes) { const nv = v * 0.8; if (nv < 0.05) this.votes.delete(s); else this.votes.set(s, nv); }
      const best = new Map();
      for (const [score, i] of this.candidates(qk)) {
        const sid = this.gb.shabad[this.rows[i]];
        if (!best.has(sid) || score > best.get(sid)[0]) best.set(sid, [score, i]);
      }
      for (const [sid, [score]] of best) if (score >= 60)
        this.votes.set(sid, (this.votes.get(sid) || 0) + Math.min(1.5, ((score - 55) / 30) ** 2));
      this.bestLine = best;
      return [...this.votes].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([sid, v]) => ({ sid, v, line: best.has(sid) ? this.gb.idx[this.rows[best.get(sid)[1]]] : null }));
    }
    sameText(a, b) {
      const x = this.bestLine.get(a), y = this.bestLine.get(b);
      return !!(x && y && this.gb.key[this.rows[x[1]]] === this.gb.key[this.rows[y[1]]]);
    }
    forget(sid) { this.votes.delete(sid); }
    reset() { this.votes.clear(); }
  }
  function trigrams(key) {
    const s = "_" + key.split(" ").join("_") + "_", out = new Set();
    for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
    return out;
  }

  // ---------- line tracker ----------
  // Switches lines only when it is SWITCH_CONFIDENCE sure, combining the shabad's usual order
  // (next line, back to rahao, or a repeat) with how well the words heard since the last change fit.
  const TUNE = { switchConfidence: 0.70, sharpness: 5.0 };
  const SHORT_PEN = [0, 12, 4, 1, 0];

  class LineTracker {
    constructor(lines, start, clock) {
      this.lines = lines; this.clock = clock;
      this.keys = lines.map(l => l.key);
      this.trackable = lines.map(l => (l.type === 3 || l.type === 4) && !!l.key);
      this.rahao = lines.map(l => l.type === 3);
      this.isBani = lines.length > 40;
      this.current = start != null ? start : Math.max(0, this.trackable.indexOf(true));
      this.lastMatch = clock(); this.confidence = 0; this.bestRaw = 0;
    }
    nextFrom(i) { for (let j = i + 1; j < this.lines.length; j++) if (this.trackable[j]) return j; return null; }
    prior() {
      const n = this.lines.length, p = new Float64Array(n);
      const nxt = this.nextFrom(this.current);
      if (this.isBani) {
        for (let i = Math.max(0, this.current - 3); i <= Math.min(n - 1, this.current + 6); i++) if (this.trackable[i]) p[i] = 0.02;
        p[this.current] = 0.30;
        if (nxt !== null) { p[nxt] = 0.50; const nn = this.nextFrom(nxt); if (nn !== null) p[nn] = 0.10; }
      } else {
        let cnt = 0; for (let i = 0; i < n; i++) if (this.trackable[i]) cnt++;
        const rest = 0.15 / Math.max(1, cnt);
        const rah = [];
        for (let i = 0; i < n; i++) if (this.trackable[i]) { p[i] = rest; if (this.rahao[i] && i !== this.current && i !== nxt) rah.push(i); }
        p[this.current] += 0.25;
        if (nxt !== null) p[nxt] += 0.40;
        for (const i of rah) p[i] += 0.20 / rah.length;
      }
      let t = 0; for (const x of p) t += x;
      if (t > 0) for (let i = 0; i < n; i++) p[i] /= t;
      return p;
    }
    posterior(heard) {
      const pr = this.prior();
      const h = heard.split(" ").filter(Boolean);
      if (!h.length) return pr;
      const hk = h.slice(-4).join(" ");
      const tails = [];
      for (let n = 1; n <= Math.min(h.length, 4); n++) { const t = h.slice(-n).join(" "); if (t.length >= 3) tails.push([n, t]); }
      const logp = new Array(pr.length).fill(null);
      let bestRaw = 0, m = -Infinity;
      for (let i = 0; i < pr.length; i++) {
        if (pr[i] <= 0) continue;
        const words = this.keys[i].split(" ");
        let sStart = 0;
        for (const [n, t] of tails) if (words.length >= n) {
          const s = ratio(words.slice(0, n).join(" "), t) - SHORT_PEN[n] - (t.length < 6 ? 6 : 0);
          if (s > sStart) sStart = s;
        }
        const sc = Math.max(sStart, partialRatio(this.keys[i], hk) - 6);
        if (sc > bestRaw) bestRaw = sc;
        logp[i] = Math.log(pr[i]) + (sc - 100) / TUNE.sharpness;
        if (logp[i] > m) m = logp[i];
      }
      this.bestRaw = bestRaw;
      const e = logp.map(x => x === null ? 0 : Math.exp(x - m));
      const t = e.reduce((a, b) => a + b, 0);
      return e.map(x => x / t);
    }
    update(heard) {
      if (!heard) return null;
      const post = this.posterior(heard);
      let best = 0; for (let i = 1; i < post.length; i++) if (post[i] > post[best]) best = i;
      this.confidence = post[best];
      if (this.bestRaw >= 70) this.lastMatch = this.clock();
      if (best !== this.current && post[best] >= TUNE.switchConfidence) {
        this.current = best; this.lastMatch = this.clock(); return best;
      }
      return null;
    }
    secondsLost() { return (this.clock() - this.lastMatch) / 1000; }
  }

  // ---------- controller ----------
  const AUTO_LOCK_VOTES = 2.5, AUTO_LOCK_RATIO = 1.8, AUTO_SWITCH_LOST_SECS = 7;

  class Controller {
    constructor(gb, opts = {}) {
      this.gb = gb; this.clock = opts.clock || (() => Date.now());
      this.mode = "semi"; this.finalWords = []; this.interim = ""; this.marker = 0;
      this.tracker = null; this.meta = {}; this.lines = []; this.kind = null; this.blank = false;
      this.suggestions = []; this.heard = ""; this.finder = null; this.cand = null;
      this.onChange = () => {}; this.linesVersion = 0;
    }
    ensureFinder() { if (!this.finder) this.finder = new ShabadFinder(this.gb); return this.finder; }
    feed(text, final) { this.ingest(text, final); return this.process(); }
    ingest(text, final) {
      text = cleanAsr(text);
      if (final) {
        this.finalWords.push(...text.split(/\s+/).filter(Boolean));
        if (this.finalWords.length > 200) { const d = this.finalWords.length - 200; this.finalWords.splice(0, d); this.marker = Math.max(0, this.marker - d); }
        this.interim = "";
      } else this.interim = text;
    }
    windows() {
      const words = this.finalWords.concat(this.interim.split(/\s+/).filter(Boolean));
      this.heard = words.slice(-20).join(" ");
      const fresh = words.length > this.marker ? words.slice(this.marker) : [];
      const k = w => this.gb.asciiKey(soundKey(w.join(" ")));
      return { heard: fresh.length ? k(fresh.slice(-4)) : "", short: k(words.slice(-6)), wide: k(words.slice(-14)) };
    }
    async process() {
      if (this.mode === "manual") return false;
      const w = this.windows();
      const lost = !this.tracker || this.tracker.secondsLost() > 8;
      if ((this.mode === "auto" || lost) && this.finder) {
        const ranked = this.finder.update(w.wide);
        const curNum = this.kind === "shabad" ? this.meta.num : null;
        this.suggestions = ranked.filter(s => s.sid !== curNum).slice(0, 3);
        if (this.mode === "auto" && ranked.length) {
          const top = ranked[0], second = ranked[1] ? ranked[1].v : 0;
          const twin = ranked.length > 1 && this.finder.sameText(top.sid, ranked[1].sid);
          const strong = top.v >= AUTO_LOCK_VOTES && (top.v >= AUTO_LOCK_RATIO * second || twin);
          if (this.tracker && this.tracker.secondsLost() > AUTO_SWITCH_LOST_SECS && curNum != null) this.finder.forget(curNum);
          const fast = this.fastSwitch(w.short);
          if (fast) { await this.loadShabad(fast[0], fast[1]); return true; }
          if (top.sid !== curNum && strong && (!this.tracker || this.tracker.secondsLost() > AUTO_SWITCH_LOST_SECS || top.v >= 2 * AUTO_LOCK_VOTES)) {
            await this.loadShabad(top.sid, top.line);
            return true;
          }
        }
      }
      if (this.tracker) {
        const n = this.tracker.update(w.heard);
        if (n !== null) { this.marker = this.finalWords.length + this.interim.split(/\s+/).filter(Boolean).length; this.onChange(); return true; }
      }
      return false;
    }
    // switch shabad within ~1s when the newest words clearly belong to another one
    fastSwitch(short) {
      const f = this.finder;
      if (short.length < 12 || !f.bestLine.size) { this.cand = null; return null; }
      const curNum = this.kind === "shabad" ? this.meta.num : null;
      const fits = [];
      for (const [sid, [, i]] of f.bestLine) fits.push([partialRatio(this.gb.key[f.rows[i]], short), sid, i]);
      fits.sort((a, b) => b[0] - a[0]);
      const [fs, sid, i] = fits[0];
      const key = this.gb.key[f.rows[i]];
      const rival = fits.slice(1).find(x => x[1] !== sid && this.gb.key[f.rows[x[2]]] !== key);
      if (sid === curNum || fs < 84 || (rival && rival[0] >= fs - 6)) { this.cand = null; return null; }
      let curFit = 0;
      if (this.tracker) this.tracker.keys.forEach((k, j) => { if (this.tracker.trackable[j]) curFit = Math.max(curFit, partialRatio(k, short)); });
      if (curFit >= fs - 8) { this.cand = null; return null; }
      const now = this.clock(), line = this.gb.idx[f.rows[i]];
      if (!this.cand || this.cand[0] !== sid) {
        this.cand = [sid, now];
        return fs >= 94 && curFit < 70 ? [sid, line] : null;
      }
      if (now - this.cand[1] >= 800) { this.cand = null; return [sid, line]; }
      return null;
    }
    async loadShabad(num, line) {
      const d = await this.gb.shabadData(num);
      this._load("shabad", d.meta, d.lines, line);
      if (this.finder) this.finder.reset();
    }
    async loadBani(id) { const d = await this.gb.baniData(id); this._load("bani", d.meta, d.lines, null); }
    _load(kind, meta, lines, start) {
      this.kind = kind; this.meta = meta; this.lines = lines; this.linesVersion++;
      this.tracker = new LineTracker(lines, start, this.clock);
      this.marker = this.finalWords.length + this.interim.split(/\s+/).filter(Boolean).length;
      this.blank = false; this.suggestions = [];
      this.onChange();
    }
    go(i) {
      if (!this.tracker || i < 0 || i >= this.lines.length) return;
      this.tracker.current = i; this.tracker.lastMatch = this.clock();
      this.marker = this.finalWords.length + this.interim.split(/\s+/).filter(Boolean).length;
      this.blank = false; this.onChange();
    }
    step(d) { if (this.tracker) this.go(this.tracker.current + d); }
    setMode(m) { this.mode = m; if (this.finder) this.finder.reset(); this.onChange(); }
    clear() { this.tracker = null; this.meta = {}; this.lines = []; this.kind = null; this.linesVersion++; if (this.finder) this.finder.reset(); this.onChange(); }
    currentLine() { return this.blank || !this.tracker ? null : this.lines[this.tracker.current]; }
  }

  const api = { soundKey, cleanAsr, ratio, partialRatio, Gurbani, ShabadFinder, LineTracker, Controller, gurmukhiToSttm, TUNE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.KF = api;
})(typeof self !== "undefined" ? self : this);
