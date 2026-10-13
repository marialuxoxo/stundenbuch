# Stundenbuch

Zeiterfassung nach Projekten als installierbare Web-App (PWA). Läuft komplett im Browser, ohne Server und ohne Konto. Funktioniert auch offline.

## Funktionen

- **Projekte** mit Farbe und optionalem Stundensatz, archivierbar
- **Stempeluhr**: Projekt wählen, Tätigkeit eintragen, Start/Stopp. Die Uhr läuft weiter, auch wenn die App geschlossen wird.
- **Zeit nachtragen** und Einträge bearbeiten oder löschen (auch über Mitternacht)
- **Tagesverlauf**: 24-Stunden-Streifen pro Tag zeigt, wann woran gearbeitet wurde
- **Auswertung** für Tag, Woche (mit KW) und Monat: Stunden je Projekt in h:mm und dezimal, Betrag bei hinterlegtem Stundensatz
- **CSV-Export** (Semikolon, deutsches Zahlenformat, öffnet direkt in Excel)
- **Backup** als JSON-Datei speichern und laden, z. B. um Daten auf ein anderes Gerät mitzunehmen

## Daten

Alle Daten liegen im `localStorage` des Browsers auf dem jeweiligen Gerät. Sie werden nicht hochgeladen. Wer die Browserdaten löscht, löscht auch die Zeiten, deshalb regelmäßig ein Backup speichern.

## Lokal starten

Service Worker brauchen `http(s)`, also nicht einfach `index.html` per Doppelklick öffnen:

```sh
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Veröffentlichen

Es sind nur statische Dateien. Jedes statische Hosting funktioniert, z. B. GitHub Pages (Settings → Pages → Branch `main`, Ordner `/`), Netlify oder Cloudflare Pages.

Nach Änderungen an App-Dateien `CACHE_VERSION` in `sw.js` hochzählen.
