/* Runs all the matching off the main thread so the page never stutters.
   Messages in:  init, heard, mode, load, bani, go, step, blank, clear, search, sure, finder
   Messages out: progress, ready, state, search, error */
importScripts("engine.js?v=__BUILD__");

let gb, ctl, busy = false, pending = false, lastLinesVersion = -1;

async function fetchText(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  if (!onProgress || !r.body) return r.text();
  const total = +r.headers.get("content-length") || 0, reader = r.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onProgress(got, total);
  }
  const buf = new Uint8Array(got); let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return new TextDecoder().decode(buf);
}

// retry a few times: gurdwara wifi drops
async function fetchRetry(url, onProgress) {
  let err;
  for (let i = 0; i < 4; i++) {
    try { return await fetchText(url, onProgress); } catch (e) { err = e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
  throw err;
}

async function preview(num, i) {
  try { const sh = await gb.shard(num); const l = sh.l[i]; return l ? [l[2], l[5]] : ["", ""]; } catch (e) { return ["", ""]; }
}

async function postState() {
  const t = ctl.tracker;
  const msg = {
    t: "state", mode: ctl.mode, kind: ctl.kind, meta: ctl.meta, blank: ctl.blank,
    current: t ? t.current : null, confidence: t ? Math.round(t.confidence * 100) : null,
    heard: ctl.heard, linesVersion: ctl.linesVersion, finderReady: !!ctl.finder,
  };
  if (ctl.linesVersion !== lastLinesVersion) {
    msg.lines = ctl.lines.map(l => ({ type: l.type, page: l.page, gurmukhi: l.gurmukhi, english: l.english,
      punjabi: l.punjabi, translit: l.translit, ref: l.ref }));
    lastLinesVersion = ctl.linesVersion;
  }
  msg.suggestions = await Promise.all(ctl.suggestions.filter(s => s.v >= 0.4 && s.line != null)
    .map(async s => { const [text, roman] = await preview(s.sid, s.line); return { sid: s.sid, line: s.line, v: s.v, text, roman }; }));
  postMessage(msg);
}

// process at most one update at a time; if speech arrives mid-update, run once more after
async function run() {
  if (busy) { pending = true; return; }
  busy = true;
  try {
    do { pending = false; await ctl.process(); } while (pending);
  } catch (e) { postMessage({ t: "error", message: String(e) }); }
  busy = false;
  postState();
}

function buildFinder() {
  if (ctl.finder) return;
  const t0 = Date.now();
  ctl.ensureFinder();
  postMessage({ t: "finder", ms: Date.now() - t0 });
}

onmessage = async ({ data: m }) => {
  try {
    switch (m.t) {
      case "init": {
        gb = new KF.Gurbani(m.base, fetchRetry);
        await gb.load((got, total) => postMessage({ t: "progress", got, total }));
        ctl = new KF.Controller(gb);
        ctl.mode = m.mode || "semi";
        if (m.sure) KF.TUNE.switchConfidence = m.sure / 100;
        postMessage({ t: "ready", banis: gb.meta.banis, sources: gb.meta.sources });
        postState();
        if (ctl.mode === "auto") setTimeout(() => { buildFinder(); postState(); }, 0);
        break;
      }
      case "finder": buildFinder(); postState(); break;
      case "heard": ctl.ingest(m.text, m.final); run(); break;
      case "mode": ctl.setMode(m.mode); if (m.mode === "auto") buildFinder(); postState(); break;
      case "load": await ctl.loadShabad(m.num, m.line); postState(); break;
      case "bani": await ctl.loadBani(m.id); postState(); break;
      case "go": ctl.go(m.i); postState(); break;
      case "step": ctl.step(m.d); postState(); break;
      case "blank": ctl.blank = m.on; postState(); break;
      case "clear": ctl.clear(); postState(); break;
      case "sure": KF.TUNE.switchConfidence = Math.max(0.5, Math.min(0.95, m.v / 100)); break;
      case "search": {
        const rows = gb.search(m.q);
        const out = await Promise.all(rows.map(async k => {
          const num = gb.shabad[k], i = gb.idx[k];
          const sh = await gb.shard(num);
          const l = sh.l[i];
          return { num, i, gurmukhi: l[2], translit: l[5], source: sh.m[0], label: sh.m[1], page: l[1] };
        }));
        postMessage({ t: "search", id: m.id, rows: out });
        break;
      }
      case "warm": {   // download every shabad so it all works on bad wifi
        const n = gb.meta.shards; let done = 0;
        const ids = [...Array(n).keys()];
        const workers = Array.from({ length: 6 }, async () => {
          while (ids.length) {
            const s = ids.shift();
            try { await fetch(`${m.base}s/${s}.json`); } catch (e) {}
            done++; if (done % 20 === 0 || done === n) postMessage({ t: "warm", done, total: n });
          }
        });
        for (const b of gb.meta.banis) { try { await fetch(`${m.base}b/${b[0]}.json`); } catch (e) {} }
        await Promise.all(workers);
        break;
      }
    }
  } catch (e) {
    postMessage({ t: "error", message: String(e && e.message || e) });
  }
};
