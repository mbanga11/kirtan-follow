"""Builds the phone/web version (a static website) from data/gurbani.sqlite.

    python build_web.py      -> web/  (upload this folder to any HTTPS static host)
"""
import json, os, re, shutil, sqlite3


def roman_key(t):
    """Gurbani in English letters, simplified so typed spellings match:
    'Kahu Naanak' / 'kahu nanak' / 'kahunanak' all become 'kahunanak'.
    Must stay identical to romanKey() in site/engine.js."""
    t = re.sub(r"[^a-z]", "", t.lower())
    for a, b in (("chh", "c"), ("ch", "c"), ("sh", "s"), ("ph", "f"), ("w", "v"), ("z", "j"), ("q", "k"), ("y", "i")):
        t = t.replace(a, b)
    t = re.sub(r"([bdgjktp])h", r"\1", t)
    for a, b in (("ee", "i"), ("oo", "u"), ("ai", "e"), ("au", "o"), ("ou", "o")):
        t = t.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", t)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
DB = os.path.join(HERE, "data", "gurbani.sqlite")
SITE_DATA = os.path.join(HERE, "site", "data")
SHARDS = 400

SOURCES = ["Sri Guru Granth Sahib Ji", "Sri Dasam Granth", "Vaaran Bhai Gurdas Ji",
           "Kabit Savaiye Bhai Gurdas Ji", "Ghazals Bhai Nand Lal Ji", "Zindagi Nama Bhai Nand Lal Ji",
           "Ganj Nama Bhai Nand Lal Ji", "Jot Bigas Bhai Nand Lal Ji", "Ardaas", "Rehitname",
           "Sarabloh Granth", "Uggardanti"]


def main():
    # data lives under a content hash, so phones keep their saved copy across app updates
    import hashlib
    h = hashlib.sha1()
    with open(DB, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    h.update(open(__file__, "rb").read())
    ver = h.hexdigest()[:10]
    global OUT
    OUT = os.path.join(SITE_DATA, ver)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    if os.path.exists(SITE_DATA):
        shutil.rmtree(SITE_DATA)
    os.makedirs(os.path.join(OUT, "s"))
    os.makedirs(os.path.join(OUT, "b"))

    shabads = con.execute("select * from shabads order by ord").fetchall()
    num = {r["id"]: i for i, r in enumerate(shabads)}
    shards = [dict() for _ in range(SHARDS)]
    for r in shabads:
        shards[num[r["id"]] % SHARDS][num[r["id"]]] = {
            "m": [r["source"], r["page_label"], r["writer"], r["section"]], "l": []}

    # sound keys use ~45 Gurmukhi characters; map them to single ASCII chars to keep the file small
    chars = sorted({ch for (k,) in con.execute("select sound from lines") for ch in k} - {" "})
    printable = [chr(c) for c in range(0x21, 0x7F) if chr(c) not in "\t\\\"'"]
    assert len(chars) <= len(printable), len(chars)
    cmap = {ch: printable[i] for i, ch in enumerate(chars)}
    cmap[" "] = " "

    index = []
    line_no = {}
    for r in con.execute("select * from lines order by shabad_id, ord"):
        n = num[r["shabad_id"]]
        lines = shards[n % SHARDS][n]["l"]
        line_no[r["id"]] = (n, len(lines))
        lines.append([r["type"] or 4, r["page"], r["gurmukhi"], r["english"] or "",
                      r["punjabi"] or "", r["translit"] or ""])
        index.append((n, len(lines) - 1, r["type"] or 4, r["page"],
                      (r["first_letters_ascii"] or "").replace("]", "").replace("[", ""),
                      "".join(cmap[ch] for ch in r["sound"]), roman_key(r["translit"] or "")))

    src_of = [SOURCES.index(r["source"]) for r in shabads]
    with open(os.path.join(OUT, "index.txt"), "w", encoding="utf-8") as f:
        for n, i, t, page, fl, key, rk in sorted(index):
            f.write(f"{n}\t{i}\t{t}\t{page}\t{fl}\t{key}\t{rk}\n")
    for k, sh in enumerate(shards):
        with open(os.path.join(OUT, "s", f"{k}.json"), "w", encoding="utf-8") as f:
            json.dump(sh, f, ensure_ascii=False, separators=(",", ":"))

    banis = []
    for b in con.execute("select * from banis order by id"):
        refs = [line_no[lid] for (lid,) in con.execute(
            "select line_id from bani_lines where bani_id=? order by ord", (b["id"],))]
        lines = [shards[n % SHARDS][n]["l"][i] for n, i in refs]
        with open(os.path.join(OUT, "b", f"{b['id']}.json"), "w", encoding="utf-8") as f:
            json.dump({"m": [b["name_en"], b["name_pa"]], "refs": refs, "l": lines}, f,
                      ensure_ascii=False, separators=(",", ":"))
        banis.append([b["id"], b["name_en"], b["name_pa"]])

    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"shards": SHARDS, "sources": SOURCES, "src": src_of, "banis": banis,
                   "cmap": {v: k for k, v in cmap.items() if k != " "}}, f, ensure_ascii=False)
    with open(os.path.join(SITE_DATA, "current.json"), "w") as f:
        json.dump({"v": ver}, f)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fs in os.walk(OUT) for fn in fs)
    print(f"web/data: {len(index)} lines, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
