# Third-party notices

## nitoyon/pokesleep-tool — `assets/nito.js`, `assets/data.js`, parts of `assets/engine.js`

https://github.com/nitoyon/pokesleep-tool — MIT License, Copyright (c) nitoyon

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Local changes to the bundled data (`assets/nito.js`, `assets/data.js`)

- Gengar: ingredient rate 16.1% → 16.6% (game v3.9.0; the same change nitoyon made on 2026-10-22).
- Misdreavus / Mismagius (released 2026-10-26): help time, ingredient and skill rates, carry limit and ingredients,
  and Mismagius's main skill Mystical Fire (Cooking Advance S: max level 7, pot +7–31, great success +1–5%,
  SP skill value 1144–7596) replace the placeholders in nitoyon's data.

## RaenonX Pokémon Sleep tools — data for Misdreavus, Mismagius and Mystical Fire

Source: RaenonX ポケスリ攻略ツール, https://pks.raenonx.cc/ (pokedex #200 and #429, main skill #41).
The ingredient and skill rates were worked out by RaenonX's SP research team from collected individuals; credited
here and in the app as the site asks (https://pks.raenonx.cc/docs/view/site/credits). These values are used only
until the bundled nitoyon data has them.

## Tesseract.js 5.1.1 — `vendor/tesseract/tesseract.min.js`, `vendor/tesseract/worker.min.js`

https://github.com/naptha/tesseract.js — Apache License 2.0 (see `vendor/tesseract/LICENSE.tesseract.js.md`).
Bundles regenerator-runtime (MIT, Copyright (c) 2014-present, Facebook, Inc.).

## tesseract.js-core 5.1.1 — `vendor/tesseract/tesseract-core-*.wasm.js`

https://github.com/naptha/tesseract.js-core — Apache License 2.0 (see `vendor/tesseract/LICENSE.tesseract.js-core.txt`).
Built from Tesseract OCR (https://github.com/tesseract-ocr/tesseract, Apache License 2.0).

## Japanese model — `vendor/tessdata/jpn.traineddata.gz`

From the npm package @tesseract.js-data/jpn 1.0.0 (4.0.0_best_int), derived from tesseract-ocr/tessdata_best
(https://github.com/tesseract-ocr/tessdata_best, Apache License 2.0).

## Fonts

Zen Maru Gothic and Zen Kaku Gothic New are loaded from Google Fonts (SIL Open Font License 1.1).

The count-badge digit bitmaps in `assets/ing-icons.js` (x and 0-9, 4-bit, 24 px) were rendered from Montserrat Bold
(https://github.com/JulietaUla/Montserrat — SIL Open Font License 1.1, Copyright 2011 The Montserrat Project Authors);
the font itself is not included.
