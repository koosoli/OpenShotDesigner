# Gemeinsam arbeiten: Seite öffnen, starten, Link teilen

**Sitzungsersteller und Gäste brauchen keine Installation, kein zusätzliches Konto und keine Verbindungseinstellungen.** Der normale Start verwendet jetzt automatische Browser-Direktverbindungen. Die frühere Render-Anmeldung ist für diesen Weg nicht erforderlich.

Die App bleibt eine statische GitHub-Pages-Website. Vorhandene öffentliche Dienste vermitteln verschlüsselte Verbindungsnachrichten; der Plan selbst wird zwischen den Browsern übertragen. Dafür wird weder ein eigener Server auf einem Nutzer-PC noch ein zusätzlicher Hosting-Account angelegt.

## Eine Sitzung starten

1. Die App ab Version **1.6.1** im Browser öffnen und den gewünschten Plan laden.
2. Oben auf das Symbol mit **zwei Personen** klicken. Der Button heißt **Live collaboration**.
3. Enthält der Plan Bilder oder eigene Dateien, zuerst **Share without images** aktivieren. Die gemeinsame Kopie enthält dann keine Hintergründe, Storyboard-Frames und eigenen Lichtdateien; das Original behält sie vollständig. Danach **Start collaboration** anklicken. Für Pläne ohne Medien ist das Häkchen nicht nötig. **Private relay (optional)** geschlossen lassen.
4. Der Plan öffnet sich als separate lokale Kopie mit „shared plan“ im Titel. Das Original bleibt in der Projektbibliothek.
5. **Copy invite link** oben im geöffneten Panel anklicken und den Link an die gewünschten Gäste schicken. Falls die Zwischenablage nicht verfügbar ist, den ausgewählten Text aus **Invitation link** manuell kopieren.
6. Den Tab geöffnet lassen. **Waiting for participants** bedeutet, dass noch kein anderer Browser verbunden ist. **Live** erscheint, sobald Teilnehmer verbunden sind und die ausstehenden Änderungen bestätigt haben.

## Einer Sitzung beitreten

1. Den vollständigen Einladungslink im Browser öffnen.
2. Auf **Join session** klicken.
3. Im Dialog **Join shared floor plan?** nochmals **Join session** bestätigen.
4. Warten, bis der gemeinsame Plan erscheint. Ein gerade geöffnetes anderes Projekt bleibt als Original in der lokalen Bibliothek erhalten.
5. Zum ersten Test eine Schauspieler-Beschriftung ändern und im anderen Browser prüfen. Danach in Gegenrichtung testen.

Ein Gast benötigt keinen Startschlüssel, kein GitHub-Konto und kein Render-Konto. Es erscheint keine Kamera-/Mikrofonabfrage für die Plan-Synchronisation.

## Jetzt lokal ausprobieren

Wenn auf einem Entwickler-PC der lokale Editor läuft, kann der Direktmodus auch dort getestet werden. Das ist eine Entwicklungsmöglichkeit und keine Voraussetzung für Teilnehmer der veröffentlichten Website. Ein privater Test-Relay wird für den normalen Direktmodus nicht verwendet:

1. [Lokalen Editor öffnen](http://127.0.0.1:3000/) und wie oben **Start collaboration** wählen.
2. Den Link in einem zweiten Browserprofil oder einem anderen Browser **auf demselben PC** öffnen und beitreten.

Zwei gewöhnliche Tabs teilen sich teilweise Browser-Speicher. Getrennte Profile bilden zwei unabhängige Nutzer besser nach. Ein Privatfenster funktioniert ebenfalls; dessen Wiederherstellungskopie verschwindet üblicherweise mit dem privaten Browser-Speicher.

**Ein Link mit `127.0.0.1` oder `localhost` öffnet die App nur auf diesem PC.** Für andere PCs oder Handys die [GitHub-Pages-App](https://koosoli.github.io/OpenShotDesigner/) ab Version **1.6.0** benutzen und dort den Link erzeugen. Auch im Direktmodus muss der Empfänger die App-Dateien erreichen können. Die Versionsanzeige bestätigt den installierten Stand; ein Hosting-Konto für einen Relay wird nicht benötigt.

## Sitzung beenden, wiederkommen und mehrere Sitzungen

- **Leave session** beendet die eigene Verbindung und lässt die lokale Projektkopie geöffnet.
- Die übrigen Teilnehmer können ohne den ursprünglichen Sitzungsersteller weiterarbeiten, solange noch mindestens ein Teilnehmer den Plan hält und die Browser einander erreichen.
- Nach einer kurzen Unterbrechung werden lokale Änderungen beim Wiederverbinden abgeglichen. Die Anzeige nennt noch nicht übertragene Änderungen. Bei konkurrierenden Änderungen denselben Planbereich anschließend prüfen.
- Ein neuer Browser kann nur beitreten, wenn ein anderer Teilnehmer mit Planinhalt erreichbar ist. Die Verbindlungsdienste archivieren den Plan nicht. Ein bisheriger Teilnehmer mit lokalem Raum-Cache kann die Sitzung wiederbeleben.
- Eine neue Sitzung erhält einen neuen Link. Mehrere getrennte Sitzungen können parallel in getrennten Browserprofilen getestet werden. Pro Raum sind höchstens sechs Teilnehmer vorgesehen.
- Das Hinzufügen einer weiteren Szene beendet die Freigabe und bewahrt die geänderte Produktion lokal. Für eine andere Szene eine neue Sitzung starten.

Speichern/Exportieren erfolgt über die normale Projekt-Speicherfunktion. Gemeinsam sind ein Plan und seine Shots. Andere Produktionsmodule bleiben persönlich. **Undo** betrifft die eigenen gemeinsamen Änderungen.

## Datenschutz und Grenzen

Der Link enthält eine zufällige Bearbeitungsberechtigung. Nur an die gewünschten Teilnehmer weitergeben. Jeder Linkinhaber kann den Plan bearbeiten und eine Kopie behalten. Verlassen widerruft andere Links nicht; individuelle Sperren und Lese-Rollen sind nicht implementiert.

Die öffentlichen Dienste sehen Netzwerkadressen und verschlüsselte Verbindlungsnachrichten. Andere Teilnehmer können ebenfalls die für die Direktverbindung nötigen Netzwerkadressen sehen. Plan-Daten laufen über verschlüsselte WebRTC-Verbindungen; eingehende Plan-Updates werden zusätzlich geprüft.

Die Verbindlungsdienste sind fremde öffentliche Infrastruktur ohne zugesagte Verfügbarkeit. Manche Firmen-/Mobilnetze oder Browserrichtlinien blockieren Direktverbindungen. Der Preview hat keinen garantierten TURN-Fallback und kann deshalb nicht jede Netzwerkkombination zusichern. Das ist keine Installations- oder Kontoanforderung an den Sitzungsersteller. Scheitert die Verbindung, bleibt die lokale Projektkopie exportierbar.

## Wenn etwas nicht funktioniert

- **Kein „Copy invite link“ und eine rote Meldung zu Bildern:** Die Sitzung wurde noch nicht gestartet. **Share without images** aktivieren und erneut **Start collaboration** anklicken. Die Bilder bleiben im Original; nur die separate gemeinsame Kopie lässt sie weg.
- **Waiting for participants:** Den gleichen aktuellen Link im anderen Browser öffnen und den Beitritt bestätigen. Der Sitzungsersteller muss für den ersten Beitritt noch geöffnet sein.
- **Waiting for document:** Noch kein Teilnehmer mit Planinhalt ist erreichbar. Einen bisherigen Teilnehmer mit seiner Raumkopie beitreten lassen.
- **Connection services are unavailable:** Die öffentlichen Dienste sind gerade nicht erreichbar. Später erneut versuchen; eine Installation hilft hier nicht.
- **The browsers could not establish a direct connection:** Möglicherweise blockiert das Netz WebRTC. Mit einem anderen Netz gegenprüfen. Einen Erfolg über jede Firewall verspricht der Preview nicht.
- **Offline / Reconnecting:** Den Tab geöffnet lassen und wichtige Arbeit exportieren. Änderungen werden erst nach erfolgreicher Wiederverbindung mit anderen geteilt.

## Nur für Betreiber einer eigenen Infrastruktur

**Private relay (optional)** ist eine zusätzliche Betriebsart. Nur dort werden Relay-Adresse beziehungsweise Erstellungsschlüssel benötigt. Ein privat betriebener WebSocket-Relay erfordert zentrale Bereitstellung; die optionale Render-Vorlage und `VITE_COLLAB_RELAY_URL` gehören ausschließlich zu diesem Weg. Sie sind keine Voraussetzung für den normalen Start oder Beitritt.

Der aktuelle [v4-Plan](collaboration-plan-v4.md) und der [Direktmodus-Sicherheitsbericht](collaboration-direct-security-2026-10-30.md) beschreiben die neue Umsetzung. Die früheren Node-Relay-Berichte gelten weiterhin für die optionale private Betriebsart.
