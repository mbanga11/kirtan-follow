# Kirtan Follow

Listens to kirtan and moves the Gurbani slides by itself, like SikhiToTheMax but hands-free.
Runs entirely in the browser: phone, tablet, or laptop. No install.

**Open it:** https://mbanga11.github.io/kirtan-follow/

## Modes

| Mode | What it does |
|---|---|
| **Full Auto** | Works out which shabad is being sung and follows the lines. |
| **Semi** | You pick the shabad (search, a bani, or tap the "Is it this one?" suggestion); it follows the lines. |
| **Manual** | Nothing moves on its own. Tap lines, swipe, or use the arrow keys. |

Lines only change when the app is at least **70% sure** (adjustable in Settings). It combines the shabad's usual order
(next line, back to the rahao, or a repeat) with how well the words just heard fit the start of each line, and keeps
checking after every word. In testing it usually switches 1 to 2 words into a new line.

## Made for sewadars who read English first

- **Search in English letters, any spelling:** `kahu nanak santan`, `mitar pyare nu`, `satnam`, `anand bhaya`. First letters (`knsr`), Gurmukhi, and Ang numbers work too.
- **English letters under every line** in the list (on by default), plus English and Punjabi meanings.
- **Bani buttons in English** (Jap Ji Sahib, Rehras Sahib, Sukhmani Sahib...).
- **A short "How to run it" guide** shows the first time, in plain English.

## At the gurdwara

- **Laptop + projector:** open the site in Chrome, Settings → **Open projector screen**, drag that window onto the projector and press **F**. It mirrors the main page instantly.
- **Phone only:** tap the corner button on the slide for full screen and screen-mirror to the TV.
- **Best accuracy:** feed the device the sound board (aux out) instead of its own mic.
- **Bad wifi:** Settings → **Save all Gurbani on this device**. Speech recognition still needs internet (the browser's own service).
- **Browsers:** Chrome on laptop and Android. Safari on iPhone (it starts on the Hindi recognizer, which the app converts to Gurmukhi).
- **Install as an app:** "Add to Home Screen" (iPhone) or "Install app" (Chrome).

## Backgrounds

20 backgrounds: real photos from Wikimedia Commons (Harmandir Sahib, the Takhts, other gurdwaras, nature), downloaded
during the build with their photographer and license credited in the app, plus drawn ones as a fallback.
"Add your own photo" keeps a picture on that device.

## How it's built

```
site/            the website (published to GitHub Pages)
  index.html     main page: slide, listening, search, banis, settings
  display.html   projector window (follows index.html on the same device)
  engine.js      matching: sound keys, shabad finder, 70%-sure line tracker
  worker.js      runs the engine off the main thread so the page never stutters
  sw.js          offline cache; Gurbani data kept across updates
tools/
  build_db.py    downloads the open Shabad OS Gurbani database
  build_web.py   splits it into small files the browser loads on demand
  fetch_photos.py, build_bg_index.py   background photos + credits
  smoke_test.js  sings a shabad with mistakes; the deploy fails if the slides don't follow
```

Every push to `main` rebuilds the data, runs the smoke test, and publishes the site (Actions tab).

To run it on your own computer: `pip install -r tools/requirements.txt && python tools/build_db.py && python tools/build_web.py && python tools/build_bg_index.py`, then `cd site && python -m http.server` and open http://localhost:8000.

Gurbani text and translations: [Shabad OS database](https://github.com/shabados/database).
