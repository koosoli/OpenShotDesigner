# Zweiter Audit: Zusammenarbeit, Datenintegrität und Sicherheit

30. Oktober 2026 · OpenShotDesigner · Basis `94f790b` (v1.5.1) · Branch `codex/floorplan-collaboration`

**Spätere Standardverbindung:** Der [v4-Plan](collaboration-plan-v4.md) ergänzt kontofreies WebRTC. Dessen zusätzlicher [Sicherheitsbericht](collaboration-direct-security-2026-10-30.md) enthält den neueren Prüfstand für diesen Transport. Die hier beschriebene private Relay-Betriebsart bleibt optional.

## Ergebnis und Umfang

Die zweite Prüfung hat weitere Fehler an den Übergängen zwischen React, dem gemeinsamen Yjs-Dokument, dem Browser-Cache und dem Netzwerk gefunden. Die unten aufgeführten Befunde wurden im lokalen Arbeitsstand behoben und mit Regressionstests abgesichert. Eine öffentliche Bereitstellung oder ein Push ist nicht erfolgt.

Geprüft wurden der neue Collaboration-Code, seine Einbindung in Projektzustand und Undo, Einladungen, Server-Zugriffsschutz, WebSocket-Lebenszyklus, Worker-Validierung, Ressourcenbegrenzungen und Wiederherstellung. Zusätzlich liefen bestehende Tests für Projektverwaltung, Exporte, Datenverlustpfade, Smartphone-Layout und Barrierefreiheit. Das ist eine Quellcodeprüfung mit automatisierten Angriffs- und Integrationstests, kein unabhängiger Penetrationstest der gesamten Anwendung oder einer öffentlichen Infrastruktur.

Der [erste Sicherheitsbericht](collaboration-security-2026-10-30.md) erklärt die zuvor eingebauten Schutzmaßnahmen und Betriebsanforderungen. Dieser Bericht ergänzt ihn und enthält den neueren Prüfstand.

## Befunde und Korrekturen

### A2-01 — Zusätzliche Szenen konnten beim nächsten Empfang verschwinden

**Priorität: hoch, Datenintegrität.** Eine laufende Sitzung synchronisiert genau einen Plan. Zuvor prüfte der Schreibpfad nur die daraus ausgewählte Szene. Das Hinzufügen einer weiteren Szene blieb dadurch unbemerkt; eine spätere Projektion des gemeinsamen Plans konnte das lokale Szenen-Array wieder auf eine Szene reduzieren.

**Korrektur:** Lokale Änderungen müssen dieselbe Projektidentität, genau eine Szene und dieselbe aktive Szenenidentität behalten. Eine Erweiterung oder ein Wechsel beendet die Freigabe. Das bearbeitete lokale Projekt bleibt vollständig geöffnet und exportierbar. Eine neue Freigabe erfordert einen neuen Sitzungsstart.

**Nachweis:** Hook-Test für das Hinzufügen einer Szene und echter Zwei-Browser-Test: Nach dem Hinzufügen bleiben beide lokalen Szenen erhalten, die Freigabe endet mit Erklärung, und spätere Änderungen des Gasts verändern diese lokale Produktion nicht mehr.

### A2-02 — Eingehende Zustände konnten noch wartende lokale Aktionen überschreiben

**Priorität: hoch, Datenintegrität.** Der Adapter leitete lokale Änderungen erst aus gerenderten Gesamtsnapshots ab. Ein Remote-Update und ein lokaler React-Updater im selben Batch konnten sich überholen. Eine pauschale Zustandsersetzung konnte die lokale Aktion verlieren oder einen empfangenen Zustand als neue lokale Änderung behandeln.

**Korrektur:** Der bestehende Projekt-Setter erfasst die tatsächlich ausgeführten lokalen Feldänderungen. Der Session-Adapter legt sie zunächst als Absichten ab. Eingehende Zustände werden mit einem funktionalen Setter und diesen noch ausstehenden Absichten projiziert. Erst nach dem Commit schreibt der Adapter nach Yjs. Während eines React-Updaters finden keine Yjs-Schreibvorgänge oder Netzwerksendungen statt. Der Projekt-Setter behält seine stabile Callback-Identität.

**Nachweis:** Tests kombinieren mehrere lokale Aktionen mit einem eingehenden Update im selben React-Batch. Beide unabhängigen Änderungen bleiben erhalten; Undo entfernt ausschließlich die lokale Änderung. Ein weiterer Empfang erzeugt keine lokale Update-Echoschleife. Die bisherigen Modelltests für konkurrierende Posen, Löschung und selektives Undo bestehen weiterhin.

### A2-03 — Ein abgebrochener Sitzungsstart konnte später doch verbinden

**Priorität: mittel, unerwartete Zustandsänderung.** Die Gültigkeitsprüfung begann erst nach dem asynchronen Anfordern einer Einladung. Ein verspäteter Erfolg konnte nach Verlassen, Projektwechsel oder Unmount noch eine Sitzung anlegen. Auch ein wartender Join war vor dem ersten Dokument noch nicht an seine Ausgangsproduktion gebunden.

**Korrektur:** Der gesamte Vorgang hat ab Beginn eine Generation, einen Ausgangsplan und einen AbortController. Verlassen, Plan-/Projektwechsel und Unmount brechen ihn ab. Die Einladungsanfrage kombiniert diesen Abbruch mit ihrem eigenen Zeitlimit. Jede asynchrone Fortsetzung prüft ihre Gültigkeit. Ein veralteter Erfolg wird auch dann ignoriert, wenn der Transport den Abbruch nicht respektiert.

**Nachweis:** Drei getrennte Tests liefern die Einladung ausdrücklich erst nach Leave, Projektwechsel beziehungsweise Unmount erfolgreich zurück. Keiner öffnet eine Session. Ein weiterer Test prüft den Projektwechsel während eines leeren, noch wartenden Joins.

### A2-04 — Der Wechsel zur Raumkopie musste den neuesten Originalstand sichern

**Priorität: hoch, Datenintegrität.** Eine sofortige Remote-Ersetzung konnte erfolgen, bevor die reguläre verzögerte Autosicherung eine gerade ausgeführte Originaländerung gesehen hatte.

**Korrektur:** Das erste gültige Raumdokument wird zunächst vorgemerkt. Der Adapter speichert den zuletzt committed Originalstand und wartet auf die offenen Bibliotheks-Schreibvorgänge. Erst danach öffnet er die separate Raumkopie. Die Ersetzung ist an die konkrete Originalreferenz gebunden; hat inzwischen eine weitere lokale Änderung stattgefunden, wird mit deren Stand erneut gespeichert. Ein Speicherfehler stoppt den Join und lässt das Original geöffnet.

**Nachweis:** Tests für eine unmittelbar vor dem Join getippte Änderung und für einen absichtlich fehlgeschlagenen Original-Speichervorgang. Der Browserfall prüft zusätzlich die getrennte Identität und den erhaltenen Originaleintrag in IndexedDB.

### A2-05 — Alte Socket-Callbacks und irreführender Wiederverbindungsstatus

**Priorität: mittel, Verbindungszustand.** Ein alter, gerade öffnender Socket konnte nach Offline/Online bereits durch einen neuen ersetzt worden sein. Sein verspätetes Open-Ereignis durfte weder den Status noch den Ausgangspuffer der neuen Verbindung verändern. Außerdem wurde die erste Seed-Übertragung bereits als Konfliktrekonsiliation angezeigt.

**Korrektur:** Auch der Open-Callback prüft die aktuelle Socket-Identität. Veraltete Sockets werden geschlossen. Eine Wiederverbindungswarnung setzt eine vorherige Verbindung voraus.

**Nachweis:** Transporttest mit absichtlich vertauschten Open-Ereignissen; der alte Socket sendet nichts. Weitere Tests prüfen die initiale Statusanzeige und passende Bestätigungssequenzen.

### A2-06 — Cache-Zeitüberschreitungen konnten noch nachträglich Zustand einspielen

**Priorität: mittel, Wiederherstellung und Robustheit.** Ein Timeout um den bisherigen Persistence-Provider stoppte dessen spätere Leseoperation nicht. Er konnte nach Beginn des Live-Betriebs noch alten Zustand anwenden. Der Provider besaß zudem interne Promise-Ketten, deren Fehler der Session-Adapter nicht zuverlässig übernehmen konnte.

**Korrektur:** Ein kleiner eigener IndexedDB-Cache ersetzt den Provider. Er speichert einen kompakten, auf 2 MiB begrenzten CRDT-Snapshot statt einer stetig wachsenden Liste einzelner Updates. Öffnen, Lesen und Schreiben haben eigene Fehlerpfade und Zeitlimits. Eine verspätete Datenbanköffnung wird geschlossen; geladene Binärdaten werden vor jeder Anwendung im Validierungsworker geprüft. Bei Cache-Ausfall bleibt Live-Arbeit möglich, mit sichtbarem Exporthinweis. Die nun unbenutzte Abhängigkeit `y-indexeddb` wurde entfernt.

Die Snapshot-Schreibvorgänge werden kurz gebündelt. Pagehide, Beforeunload, Verbergen der Seite und explizites Beenden stoßen den letzten Schreibvorgang sofort an. Das verbessert die Wiederherstellung, ist keine Zusage, dass ein Browser bei Prozessabbruch noch beliebige Transaktionen beendet.

**Nachweis:** Tests für kompakte Wiederherstellung der letzten Offline-Änderung, Flush vor Ablauf des Debounce-Timers, verweigertes IndexedDB, gescheiterte Transaktionen, Größenbegrenzung, verspätetes Öffnen, Close während Load und vergiftete Cache-Binärdaten. Cache-Binärdaten werden zwischen Realms als echte ArrayBuffer-Views geprüft und normalisiert.

**Formatwechsel im unveröffentlichten Preview:** Der Cache verwendet jetzt den Namensraum `plan-room-v2-…`. Temporäre Cache-Daten der vorherigen Implementierung werden nicht migriert. Die getrennt gespeicherte Projektbibliothek und vorhandene JSON-/OSD-Dateien werden dadurch weder gelöscht noch umgeschrieben.

### A2-07 — Socket-Fehler während eines abgelehnten Upgrades brauchten einen Besitzer

**Priorität: mittel, Verfügbarkeit.** Vor der Übergabe an `ws` fehlte ein eigener Error-Handler am rohen Upgrade-Socket. Ein TCP-Reset während der Ablehnung durfte kein unbehandeltes Socket-Ereignis bis zum Prozess durchreichen.

**Korrektur:** Der Relay behandelt Socket-Fehler ab Beginn des Upgrades und entfernt diesen temporären Handler nach erfolgreicher Übergabe an WebSocket. Das entspricht auch dem Authentifizierungsbeispiel der [ws-Dokumentation](https://github.com/websockets/ws#client-authentication).

**Nachweis:** Integrationstest mit 20 zurückgesetzten TCP-Verbindungen bei ungültigen Upgrades. Anschließend funktionieren Health-Endpunkt, gültige Verbindung, Dokumentvalidierung und Bestätigung weiterhin. Der Test allein beweist keine Belastbarkeit gegen beliebig viele Netzwerkangriffe.

### A2-08 — Vollständige Reconnect-Snapshots wurden an alle anderen Teilnehmer vervielfacht

**Priorität: mittel, Ressourcenverbrauch.** Ein Client muss bei Wiederverbindung seinen vollständigen Zustand abgleichen können. Diesen Zustand unverändert an jeden anderen Teilnehmer weiterzuleiten vervielfachte den Verkehr unnötig und konnte bei großen Plänen und gebündelten Reconnects die begrenzte Empfangswarteschlange belasten.

**Korrektur:** Der Serverworker validiert den Gesamtzustand und berechnet anschließend ausschließlich das gegenüber dem akzeptierten Raumzustand fehlende Delta für die anderen Teilnehmer. Ein unveränderter Snapshot erzeugt keinen weiteren Broadcast. Die bestehenden Größen-, Zeit-, Warteschlangen- und Ratenlimits bleiben wirksam. Der Worker-Timeout ist außerdem fest an die betreffende Worker-Instanz gebunden.

**Nachweis:** Test im echten Node-Worker: Eine neue Feldeigenschaft wird als kleines Delta übertragen und rekonstruiert beim Empfänger denselben Plan. Ein erneut gesendeter identischer Zustand liefert ein leeres Delta. Der Drei-Browser-Fall prüft weiterhin Offline-Änderungen und Wiederverbindung über echte Sockets. Ein vollständiger Lasttest am öffentlichen Größen-/Teilnehmerlimit steht aus.

### A2-09 — Budget-Bedienelemente lagen auf dem Smartphone außerhalb des Bildschirms

**Priorität: niedrig, Bedienbarkeit.** Der bestehende Smartphone-Test fand im Budgetmodul einen bis 463 px breiten Kontrollbereich bei 375 px Bildschirmbreite. Das ist ein zusätzlicher UI-Befund außerhalb des Collaboration-Protokolls.

**Korrektur:** Der Kontrollbereich respektiert seine verfügbare Breite und kann umbrechen.

**Nachweis:** Der zuvor fehlgeschlagene bestehende Smartphone-Test besteht nach der Korrektur. Er prüft die obere Leiste und alle Produktionsmodule.

## Abschließende Prüfungen

Geprüft mit Node 24.22.1, Vitest 5.0.3 und Playwright 1.63.0 unter Windows. Die installierte Systemversion Node 22.17.0 liegt unter den Engine-Anforderungen eines Teils der bestehenden Testwerkzeuge; die Tests wurden deshalb mit der neueren verfügbaren Laufzeit ausgeführt.

| Prüfung | Ergebnis |
| --- | --- |
| Vollständige Vitest-Suite nach den letzten Codekorrekturen | **2.939 Tests in 250 Dateien bestanden** |
| Collaboration-Tests innerhalb dieser Suite | **73 bestanden**, davon 35 Fälle in der Sicherheitsdatei; zusätzlich Modell-, Relay-, React-Lebenszyklus-, Cache- und Session-Tests |
| Collaboration im echten Chromium gegen den Pages-Produktionsbuild | **9 bestanden**, einschließlich drei isolierter Teilnehmer, Offline/Reconnect, selektivem Undo, Refresh, Export/Import, Signaturen, bösartigem Relay, CSP und neuem Szenen-Datenverlusttest |
| Bestehende Produktions- und Datenverlust-Browserfälle | **16 bestanden** |
| Bestehende Axe-Prüfungen aller Module | **Light und Dark bestanden**, keine dort erkannten serious/critical-Verstöße |
| Bestehender Smartphone-Test | Zunächst Budget-Überlauf gefunden; **nach Korrektur bestanden** |
| Service-Worker/Offline-Neustart des Produktionsbuilds | **1 bestanden** |
| TypeScript, ESLint mit null Warnungen, Encoding, Command-Ratchet, Diff-Whitespace | Bestanden |
| Pages-Produktionsbuild und Einstiegspaket-Budget | Bestanden; Einstieg **367,7 KiB**, Budget 420.000 Bytes |
| `npm audit --json`, einschließlich Entwicklungsabhängigkeiten | **0 gemeldete bekannte Sicherheitslücken** zum Prüfzeitpunkt |

Das sind 29 unterschiedliche bestandene Browserfälle über mehrere gezielte Läufe. Der erste Smartphone-Lauf wurde nicht als erfolgreich gezählt; sein Fehler und die anschließende Korrektur stehen oben. Die neuen Lebenszyklus-Tests verwenden den echten Hook, die echte History und die echte Session; nur Cache-/Netzwerk-Start wird dort isoliert. Die separaten Relay- und Browserfälle prüfen dagegen tatsächliche Sockets und Worker.

Zum Nachvollziehen: `vitest run --maxWorkers=4`, `tsc --noEmit`, `eslint . --max-warnings=0`, `npm audit --json`, der Build mit `GH_PAGES=true` sowie `playwright test e2e/collaboration.spec.ts --workers=1` mit `COLLAB_TEST_BASE_URL=http://127.0.0.1:4173/OpenShotDesigner/`. Die Werkzeuge wurden über die oben genannte Node-24-Laufzeit gestartet.

Der Modellbenchmark mit 1.000 Objekten und 100 Bewegungen ergab 16,47 ms Median und 21,57 ms p95; einzelne rohe Yjs-Bewegungsupdates waren höchstens 71 Bytes groß. Das ist eine lokale CPU-Messung des Modells, keine Aussage über gesamte Editor- oder Internetlatenz. Der vollständige codierte Benchmark-Raum einschließlich Seed und History war 766.017 Bytes groß.

## Bestehende Schutzmaßnahmen erneut überprüft

- Öffentliche Raum-Erstellung erfordert einen eigenen Bearer-Schlüssel. Ein anderer Schlüssel signiert raumgebundene Einladungen mit höchstens 24 Stunden Laufzeit. Ohne gültige Signatur wird kein Raumzustand ausgeliefert. Origin-Prüfung dient nur als zusätzliche Schranke.
- Öffentliche Frontends akzeptieren ausschließlich ihren konfigurierten Relay. Ohne Konfiguration bleibt Collaboration deaktiviert. Ein beliebiger Einladungshost oder ein Loopback-Ziel kann dort keine Verbindung auslösen.
- Unvertrauenswürdige Binärdaten werden vor Annahme im Worker geprüft. Geschlossene Schemas, erlaubte Wurzeln/Felder, Größen- und Komplexitätsgrenzen sowie die unveränderliche Seed-Identität begrenzen den Zustand. Tests decken unter anderem Prototype-Felder, gefälschte Identitäten, unsichere SVG-Farben, falsche Typen, ungültige Pfade und beschädigte Updates ab.
- Verbindungen, IP-Adressen, Räume, Handshakes, Nachrichten, Fragmente, Ping/Pong, Speicher und Validierungswarteschlangen sind begrenzt. Nicht ausdrücklich vertraute Forwarding-Header beeinflussen die Client-IP nicht.
- Der Produktionsbuild hat eine Content Security Policy. Browserprüfungen bestätigen blockierte Inline-Skripte, inertes Label-HTML sowie weiterhin funktionierenden PDF-Import und -Export.

## Grenzen und verbleibende Arbeiten

Es ist nach diesem Prüfstand kein offener bestätigter Fehler der oben beschriebenen Befunde übrig. Das bedeutet keine Garantie, dass keine weiteren Fehler oder Sicherheitslücken existieren.

Ein gültiger Einladungslink ist eine Bearbeitungsberechtigung für jeden Besitzer. Es gibt weiterhin keine individuellen Nutzerkonten, Teilnehmer-Sperrung, Lese-Rolle oder Ende-zu-Ende-Verschlüsselung. Der Betreiber des Relay kann Planinhalte sehen. Das Verlassen einer Sitzung widerruft fremde Links nicht.

Ein öffentlicher Betrieb benötigt weiterhin eine konkret geprüfte TLS-/Proxy-/Firewall-Konfiguration, Prozess- oder Containerlimits, Log-Redaktion für Raum-URLs und Zugangsdaten, Updates sowie einen Wiederherstellungs- und Lasttest. Worker sind keine Betriebssystem-Sandbox; ihre Speicherlimits decken nicht jede externe Allokation ab. Browser können eingehende WebSocket-Frames eines vollständig kompromittierten vertrauten Relay nicht vor deren Allokation begrenzen.

Die Tests verwenden lokale Chromium-Browser und Loopback-Verbindungen. Mobile Funknetze, lange Schlafphasen, andere Browser-Engines, reale öffentliche Netze und eine unabhängige Sicherheitsprüfung sind damit nicht abgedeckt. Bilder und eigene Mediendateien sind weiterhin ausdrücklich außerhalb des Preview-Umfangs. Browser-Speicher und der flüchtige Relay ersetzen keine portable Projektdatei.

Der [v3-Plan](collaboration-plan-v3.md) enthält die Startanleitung und die verbleibenden Funktions- und Infrastrukturarbeiten.
