# Smoke test — everything built on 2026-08-24

Thirteen commits. Everything below is either new or changed behaviour you
already had. Ordered by **what breaks worst if it is broken**, not by what was
built first — so if you only get through half, the top half is the half worth
doing.

Two things need a browser that is not Chrome. They are marked **[FIREFOX]** and
they are the only checks nobody has been able to run yet.

---

## 1. Downloads — the money path

Nine export buttons were rewritten onto one shared helper, and three of them
were **silently broken in Firefox** before this. Everything here is quick.

### [FIREFOX] The one check nobody has run

- [ ] Open the app **in Firefox**, click any export, and confirm **a file
      actually arrives**

That is the whole test. Before this pass, three of these downloaded nothing at
all in Firefox — no error, no file, the button simply did nothing. The fix is
tested and structurally shared, but "cannot regress" is not the same as
"works", and Firefox is the browser that made the difference.

### Filenames

Rename a production to something awkward — `Ocean's 11: Director/Draft "2"` is
the case that used to break — then export and check what lands in Downloads.

- [ ] Project JSON backup (top bar) — **was broken**, produced a name with `/`,
      `:` and `"` in it
- [ ] Project package (dashboard) — **was broken**
- [ ] JSON backup from the dashboard — **was broken**
- [ ] Fountain screenplay (Script tab) — **was broken**
- [ ] Shot list, equipment manifest, budget, contacts, AV script — should all
      be clean too
- [ ] Now blank the title entirely and export: the file should still have a
      usable name, never start with `_`, and never be `Budget_.csv`

### Encoding — open these in Excel, not a text editor

The point is the accented characters, so put an `é`, `ö` or `€` in the data
first.

- [ ] **Contacts CSV** — the important one. **Was broken**: this is the export
      that is entirely people's names, and every accent came out as mojibake
- [ ] Shot list CSV — **was broken**, same reason
- [ ] Budget CSV — check the `€` column
- [ ] Equipment manifest, AV script CSV

### And the two that must NOT have a byte-order mark

Opposite rule: these are read by other software, which breaks *because* of a
BOM. Both are covered by tests, so this is confirmation rather than discovery.

- [ ] **Resolve CSV** — import into DaVinci Resolve and confirm the metadata
      actually lands on the clips. A BOM here makes Resolve report a successful
      import that populated nothing
- [ ] **[UNVERIFIED] Avid ALE** — import into Media Composer. This has never
      been tested against real Avid; the bytes match the spec and that is all
      anyone can say so far
- [ ] Project JSON — reopen it via Import and confirm it loads

---

## 2. Defaults that changed today

You will notice these immediately, and they are meant to be noticed.

- [ ] **Coverage warnings are gone from the shot list** — that is correct now
- [ ] **Schedule health is gone from the stripboard** — also correct
- [ ] Turn both on: **Viewing Options → Show Planning Warnings**. Both should
      come back
- [ ] Reload — the setting should stick
- [ ] **Reusable Assemblies** (Inspector) now starts **collapsed**. Expand it,
      confirm search and insert still work

Not gated, on purpose: **continuity conflicts** in the binder. Those compare
notes you actually recorded against each other, so they report a contradiction
in your own data rather than advice about the plan — and they are inside a tab
you opened deliberately. Easy to put under the same switch if you disagree.

---

## 3. Workspace chrome moved to its own context

Structural, no visible change intended — which is exactly why it is worth a
pass. If something here is broken it will be obvious.

- [ ] Theme toggle works, and **survives a reload**
- [ ] Every right-hand tab opens: shots, storyboard, script, equipment,
      schedule, moodboard, locations, power, logistics, run of show,
      continuity, rigging, contacts, tasks, budget, inspector
- [ ] **Select something on the canvas → the Inspector tab opens.** This one
      now crosses a provider boundary, so it is the most likely thing to have
      broken
- [ ] **While reading the lined script, select something on the canvas — the
      script must NOT be yanked away.** Same for storyboard and equipment
- [ ] Quick Search (Shift+Space) opens and closes
- [ ] Export & Print Studio opens, remembers its last section when reopened
- [ ] Project dashboard opens and closes
- [ ] Viewfinder still opens on a camera

---

## 4. Features built earlier in the session

These are new. Everything above was a fix or a default; this is the new
surface.

### The production loop

- [ ] **End-of-day production report** — log some takes, then print it. Pages
      shot vs scheduled, shots remaining, ahead/behind per setup
- [ ] **Camera report** — clip and roll names should match the continuity log
- [ ] **Sound report** — sound roll, MOS and wild-track flags
- [ ] **ALE export** — sits beside the Resolve CSV in the continuity tab

### Continuity binder (the unbuilt half of §36)

- [ ] Per-scene, per-character wardrobe / hair / make-up / props notes
- [ ] Attach a photo to a continuity note
- [ ] Notes link to the right cast member and setup
- [ ] Enter two contradictory notes for one character on one script day — the
      conflict list should catch it

### Planning intelligence (remember: switch the warnings on first)

- [ ] **Coverage checker** — build a scene with no wide, and one where a
      character is never framed alone. Both should be reported
- [ ] It should say *what it checked* when it finds nothing, not show a green
      tick
- [ ] **Schedule health** — same cast at two distant locations in one day, too
      many company moves, an early call after a late wrap
- [ ] **Golden hour** — set an exterior scene, check the magic-hour marker and
      the time-of-day scrubber, and confirm it reaches the call sheet
- [ ] Change the production's **time zone** and confirm sun times move with it

---

## 5. Known gaps — not worth testing, already known

- **Avid ALE** has never been checked against real Media Composer
- **`ContactsPanel` editing** (draft / save / delete) has no test coverage
- **Entry chunk is 876 kB** — assessed, not fixed
- **Nothing tests rendering or layout** — that a print view lays out correctly
  on paper is still checked only by eye
