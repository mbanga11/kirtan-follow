"""Turn Gurmukhi (from the database or from speech recognition) into a
"sound key" so sung words match the written Gurbani even when spelling differs.

Speech recognition writes modern Punjabi spelling of what it hears. Gurbani is
written with silent word-final matras, nasal marks, and vowel lengths that
singers stretch, so we compare on a simplified sound skeleton instead of text.
"""
import re

VISHRAAM = re.compile(r"[.;,]")
NON_GURMUKHI = re.compile(r"[^਀-੿ ]")
DIGITS_AND_DANDAS = re.compile(r"[੦-੯।॥]")

# independent vowels -> carrier + sign (so "ਆ" and "ਾ" compare the same)
INDEPENDENT = {
    "ਆ": "ਅਾ", "ਇ": "ਅਿ", "ਈ": "ਅਿ", "ਉ": "ਅੁ", "ਊ": "ਅੁ",
    "ਏ": "ਅੇ", "ਐ": "ਅੇ", "ਓ": "ਅੋ", "ਔ": "ਅੋ", "ੲ": "ਅ", "ੳ": "ਅ",
}
FOLD = {
    "ੀ": "ਿ", "ੂ": "ੁ", "ੈ": "ੇ", "ੌ": "ੋ",          # vowel length (singers stretch these)
    "ਣ": "ਨ", "ਙ": "ਨ", "ਞ": "ਨ",                    # nasal consonants
    "\u0A36": "ਸ", "\u0A5B": "ਜ", "\u0A5E": "ਫ", "\u0A59": "ਖ", "\u0A5A": "ਗ", "\u0A33": "ਲ",
    "ੰ": "", "ਂ": "", "ੱ": "", "਼": "", "ੑ": "", "ੵ": "",  # tippi, bindi, addak, nukta, udaat, yakash
    "ੴ": "ਇਕੋਕਾਰ",
}
SUBJOINED = re.compile("੍")  # virama: ਪ੍ਰ -> ਪਰ, ਨ੍ਹ -> ਨਹ


def sound_key(text: str) -> str:
    t = VISHRAAM.sub(" ", text)
    t = DIGITS_AND_DANDAS.sub(" ", t)
    t = t.replace("ਰਹਾਉ", " ")
    for k, v in FOLD.items():
        t = t.replace(k, v)
    t = SUBJOINED.sub("", t)
    t = NON_GURMUKHI.sub(" ", t)
    words = []
    for w in t.split():
        # word-final aunkar / sihari on a consonant are silent ("ਰਸੁ" is sung "ਰਸ")
        if len(w) > 1 and w[-1] in "ੁਿ" and "\u0A15" <= w[-2] <= "\u0A5E":
            w = w[:-1]
        w = "".join(INDEPENDENT.get(ch, ch) for ch in w)
        if w:
            words.append(w)
    return " ".join(words)


def first_letters(text: str) -> str:
    """First letter of each word, like SikhiToTheMax search (ਕਨਸਰਆਹਜਚਗਮ)."""
    t = VISHRAAM.sub(" ", text)
    t = DIGITS_AND_DANDAS.sub(" ", t)
    out = []
    for w in t.split():
        ch = w[0]
        if "ਅ" <= ch <= "ਔ":   # independent vowels collapse to their carrier
            ch = {"ਆ": "ਅ", "ਐ": "ਅ", "ਔ": "ਅ", "ਇ": "ੲ", "ਈ": "ੲ", "ਏ": "ੲ",
                  "ਉ": "ੳ", "ਊ": "ੳ", "ਓ": "ੳ"}.get(ch, ch)
        if "਀" <= ch <= "੿":
            out.append(ch)
    return "".join(out)


def display_gurmukhi(text: str) -> str:
    """Strip vishraam punctuation for the projector."""
    return re.sub(r"\s+", " ", VISHRAAM.sub("", text)).strip()
