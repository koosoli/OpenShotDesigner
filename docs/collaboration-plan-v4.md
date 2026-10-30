# Collaboration v4 — GitHub Pages ohne Installation, Konto oder Hosting-Konfiguration

30. Oktober 2026 · Weiterentwicklung des [v3-Plans](collaboration-plan-v3.md) nach der präzisierten Anforderung.

## Verbindliches Nutzerziel

Sitzungsersteller und Gäste öffnen nur die Website, starten beziehungsweise bestätigen eine Sitzung und teilen einen Link. Niemand muss dafür Serversoftware installieren, einen Relay betreiben, ein zusätzliches Hosting-Konto eröffnen oder Verbindungseinstellungen eintragen. Die App bleibt auf GitHub Pages.

## Umsetzung

Der Standard ist ein WebRTC-Mesh mit bestehenden öffentlichen Verbindlungsdiensten. `@trystero-p2p/core` übernimmt WebRTC, Chunking, Passwort-Handshake und begrenzte Reassemblierung. Der Nostr-Adapter liefert die standardkonforme Signierung von Vermittlungsereignissen. Ein eigener kleiner, begrenzter Vermittlungsadapter schützt die Anwendung zusätzlich vor übergroßen/zu vielen öffentlichen WebSocket-Nachrichten.

Der Link enthält im URL-Fragment ein kryptographisch zufälliges 256-Bit-Geheimnis. Der öffentlich verwendete Raumname wird daraus mit SHA-256 abgeleitet. Die gesamte Vermittlungsnachricht einschließlich Peer-Ankündigungen wird zusätzlich mittels WebCrypto AES-GCM mit zufälligem 96-Bit-IV und topicgebundenen zusätzlichen Daten verschlüsselt. Trystero nutzt das Raumgeheimnis außerdem für seine verschlüsselten SDP-Nachrichten und seinen Passwort-Handshake. Fremde Vermittlungsdienste erhalten das Geheimnis und den Plan nicht.

Feste, im Programm hinterlegte Nostr-Endpunkte vermitteln nur Verbindungen. Einladungen können keine anderen Endpunkte oder ICE-Adressen einschleusen. Die eigentliche Plansynchronisierung läuft über verschlüsselte Browser-Verbindungen. Der vorhandene Yjs-Feldvertrag, Worker-Validierung, lokale Wiederherstellung, separate Projektidentität und selektives Undo bleiben bestehen.

## Sicherheit und Abgleich

- Eingehende Plan-Updates werden vor Anwendung im vorhandenen Browserworker geprüft. Keine Trystero-interne Yjs-Autoanwendung.
- Nachrichten haben einen begrenzten Empfangs-/Reassembly-Budgetrahmen. Erst ein erfolgreich geprüftes Update erhält eine Anwendungsbestätigung.
- SHA-256-Deduplizierung verhindert, dass dieselbe Mesh-Kopie mehrfach durch den Validierungsworker läuft. Kopien eines noch nicht bestätigten Updates werden erst nach dessen erfolgreicher Prüfung bestätigt.
- Netzwerkänderungen können weitergegeben werden, damit auch indirekt verbundene Teilnehmer abgleichen können. Ein Yjs-No-op löst keine weitere Änderungsübertragung aus.
- Maximal fünf entfernte Teilnehmer pro Browser werden vor Anwendungsfreigabe zugelassen; ausstehende Vermittlungsidentitäten und Kryptoverarbeitung sind zusätzlich begrenzt.
- Verlassen/Offline schließt physische Peer-Verbindungen und Vermittlungssockets. Kurze wiederholte Ankündigungen ermöglichen anschließende Wiederverbindungen ohne alte warme Transportinstanzen.
- Keine Passwörter, API-Schlüssel, privaten Hosting-Konten oder Zertifikate müssen Nutzer konfigurieren. Einladungen bleiben Bearbeitungsberechtigungen; individuelle Widerrufe und Rollen sind nicht vorgesehen.

## Bedienung und Bereitstellung

**Start collaboration → Copy invite link → Gast öffnet Link → Join session → bestätigen.** Die [deutsche Klickanleitung](collaboration-start-guide-de.md) ist die aktuelle Nutzeranleitung. Die vorherige Render-Anmeldungsanforderung entfällt für diesen Standardweg.

Ein normaler Pages-Build enthält den Direktmodus bereits ohne `VITE_COLLAB_RELAY_URL`. Die vorhandene Pages-Veröffentlichung muss einmal den geänderten App-Code bereitstellen. Das ist ein gewöhnliches Website-Update durch den Projektbetreiber und keine Einrichtung durch den Ersteller jeder Multiplayer-Sitzung.

Der bisherige WebSocket-Relay bleibt als ausdrücklich optionale private Betriebsart hinter **Private relay (optional)** erhalten. Seine strengeren Betreiber-/Signaturanforderungen gelten nur, wenn dieser Weg gezielt gewählt wird. Der optionale Render-Blueprint ist kein Standard-Erfordernis und wurde nicht bereitgestellt.

## Nachweise und ehrliche Grenzen

Ein echter Live-Test mit drei getrennten Chromium-Profilen hat bestehende öffentliche Nostr-Dienste und echte WebRTC-Kanäle verwendet. Erstellung, Beitritt, späterer Beitritt, Änderungen, Weiterarbeit nach Schließen des ursprünglichen Erstellers sowie Offline/Wiederverbindung wurden dabei geprüft. Zusätzlich laufen deterministische CI-Fälle mit simuliertem Vermittlungsdienst, aber tatsächlichen WebRTC-Planverbindungen; auch ein simuliertes öffentliches HTTPS-Frontend ohne Relay-Konfiguration ist abgedeckt. Der [Sicherheitsbericht](collaboration-direct-security-2026-10-30.md) hält den abschließenden Prüfstand fest.

Die Vermittlungsdienste sind externe öffentliche Infrastruktur, kein zugesichertes Hosting-Angebot dieser App. Sie können ausfallen, Ratenlimits ändern oder Verbindungen ablehnen. Ohne einen ergänzenden TURN-Dienst lässt sich WebRTC nicht für jede Firewall-/NAT-Kombination garantieren. Kontofreier Start ist implementiert; universelle Internet-Erreichbarkeit oder Verfügbarkeit wird nicht behauptet.

Die Tests mit mehreren Profilen liefen auf einem PC. Das ersetzt keinen Test zwischen tatsächlichen Geräten in verschiedenen Netzen und keinen unabhängigen Penetrationstest. Ein GitHub-Pages-Build beziehungsweise eine simulierte öffentliche Origin ist auch kein Beleg für ein bereits erfolgtes öffentliches Deployment.

Die weiteren Preview-Grenzen bleiben: ein Plan, höchstens 2.000 Objekte und 2 MiB CRDT-History, sechs Teilnehmer, keine Bild-/Custom-Mediendateien. Alle Browser können eine Kopie behalten; ohne geöffneten oder wiederkehrenden Datenhalter gibt es keinen zentralen Planarchiv-Server. Exporte bleiben wichtig.
