"""Downloads 20 real, freely licensed photos from Wikimedia Commons to use as
projector backgrounds, with photographer credits.  Run by the start script once;
run again any time to refresh:   python fetch_photos.py
"""
import html, json, os, re, subprocess, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
OUT = os.path.join(HERE, "site", "bg", "photos")
API = "https://commons.wikimedia.org/w/api.php"
UA = "KirtanFollow/1.0 (gurdwara projector app; personal use)"

# (search, how many) -- 20 total
WANT = [
    ("Golden Temple Amritsar night reflection", 3),
    ("Golden Temple Amritsar sunrise", 2),
    ("Harmandir Sahib sarovar", 2),
    ("Golden Temple Amritsar evening", 1),
    ("Akal Takht Amritsar", 1),
    ("Takht Sri Keshgarh Sahib Anandpur", 1),
    ("Hazur Sahib Nanded gurdwara", 1),
    ("Takht Sri Patna Sahib", 1),
    ("Gurdwara Bangla Sahib Delhi", 1),
    ("Hemkund Sahib", 1),
    ("Gurdwara Darbar Sahib Kartarpur", 1),
    ("Gurdwara Sis Ganj Sahib", 1),
    ("Punjab wheat field sunset", 1),
    ("Himalaya mountains sunrise", 1),
    ("Milky Way night sky", 1),
    ("sunset clouds sky", 1),
]
FREE = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? ?[\d.]*)", re.I)
SKIP = re.compile(r"map|logo|drawing|diagram|plan|svg|interior|selfie|panorama", re.I)


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        data = urllib.request.urlopen(req, timeout=40).read()
    except Exception:
        # Mac Python without certificates: use the system curl
        data = subprocess.run(["curl", "-fsSL", "-A", UA, url], check=True, capture_output=True, timeout=60).stdout
    return data if binary else json.loads(data)


def search(q):
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
        "gsrsearch": f"{q} filetype:bitmap", "gsrlimit": "30", "prop": "imageinfo",
        "iiprop": "url|size|extmetadata", "iiurlwidth": "1920",
        "iiextmetadatafilter": "LicenseShortName|Artist",
    }
    data = get(API + "?" + urllib.parse.urlencode(params))
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        w, h = info.get("width", 0), info.get("height", 0)
        if not info.get("thumburl") or w < 1600 or not h or not (1.25 <= w / h <= 2.1):
            continue
        if not FREE.match(lic.strip()) or SKIP.search(p.get("title", "")):
            continue
        artist = html.unescape(re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", ""))).strip()
        yield {"title": p["title"].replace("File:", ""), "thumb": info["thumburl"],
               "source": info.get("descriptionurl", ""), "license": lic, "artist": artist or "Unknown"}


def slug(s):
    s = re.sub(r"\.\w+$", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def main():
    os.makedirs(OUT, exist_ok=True)
    credits, seen, n = {}, set(), 0
    for q, k in WANT:
        got = 0
        try:
            for item in search(q):
                if got >= k:
                    break
                if item["title"] in seen:
                    continue
                n += 1
                fname = f"{n:02d}-{slug(item['title'])}.jpg"
                try:
                    data = get(item["thumb"], binary=True)
                except Exception as e:
                    print(f"  skip {item['title']}: {e}")
                    n -= 1
                    continue
                with open(os.path.join(OUT, fname), "wb") as f:
                    f.write(data)
                seen.add(item["title"])
                credits[fname] = {k2: item[k2] for k2 in ("title", "artist", "license", "source")}
                got += 1
                print(f"  {fname}  ({item['license']}, {item['artist'][:40]})")
        except Exception as e:
            print(f"  search '{q}' failed: {e}")
    if credits:
        with open(os.path.join(OUT, "credits.json"), "w", encoding="utf-8") as f:
            json.dump(credits, f, ensure_ascii=False, indent=1)
    print(f"Downloaded {len(credits)} photos to static/bg/photos")
    return 0 if credits else 1


if __name__ == "__main__":
    sys.exit(main())
