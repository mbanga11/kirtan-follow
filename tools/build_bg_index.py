"""Writes site/bg/index.json: the backgrounds the app offers (photos first, then the drawn ones)."""
import json, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(HERE, "site", "bg")
IMG = (".jpg", ".jpeg", ".png", ".webp")
BASIC = ("01-sttm-blue.jpg", "07-black.jpg")


def main():
    out = []
    photos_dir = os.path.join(BG, "photos")
    credits = {}
    try:
        with open(os.path.join(photos_dir, "credits.json"), encoding="utf-8") as f:
            credits = json.load(f)
    except Exception:
        pass
    photos = sorted(f for f in os.listdir(photos_dir) if f.lower().endswith(IMG)) if os.path.isdir(photos_dir) else []
    for f in photos:
        c = credits.get(f, {})
        out.append({"file": "photos/" + f, "credit": " · ".join(x for x in (c.get("title", ""), c.get("artist", ""), c.get("license", "")) if x)})
    for f in sorted(os.listdir(os.path.join(BG, "art"))):
        if f.lower().endswith(IMG) and (f in BASIC or not photos):
            out.append({"file": "art/" + f})
    with open(os.path.join(BG, "index.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"bg/index.json: {len(photos)} photos, {len(out) - len(photos)} drawn")


if __name__ == "__main__":
    main()
