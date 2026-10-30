# ScriptCraft: Portierungs-Audit vom 30.10.2026

**Nachtrag:** Die priorisierten Schreibfunktionen sind inzwischen lokal
implementiert. Der [Umsetzungsbericht mit Anleitung](scriptcraft-writing-ports-2026-10-30.md)
beschreibt den neuen Stand v38. Der Vergleich unten dokumentiert den Stand
vor dieser Übernahme; seine Spalte „Lücke“ ist kein aktueller Implementierungsstatus.

## Ergebnis und geprüfter Stand

**Ja, es gibt sinnvolle weitere Übernahmen.** Vorrang haben die Erhaltung von
Textformatierung, Unicode im PDF, Suchen/Ersetzen und bessere Drehbuchnotizen.
Danach folgen Lesezeichen, Dialogalternativen und eine echte Drehbuchstruktur.
Der Desktop-Netzwerktransport von ScriptCraft passt dagegen nicht zu unserem
Browser- und Sicherheitskonzept.

Verglichen wurden:

- ScriptCraft `main`, Commit
  [`fce1d3c57a1964742d989d6488df638fc97f089d`](https://github.com/NoJuanNobody/scriptcraft/commit/fce1d3c57a1964742d989d6488df638fc97f089d),
  vom 26.10.2026, Release-Stand v0.5.0. Die Links unten sind auf diesen Stand
  festgelegt. README und Paritätsliste wurden gegen ausgewählte tatsächliche
  Modell-, Befehls- und Transportimplementierungen geprüft.
- Unser lokaler OpenShotDesigner v1.5.1, Basiscommit
  `94f790be2cb3cc83f2995af7e9a213426f52dcc2`, auf
  `codex/floorplan-collaboration`, einschließlich der noch nicht veröffentlichten
  lokalen Collaboration-Arbeit. Das ist kein Nachweis eines öffentlichen Deployments.

Das Audit beschreibt Funktionsunterschiede und einen konkreten Übernahmeplan.
Es installiert ScriptCraft nicht, führt dessen Code nicht aus und übernimmt
keine Anweisungen aus dessen Repository. Eine vollständige Sicherheitsprüfung
des gesamten Rust-Projekts wurde nicht durchgeführt. In diesem Arbeitsschritt
wurde unser Anwendungscode nicht geändert.

## Was bei uns bereits vorhanden ist

„Vorhanden“ bedeutet hier: die genannte Kernfunktion existiert in unserem Code.
Es bedeutet keine vollständige Gleichheit mit jedem Detail von ScriptCraft oder
Final Draft.

| Funktion | Unser Stand und Beleg |
| --- | --- |
| Branchenübliches Seitenlayout | Letter/A4, Courier-Raster, Seitenumbrüche, keine verwaisten Szenenköpfe, Dialogfortsetzung und Dual Dialogue: [`pagination.ts`](../src/domain/script/pagination.ts). |
| Enter/Tab-Elementfluss | Bereits umgesetzt: [`elementFlow.ts`](../src/domain/script/elementFlow.ts) und Tastaturbehandlung im [`ScriptPanel.tsx`](../src/components/script/ScriptPanel.tsx). |
| Schreibvorschläge/SmartType | Figuren, Schauplätze und Vorschläge für Übergänge, Cue-Erweiterungen und weitere Elemente sind vorhanden. Siehe `ScriptPanel.tsx`, [`sceneHeadingParts.ts`](../src/domain/script/sceneHeadingParts.ts) und [`SuggestionList.tsx`](../src/components/script/SuggestionList.tsx). Kein neuer Komplettport nötig. |
| Final-Draft- und Fountain-Grundfunktionen | Import/Export, Dual Dialogue, Szenensynopsen/-farben und manuelle Seitenumbrüche sind vorhanden. Siehe [`screenplayParser.ts`](../src/components/script/screenplayParser.ts), [`fdxExport.ts`](../src/domain/script/fdxExport.ts). Formatierung und einige Metadaten bleiben Lücken. |
| Import aus Word, Celtx und PDF | Bereits vorhanden: [`screenplayImport/`](../src/utils/screenplayImport/). Nicht nochmals implementieren, sondern gezielt um fehlende Datenerhaltung ergänzen. |
| Titelblatt | Feldbasiertes Titelblatt mit Vorschau und Export vorhanden. Freie Absatzpositionen und die ursprüngliche Ausrichtung eines beliebigen FDX-Titelblatts werden nicht vollständig erhalten: [`titlePage.ts`](../src/domain/script/titlePage.ts), [`fdxDocument.ts`](../src/domain/script/fdxDocument.ts). |
| Entwurfsvergleich | Absatz-/Wortvergleich und Erkennung verschobener bzw. umformulierter Zeilen vorhanden: [`compareDrafts.ts`](../src/domain/script/compareDrafts.ts), [`reconcile.ts`](../src/domain/script/reconcile.ts). Das ist keine laufende Änderungsverfolgung pro Autor. |
| Produktionsrevisionen | Revisionsfarben, Markierungen und FDX-Revisionssätze vorhanden: [`revision.ts`](../src/domain/script/revision.ts), [`fdxDocument.ts`](../src/domain/script/fdxDocument.ts). Kein vollständiger Gleichstand bei farbigem Papier, Druckauswahl und Revisionsmetadaten. |
| Gesperrte Seiten und Szenen | Seitenbindung/A-Seiten, Szenennummerierung und OMITTED/Restore vorhanden: [`pageLock.ts`](../src/domain/script/pageLock.ts), [`numbering.ts`](../src/domain/script/numbering.ts), [`omission.ts`](../src/domain/script/omission.ts). Nicht mit vollständiger FDX-Interoperabilität dieser Produktionsdaten verwechseln. |
| Szenenübersicht und Berichte | Synopsen und Farben, Seitenlängen in Achteln, Figuren-/Szenen-/Location- und Breakdown-Berichte vorhanden: [`SceneListReport.tsx`](../src/components/script/SceneListReport.tsx), [`ScriptReportsPanel.tsx`](../src/components/script/ScriptReportsPanel.tsx). Noch keine frei umstellbare Story-Kartenansicht. |
| Mehrkamera und Szenenfortsetzung | Double-Spaced-Dialog, neue Seite je Szene und CONTINUED-Optionen vorhanden: `pagination.ts`, `fdxDocument.ts`. Das ist kein vollständiges TV-/Bühnenvorlagensystem. |
| Rechtschreibung | Das Textfeld aktiviert bereits die Browser-Rechtschreibung: [`ScreenplayLineField.tsx`](../src/components/script/ScreenplayLineField.tsx). Ein eigener Offline-Wörterbuchdienst mit Benutzerwörterbuch fehlt. |
| Browser-Betrieb und Projektspeicherung | Bereits unsere Architektur. Desktop-Konfigurationsordner, native Druckertreiber und Rust/WASM-App müssen dafür nicht übernommen werden. |
| Wasserzeichen | Unser PDF-Export bietet bereits einen DRAFT- bzw. Textwasserzeichen-Parameter. ScriptCraft führt Wasserzeichen selbst noch als offen. Siehe [`linedScriptPdf.ts`](../src/utils/pdf/linedScriptPdf.ts). |

Die existierende Testsuite [`scriptcraftPorts.test.ts`](../src/domain/__tests__/scriptcraftPorts.test.ts)
enthält ausdrücklich bereits v0.5-Fidelity-Fälle. Die Versionsnummer allein ist
deshalb kein Beleg, dass uns sämtliche Funktionen von v0.5 fehlen.

## Fehlende bzw. unvollständige Funktionen

P1 = zuerst angehen, P2 = danach sinnvoll, P3 = optional. Das sind Prioritäten
für die Übernahme, keine Einstufungen von Sicherheitslücken.

| Priorität | Funktion | Konkrete Lücke und Empfehlung |
| --- | --- | --- |
| P1 | **Fett, kursiv, unterstrichen als Textbereiche** | Unser `ScriptLine` besitzt nur `text`, keine Stilbereiche. `fdxParagraphs.ts` verkettet Text-Runs ohne deren `Style`; `fdxExport.ts` schreibt pro Absatz unformatierten Text. Ein FDX-Roundtrip verliert deshalb solche Hervorhebungen. Erst Stilmodell, Import/Export und Bearbeitungsregeln ergänzen; anschließend Editor, Vorschau und PDF gemeinsam anpassen. Upstream: [`style.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/style.rs). |
| P1 bei internationalen Drehbüchern | **Unicode-Schrift im PDF** | `linedScriptPdf.ts` nutzt Standard-Courier; [`pdf/text.ts`](../src/utils/pdf/text.ts) ersetzt nicht in WinAnsi darstellbare Zeichen ausdrücklich durch `?`. Kyrillisch, Griechisch und viele weitere Schriften gehen dabei verloren. Umlaute und ß sind bereits unterstützt. ScriptCraft bettet Courier Badi mit kyrillischen Glyphen ein. Eine passende, lokal mitgelieferte Schrift einbetten und ihre tatsächliche Zeichenabdeckung prüfen; das allein löst nicht automatisch CJK, Arabisch oder komplexes Text-Shaping. |
| P1 | **Suchen und Ersetzen im Drehbuch** | Im ScriptPanel gibt es kein entsprechendes Werkzeug. Browser-Seitensuche und Suche in anderen App-Bereichen ersetzen keine Suche über den vollständigen Drehbuchdatenbestand. Kleine, nützliche Übernahme: vor/zurück, Groß-/Kleinschreibung, Trefferanzeige, Ersetzen und „Alle ersetzen“ als eine Undo-Aktion. Upstream: [`cmd/edit.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/engine/src/cmd/edit.rs). |
| P1/P2 | **Verankerte ScriptNotes** | Notiztext wird importiert und wieder exportiert, aber als separate `note`-Zeile. Autor wird in Text abgeflacht; Textbereich, Farbe und eigenständige Metadaten bleiben nicht erhalten. Empfohlen sind Notizen mit stabiler Absatz-ID, optionalem Textbereich, Autor und Farbe sowie einer Navigatorliste. Kein Kommentar-HTML aus Dateien rendern. Upstream: [`annot.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/annot.rs), [`cmd/notes.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/engine/src/cmd/notes.rs). |
| P2, geringer Umfang | **Lesezeichen** | Im Drehbuchmodell fehlen benannte Absatz-Lesezeichen. Nützlich für Proben, offene Fragen und längere Drehbücher. An `ScriptLine.id` binden; „nächstes/vorheriges“ und Liste anbieten. Bei gelöschten Absätzen kontrolliert bereinigen. FDX-Attribut übernehmen. Upstream: [`cmd/boards.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/engine/src/cmd/boards.rs). |
| P2 | **Dialogalternativen** | Kein Feld für alternative Fassungen einer Dialogzeile. Sehr passend für Drehbucharbeit: Alternativen speichern, wechseln und nur die aktive Fassung drucken. Beim Wechsel dieselbe Zeilen-ID behalten, damit Shot- und Lining-Verknüpfungen bestehen bleiben. Upstream: [`cmd/alternates.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/engine/src/cmd/alternates.rs). |
| P2 | **Akte/Sequenzen, Story-Karten und Szenenverschiebung** | FDX-Outline-Absätze werden derzeit zu einfachen Notizen. Synopsen sind schon da, aber keine semantische Akt-/Sequenzstruktur und kein Szenen-Karteneditor zum Umordnen des Drehbuchs. Strukturpunkte ohne Einfluss auf die gedruckte Seitenzahl modellieren; komplette Szenenblöcke verschieben und ihre IDs erhalten. Drehreihenfolge auf dem Stripboard ist eine andere Funktion. Upstream: [`structure.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/structure.rs). |
| P2, nach Struktur | **Story Map und Beat Board** | Unsere Blocking-Beats und das Moodboard sind keine dramaturgischen Story-Beats. Eine Seitenlängen-Karte bietet zuerst mehr Nutzen bei geringerem Umfang; ein freies Beat Board kann später folgen. Story-Beat mit Szene verbinden, ohne dass er ein Kamera- oder Blocking-Element wird. Upstream: [`beats.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/beats.rs). |
| P2 | **Änderungsverfolgung mit Annehmen/Ablehnen** | Revisionsfarben und Entwurfsvergleich sind vorhanden, aber keine einzelnen Einfügungen/Löschungen/Elementänderungen pro Autor mit Accept/Reject. Sinnvolle größere Erweiterung für Autorenrunden. Zuerst lokal korrekt umsetzen; persistente Änderungsobjekte, Undo, Stil-/Notizbereiche und Export müssen zusammen funktionieren. Upstream: [`track.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/track.rs). |
| P2 | **Freies Titelblatt, Kopf-/Fußzeilen, Produktionsdruck** | Wir besitzen feste Titelblattfelder und PDF-Kopfzeilen, aber keinen entsprechenden Slot-Editor mit Seiten-/Revisionsfeldern. Freie FDX-Titelblattzeilen sollten zuerst verlustarm erhalten bleiben; danach konfigurierbare Kopf-/Fußzeilen und gezielter Druck geänderter Seiten. Farbiges Revisionspapier separat prüfen. Upstream: [`page_setup.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/page_setup.rs). |
| P3 | **TV-/Bühnenvorlagen und Element-Einstellungen** | Feature/Multicam ist bereits vorhanden. Teaser/Akte, Bühnenformat und individuelle Abstände/Einzüge/Tastaturziele fehlen. Erst feste, nachvollziehbare Vorlagen; frei konfigurierbare Elementregeln erst mit verlässlicher gemeinsamer Layout-Engine. General/Singing werden aktuell auf bestehende Typen abgebildet und nicht als unabhängige Typen erhalten. Upstream: [`template.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/template.rs), [`format.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/doc/src/format.rs). |
| P3 | **Vorlesen mit Rollenstimmen** | Kein entsprechender Browser-Dienst in unserem Code. Ein optionales Browser-Werkzeug ist eine mögliche Umsetzung; Verfügbarkeit und lokale Verarbeitung der ausgewählten Stimmen vorab prüfen. Keine nativen ScriptCraft-Prozesse oder Shell-Aufrufe übernehmen. Upstream: [`cmd/speech.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/engine/src/cmd/speech.rs). |
| P3 | **Eigene Offline-Rechtschreibung** | Gegenüber der vorhandenen Browser-Prüfung sind Benutzerwörterbuch und reproduzierbare Offline-Vorschläge zusätzliche Funktionen. ScriptCraft liefert Englisch, keine fertige deutsche Lösung. Vor einem Port Sprachbedarf, Wörterbuchlizenz, Ladegröße und Worker-Ausführung festlegen. Upstream: [`spell/src/lib.rs`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/spell/src/lib.rs). |
| P3 | **Zwei unabhängige Drehbuchansichten** | Unsere App-Panels sind kein ScriptCraft-Split-View mit zwei Ansichten desselben Texts. Optional nützlich für Vergleich und Navigation. Gemeinsame Dokumentquelle, getrennte Scrollpositionen; keinen zweiten Projektzustand anlegen. |
| Separates Folgeprojekt | **Gemeinsames Schreiben am Drehbuch** | Die aktuelle sichere Collaboration teilt einen Plan und seine Shots. [`roomProject()`](../src/collaboration/model.ts) entfernt absichtlich Drehbuch und Lining-Markierungen. ScriptCraft bietet gemeinsames Tippen, aber nur über seinen Desktop-Transport. Eine Browser-Erweiterung müsste Textzusammenführung, Notizanker und Schemagrenzen eigens lösen. Nicht einfach `scriptLines` in das geteilte Projekt aufnehmen. |

## Was wir nicht direkt portieren sollten

### Desktop-Collaboration und lokale Steuerkanäle

Der tatsächliche [`TCP-Transport`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/crates/collab/src/net.rs)
verwendet `TcpListener`/`TcpStream`. Die
[`Collaboration-Dokumentation`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/docs/collaboration.md)
sagt ausdrücklich:

- Der Browser-Build unterstützt diesen Transport nicht.
- Nachrichten sind unverschlüsselter JSON-Text über TCP.
- Die Sitzung verlangt einen Host im LAN bzw. einen selbst bereitgestellten Tunnel.
- Internet-Relay, NAT-Traversal und Host-Migration sind nicht enthalten.

Ein Port würde unsere Anforderungen „GitHub Pages, nur Browser, keine Installation,
kein Konto und keine manuelle Host-Konfiguration“ nicht erfüllen. Merge- und
Caret-Konzepte können als Referenz dienen; Transport und Vertrauensmodell nicht.
Unser bestehender WebRTC-Weg bleibt die Grundlage für eventuelle gemeinsame
Drehbucharbeit. Auch dieser hat weiterhin die dokumentierten Netzwerklimits.

MCP, CLI und der lokale JSON-Steuerport sind für unsere angefragte Web-App keine
notwendigen Ports. Keinen zusätzlichen Netzwerk-Endpunkt allein zur Feature-Parität
öffnen. Den internen Ansatz „UI-Aktion über getestete Domain-Befehle“ verwenden
wir bereits und können ihn ausbauen.

Diktat mit nativen Speech-/Whisper-Programmen wäre ebenfalls kein geeigneter
Standard. Eine spätere Browser-Variante braucht einen bewussten Mikrofonstart
und eine klare Entscheidung über lokale oder entfernte Verarbeitung. Sie darf
keine Installation oder Kontoanlage zur Voraussetzung der normalen App machen.

### Nicht mit bereits implementierten Upstream-Funktionen verwechseln

Die Upstream-Paritätsliste bezeichnet Thesaurus, Format Assistant, Wasserzeichen,
FDXT-Vorlagen sowie Focus/Typewriter Mode selbst als noch offen. Dafür gibt es
keinen fertigen Feature-Port aus diesem Stand. Einzelne Ideen können wir
unabhängig umsetzen; sie gehören nicht auf die Liste „vorhandenen Code übernehmen“.

## FDX: zwei verschiedene Versprechen auseinanderhalten

Die Upstream-Datei
[`docs/fdx-format.md`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/docs/fdx-format.md)
trennt beobachtete Final-Draft-Strukturen von ScriptCraft-eigenen Erweiterungen.
Das ist eine wichtige Grenze für unseren Port:

- Stil-Runs, grundlegende Notizstrukturen, Outline-Absätze und Teile der
  Beat-Board-Struktur beruhen auf beobachteten FDX-Strukturen.
- Alternativen und Track Changes werden dort über `ScriptCraft*`-Elemente
  gespeichert. Gesperrte Seiten, Omitted-Metadaten und Produktions-Tags sind
  ebenfalls teilweise eigene Formen mit noch offener Final-Draft-Validierung.
- Ein erfolgreicher Export und Reimport in derselben App beweist deshalb nicht,
  dass Final Draft diese Metadaten versteht oder erhält.

Für neue Ports native Projektspeicherung vollständig halten, FDX-Unterstützung
pro Feld deklarieren und unbekannte Erweiterungen nicht als garantierte
Final-Draft-Kompatibilität bewerben. Echte Interoperabilität braucht passende,
rechtmäßig nutzbare Referenzdateien und Tests mit dem Zielprogramm.

## Umsetzungsvorschlag und Sicherheitsanforderungen

1. **Datenerhaltung zuerst:** Stilbereiche im Modell; FDX/Fountain-Roundtrips;
   Unicode-Schrift beim PDF-Export. Editor und PDF müssen dieselben Text- und
   Layoutregeln verwenden. Bei nicht unterstützten Zeichen sichtbar melden,
   statt einen vollständigen Export vorzutäuschen.
2. **Kleine Arbeitserleichterungen:** Suchen/Ersetzen und Lesezeichen. Diese
   benötigen keinen externen Dienst. Suchtreffer über IDs bestimmen und nach
   Änderungen neu berechnen; „Alle ersetzen“ in eine History-Transaktion fassen.
3. **Notizen und Varianten:** Verankerte ScriptNotes und Dialogalternativen.
   Begrenzungen für Anzahl, Textlänge und Bereichsgrenzen festlegen; bestehende
   einfache Notizen kompatibel migrieren.
4. **Dramaturgische Struktur:** Akte/Sequenzen und Karten mit Szenenverschiebung;
   danach Story Map, später optional Beat Board. Produktionsverknüpfungen,
   Seitenbindungen und gesperrte Szenennummern beim Verschieben prüfen.
5. **Größere Autorenfunktionen:** Track Changes und eventuell gemeinsame
   Drehbuchbearbeitung. Dafür eigene Modell-, Konflikt- und Sicherheitsprüfung
   mit gleichzeitigen Änderungen durchführen.

Für jede persistente Modellerweiterung ist eine versionierte Migration samt
Altprojekt-Test nötig. Optionale Funktionen müssen bei alten Projekten fehlen
dürfen; keine stillschweigend erfundenen Autoren, Notizen oder Layoutdaten.

Rust zählt in den Stilbereichen UTF-8-Bytes; JavaScript-Textfelder verwenden
UTF-16-Indizes. Bereiche deshalb konzeptionell übertragen und an unsere
Auswahl-/Textoperationen anpassen. Tests müssen Umlaute, Emoji, kombinierende
Zeichen, Einfügen/Löschen, Split/Join, Großschreibung und Verschieben abdecken.

Importierte Stile nur als begrenzte Flags zulassen, kein beliebiges CSS oder HTML.
XML und Projektdaten begrenzen und validieren; Notizen als Text rendern. Suche
zunächst als Literal-Suche umsetzen, ohne unbeschränkte reguläre Ausdrücke aus
Benutzereingaben. Umfangreiche Wörterbuch- und Schriftverarbeitung bei Bedarf
aus dem UI-Thread auslagern.

Die vier Upstream-Schriftdateien sind zusammen 3.157.084 Bytes groß; allein das
englische Hauptwörterbuch hat 1.070.089 Bytes. Solche Ressourcen nicht pauschal
in das Einstiegspaket laden. Bei Bedarf vom eigenen statischen Deployment laden,
offline speichern und den vorhandenen Bundle-Grenzwert weiter prüfen.
Schriftabdeckung und Exportgröße sind getrennte Abnahmekriterien.

Die empfohlenen lokalen Editor-/Exportfunktionen sind nach dieser technischen
Bewertung mit einer statischen GitHub-Pages-App vereinbar. Sie brauchen keinen
neuen Nutzer-Account, keine PC-Installation und keinen neuen Server. Das ist
ein Architekturvorschlag; die einzelnen Ports sind noch nicht implementiert
oder im Browser abgenommen.

## Lizenzen und Herkunft

ScriptCrafts Code wird unter
[`MIT OR Apache-2.0`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/LICENSE-MIT)
angeboten. Unsere README nennt ScriptCraft bereits als Quelle der bisherigen
TypeScript-Neuimplementierungen. Bei zusätzlicher tatsächlicher Codeübernahme
gewählte Lizenz und zugehörige Copyright-/Lizenzhinweise mitführen und den
Quellcommit dokumentieren. Die vorhandene README-Zeile allein ersetzt nicht die
Lizenztexte für künftig kopierte Bestandteile.

Assets haben eigene Bedingungen: Courier Badi steht unter SIL OFL 1.1;
SCOWL/ESDB-Wortlisten haben eigene Hinweise. Siehe
[`ATTRIBUTION.md`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/ATTRIBUTION.md)
und [`NOTICE`](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/NOTICE).
Bei einem Asset-Port diese Texte mitliefern, nicht die Code-Lizenz pauschal auf
Fonts oder Wörterbücher anwenden. Es wurden in diesem Audit keine Assets kopiert.

## Prüfung dieses Audits

Am 30.10.2026 bestanden **125 Tests in 7 Dateien** mit Node 24.22.1:

```text
src/domain/__tests__/scriptcraftPorts.test.ts
src/domain/__tests__/pagination.test.ts
src/domain/__tests__/fdxExport.test.ts
src/domain/__tests__/pageLock.test.ts
src/domain/__tests__/screenplayParser.test.ts
src/utils/screenplayImport/__tests__/formats.test.ts
src/utils/pdf/__tests__/scriptPdfs.test.ts
```

Diese Ergebnisse bestätigen die vorhandenen getesteten Ports und deren
Regressionen. Sie beweisen keine Unterstützung der oben aufgeführten fehlenden
Funktionen. Die neuen Ports brauchen insbesondere Tests für Datenmodell und
Migration, Dateiformat-Roundtrips, Bearbeitung mit Undo/Redo, identische
Vorschau-/PDF-Seitenumbrüche und den Erhalt von Shot-/Lining-Verknüpfungen.

Der aktuelle Audit-Schritt ergänzt ausschließlich dieses Dokument und den
Dokumentationsindex; kein Commit, Push oder Deployment wurde ausgeführt.
