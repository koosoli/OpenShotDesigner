# ScriptCraft-Schreibfunktionen: Umsetzung und Anleitung

30.10.2026 · lokaler Arbeitsstand, Projektschema **v38** · ergänzt den
[ursprünglichen Vergleich](scriptcraft-port-audit-2026-10-30.md).

## Jetzt umgesetzt

Die zuletzt empfohlenen Kernfunktionen wurden als TypeScript-Funktionen in
OpenShotDesigner eingebaut. ScriptCrafts Desktop-Anwendung und Netzwerktransport
werden nicht geladen oder ausgeführt.

| Funktion | Verhalten |
| --- | --- |
| Fett, kursiv, unterstrichen | Formatbereiche im Drehbuchmodell, Tastaturkürzel und Werkzeugleiste, formatierte Textfelder/Vorschau, FDX-/Fountain-Roundtrip sowie Drehbuch- und Sides-PDF. |
| Unicode-PDF | Bei Bedarf eingebettete Courier-Badi-Schriften für unter anderem Kyrillisch und Griechisch. Text bleibt im PDF auswählbar. Unbekannte Glyphen führen zu einer Fehlermeldung statt zu stillen `?`-Ersetzungen im Drehbuchtext. |
| Suchen/Ersetzen | Literal-Suche über alle sichtbaren Drehbuchabsätze, Groß-/Kleinschreibung, vor/zurück und einzelne/alle Treffer ersetzen. „Alle ersetzen“ ist eine Projektänderung und mit einem Undo rückgängig zu machen. |
| ScriptNotes | Notizen am Absatz bzw. ausgewählten Textbereich, Autor und Farbe, Bearbeiten/Löschen und Sprung zum Anker. Bereiche folgen Textänderungen. Notizen werden nicht als Drehbuchtext gedruckt. |
| Lesezeichen | Benannte Absatz-Lesezeichen und ein gemeinsamer Navigator für Lesezeichen und Notizen. |
| Dialogalternativen | Alternative Fassungen speichern, bearbeiten, löschen und mit der aktiven Zeile tauschen. Die Absatz-ID bleibt gleich; die bisher aktive, formatierte Fassung bleibt als Alternative erhalten. Nur die aktive Fassung druckt. |
| Akte/Sequenzen und Szenenkarten | Nicht druckende Strukturpunkte mit drei Ebenen, FDX-/Fountain-Import und Export, Szenensynopsen und Verschieben ganzer Szenenblöcke. Alle vorhandenen Zeilen-IDs bleiben erhalten. Vor dem Verschieben müssen gesperrte Seiten entsperrt werden. |

Alte Projekte werden durch die Migration v37 → v38 unverändert übernommen.
Die neuen Felder sind optional. Bestehende einfache `note`-Zeilen werden nicht
automatisch umgedeutet oder gelöscht. Shot-, Lining- und Szenenbezüge verwenden
weiterhin ihre bisherigen IDs.

Die größeren optionalen Punkte des Vergleichs sind damit nicht automatisch
erledigt: Autoren-Track-Changes mit Accept/Reject, ein freies Beat Board/Story Map,
Vorlesen, Diktat, eigene Wörterbücher, freie Elementvorlagen und gemeinsame
Drehbuchbearbeitung wurden in diesem Schritt nicht implementiert. Der aktuelle
Multiplayer teilt weiterhin einen Plan samt Shots und kein Drehbuch.

## Was muss ich klicken?

1. **Script → Screenplay → Writing tools** öffnen.
2. Einen Absatz im Drehbuch anklicken. Die Werkzeuge zeigen dessen Nummer und
   Text. Zum Formatieren Wörter markieren und **Bold / Italic / Underline**
   wählen; alternativ im Textfeld **Ctrl/⌘+B**, **Ctrl/⌘+I**, **Ctrl/⌘+U** drücken.
3. Unter **Find** suchen, mit **Go to match**, **Previous match** und **Next match**
   springen. Unter **Replace** den Ersatztext eingeben und **Replace match** oder
   **Replace all** wählen. Es werden keine regulären Ausdrücke ausgeführt.
4. Für Notizen Text markieren oder den ganzen Absatz wählen. **New note text**,
   optional **Note author** und Farbe ausfüllen, dann **Add note**. **Show anchor**
   springt zum zugehörigen Bereich. Das Feld **Bookmark** setzt ein Lesezeichen;
   Verlassen des Feldes übernimmt den Namen. Der aufklappbare Navigator zeigt
   vorhandene Lesezeichen und Absätze mit Notizen.
5. Einen Dialogabsatz anklicken. Unter **Dialogue alternatives** eine Variante
   schreiben und **Save alternative** wählen. **Use alternative** tauscht sie mit
   dem aktiven Text; die vorige Fassung bleibt gespeichert.
6. Eine Szenenüberschrift anklicken. Unter **Structure before this scene**
   **Act**, **Sequence** oder **Section**, einen Titel und **Add structure point**
   wählen. Unter **Scene cards and outline** lassen sich Synopsen bearbeiten und
   ganze Szenen nach oben/unten verschieben. Die Drehreihenfolge auf dem
   Stripboard ist davon unabhängig.

**Final Draft** und **Fountain** exportieren das Drehbuch. Der PDF-Knopf öffnet
das Exportstudio; dort **Download PDF** wählen. Projektdateien speichern sämtliche
Metadaten. Vor einem Neuladen auf **Saved locally** warten: Der Download einer
Projektdatei und die automatische Speicherung im Browser sind getrennte Vorgänge.

## Dateiformate und Grenzen

FDX-Stil-Runs, Notizen, Lesezeichen und Outline-Absätze werden gelesen und
geschrieben. Dialogalternativen verwenden die im ScriptCraft-Audit beschriebene
`ScriptCraftAlternate`-Erweiterung. Die Notizreichweite `Range` ist ebenfalls
eine Erweiterung. Das ist kein Nachweis, dass Final Draft selbst alle diese
Erweiterungen übernimmt. Die native Projektdatei bleibt das vollständige Format.

Fountain verwendet normale Hervorhebungsmarker und `#`-/`##`-/`###`-Abschnitte.
Für Notizmetadaten, Lesezeichen und Alternativen gibt es nicht druckende
`[[OSD-META:v1:…]]`-Kommentare mit begrenztem, validiertem JSON in Base64. Andere
Fountain-Programme können diese Kommentare ignorieren; eine verlustfreie
Weitergabe dieser Zusatzdaten an fremde Programme wird nicht versprochen.

Die Schriftdateien werden vom eigenen statischen Deployment geladen, ohne
Font-CDN oder zusätzliches Konto. Bereits geladene Ressourcen können über den
vorhandenen Service Worker offline verfügbar sein. Ein erstmaliger Offline-Export
kann fehlende Ressourcen nicht nachladen und meldet das. Courier Badi unterstützt
nicht jede Unicode-Schrift und ersetzt keine Layout-Engine für komplexe
Schriftsysteme. Unbekannte Zeichen werden im Drehbuch-/Sides-Export ausdrücklich
abgewiesen. Andere bestehende PDF-Berichtsfamilien behalten ihre bisherige
WinAnsi-Textpolitik.

Pro Absatz gelten unter anderem höchstens 2.048 Formatbereiche, 64 Notizen mit
je 8.192 Zeichen, 16 Alternativen mit je 65.536 Zeichen und 16 Strukturpunkte.
Lesezeichen sind auf 120 Zeichen begrenzt. Die Suche zeigt höchstens 10.000
Treffer; bei dieser Grenze ist „Alle ersetzen“ gesperrt und fordert eine engere
Suche. Große Ersetzungsmengen werden zusätzlich begrenzt.

## Nachprüfung und behobene Fehler

Während der Umsetzung wurden diese Fälle korrigiert und geprüft:

- **Formatverlust beim FDX-Roundtrip:** Text-Runs erhalten ihre Stilflags statt
  zu einem einzigen unformatierten Text zu werden.
- **Flattening von Notizen und Outline:** Autor/Farbe/Bereich bleiben Metadaten;
  Akte und deren Zusammenfassungen werden nicht als Handlungstext gedruckt.
- **Unicode-Großschreibung:** Bereichsgrenzen werden zeichenweise umgerechnet,
  auch bei Erweiterungen wie `ß → SS`.
- **Textänderung und Split:** Stil- und Notizbereiche werden verschoben bzw.
  geschnitten; Zeilen-IDs und noch bestehende Produktionsbezüge bleiben bestehen.
- **Entwurfsarchiv:** Vor dem Import eines neuen Entwurfs wird der tatsächliche
  bearbeitete Drehbuchstand einschließlich Zusatzdaten serialisiert, statt den
  möglicherweise veralteten ursprünglichen Importtext zu archivieren.
- **Suchsprung und kleine Panels:** Ein Suchsprung aktualisiert die Auswahl der
  Formatwerkzeuge; die Werkzeugleiste lässt Platz für den Editor. Szenenfelder
  berücksichtigen den vor ihrem bearbeitbaren Ortsnamen stehenden Präfix.
- **Speicheranzeige:** Ausstehende Autosaves werden je Projekt vorgemerkt. Ein
  älterer abgeschlossener Schreibvorgang oder ein Save eines anderen Projekts
  darf den neueren Stand nicht voreilig als gespeichert melden.

Sicherheitsprüfung der neuen Grenzen: Importierte Formatierungen sind begrenzte
Flags und keine ausführbaren HTML-/CSS-Fragmente. Notizen und Titel werden als
Text gerendert bzw. für XML escaped. Zusatzdaten werden vor Übernahme auf
Felder, Bereichsgrenzen, Typen und Mengen geprüft. Die Suche maskiert
Regex-Sonderzeichen. Es wurden keine neuen Server, Zugangsdaten, Skript-Downloads
oder frei eingebbaren Netzwerkziele hinzugefügt.

Die vier übernommenen Schriftdateien und `OFL.txt` stimmen anhand ihrer Git-Blob-
Hashes mit dem festgelegten Upstream-Commit überein. Herkunft, MIT-Hinweis und
Schriftlizenz liegen in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md),
`licenses/` und beim Font. Die PDF-Font-Bibliothek ist separat nachgeladen;
das Einstiegspaket bleibt innerhalb seines Budgets.

Das ist eine interne Code- und Regressionstest-Prüfung, kein unabhängiger
Penetrationstest. Die im Collaboration-Audit dokumentierten Vertrauens- und
Netzwerkgrenzen bleiben bestehen.

## Verifikation

- Vollständige Unit-/Integration-Suite: **2.991 Tests in 255 Dateien bestanden**.
- Davon neue Schreib-/Unicode-/Speicherstatus-Fälle: **37 Tests**.
- TypeScript und ESLint mit null Warnungen: bestanden.
- GitHub-Pages-Produktionsbuild: bestanden; Einstiegspaket **370,0 KiB** bei
  420.000 Bytes Grenzwert. Fontkit ist ein separater, nachgeladener Chunk.
- Entwicklungs-Browserlauf: Schreiben, Suchen/Ersetzen, Undo/Redo, Notizen,
  Lesezeichen, Varianten, Szenenreihenfolge, Projekt-Export und Neuladen sowie
  Unicode-PDF-Download bestanden.
- Abschließender Browserlauf: **19 bestanden, 1 gezielt übersprungen**. Davon
  14 unter dem lokal bedienten Pages-Produktionsbuild bzw. dessen simulierter
  öffentlicher Origin: neun Collaboration-/Sicherheitsfälle, drei direkte
  WebRTC-Fälle und zwei neue Schreib-/Unicode-Fälle. Fünf bestehende
  Import-/Tastaturfälle liefen gegen den Entwicklungsserver. Der optionale
  Live-Test mit öffentlichen Vermittlungsdiensten war in diesem Lauf deaktiviert.
- Encoding und Diff-Whitespace: bestanden. Vollständiger Abhängigkeits-Audit
  einschließlich Fontkit: **0 gemeldete bekannte Sicherheitslücken** zum
  Prüfzeitpunkt.

Die erste lokale Produktionsvorschau wurde ohne den Pages-Unterpfad gestartet
und lieferte für verschachtelte Asset-URLs HTML statt JavaScript. Dieser
Testaufbau wurde korrigiert (`GH_PAGES=true` auch beim Preview-Start); die
abgebrochenen Läufe zählen nicht als bestandene Prüfungen.

Es wurde kein Commit, Push oder öffentliches Deployment ausgeführt.
