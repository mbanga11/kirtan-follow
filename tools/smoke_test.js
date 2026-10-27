// Quick end-to-end check run on every deploy: loads the built data, "sings" a shabad
// with recognition-style mistakes, and fails the build if the slides don't follow.
const KF = require("../site/engine.js");
const fs = require("fs"), path = require("path");
const site = path.join(__dirname, "..", "site");
(async () => {
  const v = JSON.parse(fs.readFileSync(path.join(site, "data", "current.json"))).v;
  const base = path.join(site, "data", v) + "/";
  const gb = new KF.Gurbani(base, async p => fs.readFileSync(p, "utf8"));
  const t0 = Date.now(); await gb.load();
  console.log(`loaded ${gb.count} lines in ${Date.now() - t0} ms`);
  const hit = gb.search("knsrAh")[0];
  if (hit === undefined) throw new Error("search failed");
  let clock = 1e9;
  const c = new KF.Controller(gb, { clock: () => clock });
  // Semi: shabad known, follow the lines
  await c.loadShabad(gb.shabad[hit], 2);
  const sung = [[3, "ਐਸੇ ਗੁਰ ਕੋ ਬਲ ਬਲ ਜਾਈਏ ਆਪ ਮੁਕਤ ਮੋਹੇ ਤਾਰੇ"], [4, "ਕਵਨ ਕਵਨ ਕਵਨ ਗੁਨ ਕਹੀਏ ਅੰਤ ਨਹੀ ਕਛ ਪਾਰੇ"],
                [5, "ਲਾਖ ਲਾਖ ਲਾਖ ਕਈ ਕੋਰੇ ਕੋ ਹੈ ਐਸੋ ਬੀਚਾਰੇ"], [3, "ਐਸੇ ਗੁਰ ਕਉ ਬਲਿ ਬਲਿ ਜਾਈਐ"],
                [6, "ਬਿਸਮ ਬਿਸਮ ਬਿਸਮ ਹੀ ਭਈ ਹੈ ਲਾਲ ਗੁਲਾਲ ਰੰਗਾਰੇ"], [7, "ਕਹੁ ਨਾਨਕ ਸੰਤਨ ਰਸ ਆਈ ਹੈ ਜਿਓ ਚਾਖ ਗੂੰਗਾ ਮੁਸਕਾਰੇ"]];
  for (const [want, text] of sung) {
    let utter = "", at = null;
    for (const [k, w] of text.split(" ").entries()) {
      utter += w + " "; clock += 600; await c.feed(utter, false);
      if (at === null && c.tracker.current === want) at = k + 1;
    }
    await c.feed(utter, true);
    if (at === null) throw new Error(`line ${want} never shown for "${text}"`);
    console.log(`line ${want} shown after ${at} word(s)`);
  }
  // Full Auto: find the shabad from words alone
  const a = new KF.Controller(gb, { clock: () => clock }); a.setMode("auto"); a.ensureFinder();
  let utter = "";
  for (const w of "ਕਹੁ ਨਾਨਕ ਸੰਤਨ ਰਸ ਆਈ ਹੈ ਜਿਓ ਚਾਖ ਗੂੰਗਾ ਮੁਸਕਾਰੇ".split(" ")) { utter += w + " "; clock += 600; await a.feed(utter, false); }
  if (a.meta.num !== gb.shabad[hit]) throw new Error("Full Auto did not find the shabad");
  console.log("Full Auto found the shabad");
  console.log("smoke test passed");
})().catch(e => { console.error("SMOKE TEST FAILED:", e.message); process.exit(1); });
