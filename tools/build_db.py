"""One-time setup: download the open Shabad OS Gurbani database and build
gurbani.sqlite (Unicode Gurmukhi + English + Punjabi teeka + transliteration).

Run once:  python build_db.py
"""
import io, os, sqlite3, sys, tarfile, urllib.request

from gurmukhiutils.unicode import unicode as to_unicode
from phonetic import sound_key, first_letters, display_gurmukhi

URL = "https://registry.npmjs.org/@shabados/database/-/database-4.8.7.tgz"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
SRC = os.path.join(HERE, "data", "shabados.sqlite")
OUT = os.path.join(HERE, "data", "gurbani.sqlite")

# English: Dr. Sant Singh Khalsa first (same as your gurdwara's screen)
# Punjabi teeka: Prof. Sahib Singh first, then others for Dasam Granth / Bhai Gurdas etc.


def download():
    os.makedirs(os.path.dirname(SRC), exist_ok=True)
    if os.path.exists(SRC):
        return
    print("Downloading Gurbani database (~40 MB)...")
    try:
        data = urllib.request.urlopen(URL).read()
    except Exception:
        # Mac Python without certificates installed: fall back to the system's curl
        import subprocess
        data = subprocess.run(["curl", "-fsSL", URL], check=True, capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        member = tf.getmember("package/build/database.sqlite")
        with open(SRC, "wb") as f:
            f.write(tf.extractfile(member).read())


def build():
    download()
    src = sqlite3.connect(SRC)
    if os.path.exists(OUT):
        os.remove(OUT)
    out = sqlite3.connect(OUT)
    out.executescript("""
    CREATE TABLE shabads(id TEXT PRIMARY KEY, sttm_id INT, source TEXT, page_label TEXT,
                         writer TEXT, section TEXT, ord INT);
    CREATE TABLE lines(id TEXT PRIMARY KEY, shabad_id TEXT, ord INT, page INT, type INT,
                       gurmukhi TEXT, english TEXT, punjabi TEXT, translit TEXT,
                       sound TEXT, first_letters TEXT, first_letters_ascii TEXT);
    CREATE TABLE banis(id INT PRIMARY KEY, name_pa TEXT, name_en TEXT);
    CREATE TABLE bani_lines(bani_id INT, ord INT, line_id TEXT);
    """)

    sources = {r[0]: r[1] for r in src.execute("select id,name_english from sources")}
    pagelabels = {r[0]: r[1] for r in src.execute("select id,page_name_english from sources")}
    writers = {r[0]: r[1] for r in src.execute("select id,name_english from writers")}
    sections = {r[0]: r[1] for r in src.execute("select id,name_english from sections")}
    out.executemany("insert into shabads values(?,?,?,?,?,?,?)", [
        (sid, sttm, sources[so], pagelabels[so], writers.get(w, ""), sections.get(se, ""), o)
        for sid, sttm, so, w, se, o in src.execute(
            "select id,sttm_id,source_id,writer_id,section_id,order_id from shabads")])

    tr = {}
    for lid, ts, t in src.execute(
            "select line_id,translation_source_id,translation from translations"):
        tr.setdefault(lid, {})[ts] = t
    tl = {lid: t for lid, t in src.execute(
        "select line_id,transliteration from transliterations where language_id=1")}

    rows = []
    for lid, sid, page, typ, g, fl, o in src.execute(
            "select id,shabad_id,source_page,type_id,gurmukhi,first_letters,order_id from lines"):
        uni = to_unicode(g)
        t = tr.get(lid, {})
        english = next((t[k] for k in (1, 7, 10, 12, 14, 16, 18, 20, 22, 9, 2) if k in t), "")
        punjabi = next((t[k] for k in (6, 3, 8, 11, 13, 15, 17, 19, 21, 5) if k in t), "")
        rows.append((lid, sid, o, page, typ, display_gurmukhi(uni), english, punjabi,
                     display_gurmukhi(tl.get(lid, "")), sound_key(uni), first_letters(uni),
                     (fl or "").replace(";", "")))
    out.executemany("insert into lines values(?,?,?,?,?,?,?,?,?,?,?,?)", rows)

    out.executemany("insert into banis values(?,?,?)",
                    [(i, to_unicode(p), e) for i, p, e in
                     src.execute("select id,name_gurmukhi,name_english from banis")])
    out.executemany("insert into bani_lines values(?,?,?)", src.execute(
        "select bl.bani_id, row_number() over (partition by bl.bani_id order by bl.line_group, l.order_id), "
        "bl.line_id from bani_lines bl join lines l on l.id=bl.line_id"))
    out.execute("create index li_sh on lines(shabad_id, ord)")
    out.execute("create index bl_b on bani_lines(bani_id, ord)")
    out.commit()
    src.close()
    os.remove(SRC)   # raw download no longer needed
    print(f"Built {OUT}: {len(rows)} lines")


if __name__ == "__main__":
    build()
