# Sicherheitsnachprüfung: kontofreier Direktmodus

30. Oktober 2026 · Ergänzung zum [zweiten Audit](collaboration-second-audit-2026-10-30.md) für die neue Standardverbindung aus [Plan v4](collaboration-plan-v4.md).

## Geprüftes Ziel und Abgrenzung

Sitzungsersteller und Gäste benötigen keine Installation, kein zusätzliches Konto und keine Hosting- oder Verbindungskonfiguration. Der aktuelle Standard verwendet vorhandene öffentliche Vermittlungsdienste und WebRTC. Der zuvor geprüfte Node-WebSocket-Relay bleibt ausschließlich eine optionale private Betriebsart.

Diese Prüfung betrifft die eigene Einladung, Vermittlung, Transportbestätigungen, Eingangsbegrenzungen und die Verbindung zum bestehenden Projektmodell. Zusätzlich wurde der relevante installierte Trystero-Quellcode für Passwort-/SDP-Verarbeitung, Reassemblierung, Chunkgrößen, Pending-Transfers, Peer-Lebenszyklus und Standard-ICE-Adressen gelesen. Das ist keine unabhängige vollständige Zertifizierung dieser Fremdbibliothek, der Browser oder der öffentlichen Dienstbetreiber.

## Schutzmaßnahmen und gefundene Fehler

| Bereich/Befund | Umsetzung und Nachweis |
| --- | --- |
| Einladungen dürfen keine Betreiber-Anmeldung voraussetzen oder beliebige Vermittlungsziele einschleusen | Die Einladung enthält nur den festen Versionsbezeichner `webrtc:nostr:v1` und ein mit `crypto.getRandomValues` erzeugtes 256-Bit-Geheimnis im Fragment. Zusätzliche Felder und Relay-Tickets werden bei diesem Format abgewiesen. Öffentliche private-Relay-Einladungen unterliegen weiterhin ihrer bisherigen Endpunktbindung und Signaturprüfung. |
| Öffentliche Vermittlungsdienste sollen weder Raumgeheimnis noch Plan erhalten | Der öffentliche Raumname wird aus dem Geheimnis gehasht. Die komplette Vermittlungsnachricht einschließlich Peer-Ankündigung wird mittels WebCrypto AES-256-GCM versiegelt; zufälliger 96-Bit-IV, topicgebundene zusätzliche Daten, Zeitfenster und begrenzte Wiederholungsmerker. Trystero verwendet zusätzlich das Raumgeheimnis für verschlüsselte SDP und seinen Passwort-Handshake. Plandaten gehen über WebRTC-Datenkanäle. |
| Ein fremder Vermittler darf die Anwendung nicht mit beliebigen WebSocket-/SDP-Daten fluten | Die drei festen Endpunkte werden über einen eigenen begrenzten Client angesprochen. Nachrichtengröße, Nachrichten-/Byte-Rate, Kryptowarteschlange und ausstehende Sendungen sind begrenzt. Ungültiges Ciphertext erreicht den WebRTC-Signalparser nicht. Nur bekannte, flache Signal-Felder und 20-stellige alphanumerische Peer-IDs werden weitergegeben. Es werden höchstens 32 unterschiedliche Vermittlungsidentitäten während einer Sitzung zugelassen. |
| Unbegrenzte Plan-Reassemblierung oder automatische Anwendung unzuverlässiger Yjs-Daten | Trysteros Empfangsbudget wird auf den maximalen Plan-Paketumfang abgesenkt; übergroße Transfers, fremde Absender und zusätzliche Metadaten werden vor Plan-Reassemblierung abgewiesen. Die Bibliothek verwaltet kein Yjs-Dokument. Erst der bestehende Validierungsworker prüft ein empfangenes Update, dann wird es angewendet. |
| Mesh-Kopien konnten unnötig oft validiert werden | Der Transport dedupliziert über SHA-256. Neue Empfangsbestätigungen entstehen ausschließlich für bereits bestätigte oder gerade erfolgreich geprüfte Payloads. Ein Duplikat eines noch ungeprüften Updates wartet auf dessen Prüfung. Die Merker haben feste Obergrenzen. |
| **Korrigierter Fehler:** derselbe Absender konnte eine wartende Sequenznummer mit geändertem Payload wiederverwenden und dadurch die Zuordnung einer Bestätigung verschieben | Für eine noch ausstehende Sequenz ist der Payload-Digest unveränderlich. Bei Wiederverwendung mit anderem Inhalt wird die Peer-Verbindung geschlossen. Der neue Regressionstest weist nach, dass die Bestätigung des ersten Payloads den zweiten nicht als geprüft markiert. Der Validierungsworker blieb auch vorher für die tatsächliche Anwendung vorgeschaltet; korrigiert wurde die Bestätigungszuordnung. |
| **Korrigierter Fehler:** nach Offline/Online konnten alte warme WebRTC-Verbindungen der Bibliothek eine neue Transportinstanz behindern | Verlassen schließt neben der logischen Raumzugehörigkeit auch die physischen Peer-Verbindungen dieses Adapters. Vermittlungssockets, eigene Timer und Sendungen werden beendet. Begrenzte Wiederankündigungen unterstützen die neue Verbindung. Der zuvor fehlgeschlagene echte Drei-Browser-Offline-Fall besteht nach der Korrektur. |
| Falsche Erfolgsmeldung ohne empfangenden Teilnehmer | Ohne Peer bleibt der Seed lokal und unbestätigt. Die Oberfläche zeigt **Waiting for participants**. Ein ACK aus einem fremden Peer oder für eine andere Sequenz bestätigt keine Änderung. Im Direktmodus bedeutet ein ACK Prüfung/Annahme durch den empfangenden Browser, keine garantierte Speicherung auf dessen Datenträger. |
| Fehlende Browser-Funktionen dürfen keine endlose technische Fehlerschleife erzeugen | Der Direkttransport verlangt WebRTC und WebCrypto in einem geeigneten sicheren Kontext und liefert sonst eine verständliche Fehlermeldung. HTTPS-GitHub-Pages und Loopback-Entwicklung sind die vorgesehenen Umgebungen. |
| Abgebrochene Handshakes dürfen nicht dauerhaft alle Teilnehmerplätze belegen | Nicht aktive Reservierungen werden nach dem Handshake-Zeitfenster wieder freigegeben. Ein zusätzlicher Test belegt, dass nach fünf abgebrochenen Versuchen wieder ein neuer Teilnehmer zugelassen wird. Die aktive Teilnehmergrenze wird beim eigentlichen Beitritt nochmals geprüft. |

Der vorhandene Schutz für unveränderliche Seeds, geschlossene Projektschemas, SVG-Eingaben, Komplexität, Größen, getrennte lokale Projektidentität, gleichzeitige React-Aktionen, selektives Undo und geprüfte Wiederherstellung bleibt in beiden Transportarten bestehen.

## Konkrete Grenzen

- Höchstens sechs zugelassene Teilnehmer aus Sicht eines Browsers; höchstens fünf entfernte aktive beziehungsweise reservierte Teilnehmer. Der Direktmodus besitzt keinen zentralen, manipulationssicheren globalen Teilnehmerzähler über eventuell getrennte Netze hinweg.
- Maximal 2 MiB Yjs-Update/History und 2.000 Modellobjekte wie bisher. Plan-JSON/Base64 hat einen begrenzten Paketrahmen. Trysteros eigenes Empfangsbudget entspricht diesem Paketrahmen; die anschließende Session-Warteschlange ist zusätzlich auf 32 Nachrichten und 24 MiB Text begrenzt.
- Neue Payload-Digests werden mit höchstens 16 parallelen Hashvorgängen und einem Textbudget von 24 MiB bearbeitet. Höchstens 32 Prüfzuordnungen und 512 bestätigte Digests werden gehalten.
- Ein Peer darf höchstens 1.000 Aktionsnachrichten und 16 MiB deklarierte Nutzdaten je 10 Sekunden senden. Das schließt Bestätigungen ein und ist eine Schutzgrenze, keine Zusage, dass Last an jeder Grenze flüssig verarbeitet wird.
- Ein Vermittlungssocket akzeptiert höchstens 128 KiB pro Text-Frame, 200 Nachrichten und 2 MiB Text pro 10 Sekunden. Ein versiegelter Inhalt ist auf 96 KiB beschränkt. Die gesamte Vermittlungs-Kryptowarteschlange umfasst höchstens 16 Nachrichten und 1 MiB Text. Ein Dienst, der diese Schranken verletzt, wird getrennt.
- Empfangene Vermittlungsnachrichten müssen zum Topic passen, authentisch entschlüsselbar und höchstens zwei Minuten vom lokalen Zeitstand entfernt sein. 1.024 begrenzte Nonce-Merker verhindern unmittelbare Wiederholungen; die Zeitgrenze begrenzt ältere Wiederholungen. Stark verstellte Geräteuhren können den Beitritt verhindern.
- Browser können einen vom Netz bereits angelieferten übergroßen WebSocket-Frame nicht vor dessen browserinterner Allokation begrenzen. Ein Grenzwert im JavaScript-Handler ersetzt keine Browser-/OS-Speicherisolation. Datenkanäle und Fremdbibliotheken bleiben Teil der Angriffsfläche.

## Datenschutz und Vertrauen

Öffentliche Dienste sehen Netzwerkadressen und versiegelte Vermittlungsereignisse. Standard-STUN-Anfragen der verwendeten Bibliothek gehen an Google-/Cloudflare-STUN-Endpunkte. Direkt verbundene Teilnehmer erfahren die für WebRTC benötigten Netzwerkadressen. Die Anwendung fordert für diesen Datenabgleich keinen Kamera- oder Mikrofonzugriff an.

Ein Linkinhaber darf bearbeiten und Kopien behalten. Es gibt im Direktmodus keine zentrale serverseitige Ticketablaufprüfung, individuelle Sperrung, Lese-Rolle oder erzwungene Löschung fremder Kopien. Eine neue Sitzung erzeugt ein neues unabhängiges Geheimnis. Eine kompromittierte Website, Browser-Erweiterung, Teilnehmer-Maschine oder ein gestohlener Link liegt außerhalb dessen, was Transportverschlüsselung lösen kann.

Ein privater Relay folgt weiterhin dem strengeren Betreiber-/Ticketmodell des [ersten Sicherheitsberichts](collaboration-security-2026-10-30.md). Dessen Aussagen über lesbare Relay-Planinhalte und signierte Ablaufzeiten sind transportabhängig und dürfen nicht mit dem Direktmodus verwechselt werden.

## Verifikation

Geprüft unter Windows mit Node 24.22.1, Vitest 5.0.3 und Playwright 1.63.0.

| Prüfung | Ergebnis |
| --- | --- |
| Vollständige Unit-/Integration-Suite | **2.954 Tests in 252 Dateien bestanden** |
| Collaboration-Anteil dieser Suite | **88 bestanden**; einschließlich neuer Cipher-, Discovery-, Bestätigungs-, Sequenzkonflikt-, Handshake- und kontofreier Lifecycle-Fälle |
| Produktions-Browserfälle unter `/OpenShotDesigner/` | **13 unterschiedliche Fälle bestanden**: neun für den optionalen privaten Transport und bisherige Sicherheits-/PDF-Funktionen, drei Direktmodus-Varianten und ein großer Direkttransfer |
| Echter öffentlicher Vermittlungsdienst | Drei getrennte Chromium-Profile, keine Betreiber-Zugangsdaten; Start, späterer Beitritt, Änderungen, Weiterarbeit ohne Ersteller und Offline/Wiederverbindung bestanden |
| Öffentliche App-Origin ohne Relay-Konfiguration | Unter simulierter `https://koosoli.github.io`-Origin bestanden; im Live-Fall sprechen die Browser dabei echte öffentliche Vermittlungsdienste an |
| Chunking und Folgebearbeitung | Ein Plan mit **1.000 Schauspielerobjekten** wurde über echte WebRTC-Kanäle übertragen; anschließend kam auch eine neue Szenennamensänderung an |
| Produktions-Service-Worker und Offline-Neustart | Bestehender Offline-Neustartfall erneut bestanden |
| TypeScript, ESLint, Encoding, Command-Ratchet und Diff-Whitespace | Bestanden |
| Pages-Produktionsbuild und Einstiegspaket | Bestanden; **370,0 KiB**, unter dem 420.000-Byte-Budget |
| Vollständiger Abhängigkeits-Audit nach Hinzufügen der Transportbibliotheken | **0 gemeldete bekannte Sicherheitslücken** |

Die deterministischen Fälle ersetzen nur den Vermittlungsdienst durch einen Testdienst; die Planverbindungen sind tatsächliche WebRTC-Verbindungen. Die Tests prüfen außerdem, dass weder das Einladungsschlüssel-Geheimnis noch die Planbeschriftung im Klartext über die Vermittlungssockets geschickt werden. Der normale CI-Lauf verwendet diese deterministischen Fälle. Der zusätzliche Live-Test wird gezielt mit `COLLAB_PUBLIC_DISCOVERY_TEST=1` aktiviert, damit Ausfälle fremder öffentlicher Dienste gewöhnliche CI-Ergebnisse nicht verfälschen.

Reproduzierbare Browserprüfung: `COLLAB_TEST_BASE_URL=http://127.0.0.1:4173/OpenShotDesigner/` und `COLLAB_PUBLIC_DISCOVERY_TEST=1` setzen, den Pages-Build als Vorschau auf Port 4173 starten und `playwright test e2e/collaboration.spec.ts e2e/direct-collaboration.spec.ts --workers=1` ausführen.

## Verbleibende Betriebsgrenzen

Die öffentlichen Vermittlungsdienste können ausfallen, Bedingungen/Ratenlimits ändern oder diese App ablehnen. Mehrere feste Dienste reduzieren die Abhängigkeit von einem einzelnen Endpunkt, schaffen aber keine Verfügbarkeitszusage. Ohne ergänzenden TURN-Relay ist nicht jede NAT-/Firewall-Kombination erreichbar. Der automatische Modus verlangt dennoch keine Installation oder Konfiguration beim Sitzungsersteller.

Ein Live-Test zwischen Browserprofilen auf demselben PC verwendet zwar öffentliche Vermittlung, prüft aber nicht die NAT-Wege zwischen zwei realen Geräten in unterschiedlichen Netzen. Ein simuliertes Pages-Frontend verwendet den lokal gebauten App-Code unter einer öffentlichen HTTPS-Origin; es ist kein Nachweis für ein bereits erfolgtes GitHub-Deployment.

Quellen für die verwendeten Protokolle und Bibliotheksverträge: [Trystero-Dokumentation und Quellcode](https://github.com/dmotz/trystero), [WebRTC-Verbindungsaufbau](https://webrtc.org/getting-started/peer-connections), [TURN und eingeschränkte Erreichbarkeit](https://webrtc.org/getting-started/turn-server). Die zusätzlichen eigenen Schranken und Testergebnisse sind Befunde dieses Arbeitsstands, keine Zertifizierung durch diese Projekte.
