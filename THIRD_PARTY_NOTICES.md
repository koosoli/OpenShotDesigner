# Third-party notices

## ScriptCraft

Screenplay pagination, element flow, draft comparison and the extended writing
tools follow concepts from [ScriptCraft](https://github.com/NoJuanNobody/scriptcraft),
reimplemented in TypeScript. The writing tools were compared with commit
`fce1d3c57a1964742d989d6488df638fc97f089d` (v0.5.0).

ScriptCraft is offered under MIT OR Apache-2.0. The MIT notice is included in
[`licenses/scriptcraft-MIT.txt`](licenses/scriptcraft-MIT.txt). No ScriptCraft
desktop transport, executable or WASM runtime is distributed with this app.

## Courier Badi

The unmodified Regular, Bold, Italic and BoldItalic TrueType files in
`public/fonts/courier-badi/` are from ScriptCraft's pinned source above,
`crates/fonts/fonts/`. Their Git blob hashes were checked against the upstream
tree. The original source is
[Courier Badi v1.010](https://github.com/LaPingvino/courier-badi/releases/tag/v1.010).

Authors: Alan Dague-Greene (Courier Prime for Quote-Unquote Apps), Dmitry
Novikov (Cyrillic), LaPingvino and the Courier Badi contributors.
License: SIL Open Font License 1.1, included alongside the font files as
[`OFL.txt`](public/fonts/courier-badi/OFL.txt). Fonts are served from this app's
own static deployment. PDF exports embed subsets when Unicode text requires it.

Font parsing uses `@pdf-lib/fontkit` under its own bundled MIT license. Other npm
dependencies retain their package licenses. No SCOWL dictionary is bundled.
