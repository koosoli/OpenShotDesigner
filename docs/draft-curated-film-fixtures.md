# DRAFT — curated film-fixture specs (UNVERIFIED, not wired into the app)

**Provenance warning — read before using any number here.**

This table was written from an AI assistant's recollection of published
manufacturer specifications on 2026-08-22. It was **not** transcribed from
fetched datasheets, and no figure here has been checked against a primary
source. Some values are probably correct; some are certainly wrong or refer to
a different hardware revision of the same model name.

It is kept only as a starting point in case we later want to fill the gaps
Open Fixture Library leaves in film/TV gear (Aputure, Nanlite, Creamsource,
tungsten fresnels, HMIs). **Nothing in the application imports this file.**

Before any of it ships:

1. Replace each row with values transcribed from the manufacturer's current
   datasheet, and record the datasheet URL + revision per row.
2. Keep rule 13/28: a field exists only when the datasheet states it; never
   infer watts from a model name.
3. Re-check every entry against the live OFL snapshot first — if OFL has the
   model, use OFL and drop the row (`catalogMerge.ts` already prefers OFL).
4. Mark the source provider as `curated` so the merge precedence
   (OFL > curated > manual) applies.

| Manufacturer | Model | Categories | Power (W) | Weight (kg) | Dimensions H×W×D (mm) | CCT (K) | Beam (°) | Modes (name = channels) |
|---|---|---|---|---|---|---|---|---|
| Aputure | LS 600c Pro | LED, RGBWW | 720 | 6.2 | — | 2300–10000 | — | CCT 8-bit=4, HSI=5, RGBWW=7, Effects=8 |
| Aputure | LS 300d II | LED, daylight | 350 | 3.7 | — | 5500 | — | 8-bit=1, 16-bit=2 |
| Aputure | Nova P600c | LED panel, RGBWW | 720 | 11.3 | — | 2000–10000 | — | CCT=4, HSI=5, RGBWW=7, Effects=8 |
| Aputure | Electro Storm CS15 | LED, RGBWW | 1800 | 17.8 | — | 2500–10000 | — | — |
| Aputure | Electro Storm XT26 | LED, bi-color | 2600 | 19.4 | — | 2500–10000 | — | — |
| Aputure | Amaran 200d | LED, daylight | 200 | 2.1 | — | 5600 | — | — |
| Aputure | Amaran 200x | LED, bi-color | 200 | 2.1 | — | 2700–6500 | — | — |
| Nanlite | Forza 720B | LED, bi-color | 800 | 6.0 | — | 2700–6500 | — | CCT 8-bit=2, CCT 16-bit=4 |
| Nanlite | Forza 500 | LED, daylight | 520 | 3.9 | — | 5600 | — | 8-bit=1, 16-bit=2 |
| Nanlite | Forza 300B | LED, bi-color | 350 | 3.3 | — | 2700–6500 | — | CCT 8-bit=2, CCT 16-bit=4 |
| Nanlite | Forza 60 | LED, daylight | 72 | 0.9 | — | 5600 | — | — |
| Nanlite | PavoTube II 30X | LED tube, RGBWW | 58 | 1.2 | 1196×50×50 | 2700–12000 | — | CCT=3, HSI=5, RGBWW=7 |
| Nanlite | PavoTube II 15X | LED tube, RGBWW | 32 | 0.7 | 616×50×50 | 2700–12000 | — | CCT=3, HSI=5, RGBWW=7 |
| Nanlite | Compac 200 | LED panel, daylight | 200 | 5.5 | — | 5600 | — | — |
| Creamsource | Vortex8 | LED panel, RGBW | 650 | 11.8 | 300×600×120 | 2200–15000 | — | CCT=5, HSI=6, RGBW=8, Effects=12 |
| Creamsource | Vortex4 | LED panel, RGBW | 325 | 6.4 | 300×300×120 | 2200–15000 | — | CCT=5, HSI=6, RGBW=8, Effects=12 |
| Creamsource | Micro Colour | LED panel, RGBW | 120 | 2.2 | — | 2200–15000 | — | — |
| Litepanels | Gemini 2x1 Soft RGBWW | LED panel, RGBWW | 325 | 9.0 | 376×703×107 | 2700–10000 | — | CCT=5, HSI=6, RGBW=8 |
| Litepanels | Gemini 1x1 Soft RGBWW | LED panel, RGBWW | 200 | 5.2 | — | 2700–10000 | — | CCT=5, HSI=6, RGBW=8 |
| Kino Flo | Diva-Lite 400 | Fluorescent | 220 | 5.4 | — | 3200–5500 | — | — |
| Kino Flo | Celeb 850 LED DMX | LED panel | 880 | 19.0 | — | 2500–9900 | — | — |
| Kino Flo | Freestyle 31 LED | LED panel | 150 | 6.0 | — | 2500–9900 | — | — |
| ARRI | Orbiter | LED, RGBACL | 500 | 10.5 | — | 2000–20000 | — | CCT=6, HSI=7, RGBW=8 |
| ARRI | M18 | HMI, daylight | 1800 | 8.8 | — | 6000 | 20–60 | — |
| ARRI | M40 | HMI, daylight | 4000 | 18.3 | — | 6000 | 18–52 | — |
| ARRI | M8 | HMI, daylight | 800 | 6.9 | — | 6000 | 18–55 | — |
| ARRI | 300 Plus | Tungsten fresnel | 300 | 2.7 | — | 3200 | 11–54 | — |
| ARRI | 650 Plus | Tungsten fresnel | 650 | 3.7 | — | 3200 | 11–53 | — |
| ARRI | 1000 Plus | Tungsten fresnel | 1000 | 6.4 | — | 3200 | 11–51 | — |
| ARRI | T2 | Tungsten fresnel | 2000 | 8.5 | — | 3200 | 12–52 | — |
| ARRI | T5 | Tungsten fresnel | 5000 | 17.5 | — | 3200 | 11–52 | — |
| Mole-Richardson | 1K Baby Solarspot | Tungsten fresnel | 1000 | 6.8 | — | 3200 | — | — |
| Mole-Richardson | 2K Junior Solarspot | Tungsten fresnel | 2000 | 11.3 | — | 3200 | — | — |
| Mole-Richardson | 5K Senior Solarspot | Tungsten fresnel | 5000 | 20.4 | — | 3200 | — | — |
| Mole-Richardson | 10K Tener Solarspot | Tungsten fresnel | 10000 | 43.1 | — | 3200 | — | — |
| Mole-Richardson | 650W Tweenie Solarspot | Tungsten fresnel | 650 | 3.6 | — | 3200 | — | — |
| ETC | Source Four 750 W | Ellipsoidal, tungsten | 750 | 7.3 | — | 3250 | — | — |
| Godox | VL300 | LED, daylight | 300 | 3.4 | — | 5600 | — | — |
| Godox | SL-60W | LED, daylight | 60 | 1.7 | — | 5600 | — | — |
| Godox | M600D | LED, daylight | 740 | 6.6 | — | 5600 | — | — |
| Dedolight | DLH4 | Tungsten | 150 | 0.9 | — | 3200 | — | — |
| Quasar Science | Rainbow 2 4ft | LED tube, RGBX | 100 | 1.4 | 1219×43×43 | 1000–10000 | — | CCT=4, HSI=6, RGBX=8, Pixel 8-bit=24 |
| Quasar Science | Double Rainbow 4ft | LED tube, RGBX | 200 | 2.7 | 1219×76×43 | 1000–10000 | — | CCT=4, HSI=6, RGBX=8, Pixel 8-bit=48 |

Models dropped from this draft because OFL already carries them: ARRI SkyPanel
S30-C/S60-C/S120-C/S360-C, ARRI L5-C/L7-C/L10-C, Aputure LS 600d/LS 600d Pro/
LS 600x Pro/LS 1200d Pro/LS 300x/Nova P300c, Astera Titan/Helios/Hyperion/NYX/
AX3, Kino Flo Celeb 250/450/201, Dedolight DLED4-BI/DLED7-BI, ETC Source Four
LED series.
