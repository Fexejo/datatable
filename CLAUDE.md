# CLAUDE.md

`<jw-datatable>`: wiederverwendbare Data-Table als Web Component in Vanilla JS
(ES-Module, Shadow DOM). Wird als einfacher Ordner in verschiedene Projekte
kopiert und per `import` eingebunden.

## Grundregeln

- **Kein npm, kein Build-Schritt, keine Abhängigkeiten.** Kein `package.json`,
  kein `node_modules`, keine Bundler/Transpiler. Jede Datei ist ein natives
  ES-Modul, das der Browser direkt lädt. Imports immer relativ mit `.js`-Endung.
- **README.md ist die einzige Entwickler-Doku.** Jede Änderung an öffentlicher
  API, Config, Spalten-Optionen, Events, Features, CSS-Variablen/Parts, i18n
  oder Accessibility-Verhalten wird im selben Zug in der README nachgezogen.
  Keine zusätzlichen Doku-Dateien anlegen.
- **WCAG 2.2 AA ist Pflicht.** Jede UI-Änderung muss per Tastatur bedienbar
  sein, sichtbaren Fokus haben, korrekte Rollen/Namen/Zustände (ARIA) tragen,
  Fokus sinnvoll verwalten (Overlays öffnen → Fokus hinein, schließen → Fokus
  zurück zum Auslöser), ausreichende Kontraste (4.5:1 Text, 3:1 UI) einhalten
  und Touch-Ziele ≥ 44px behalten. Rechtsklick/Long-Press-Funktionen brauchen
  ein Tastatur-Äquivalent.
- Sprache im Code, Kommentaren und README: Englisch. UI-Texte nie hart
  codieren, sondern über `i18n.js` (alle Sprachen pflegen: `en`, `de`).

## Aufbau

| Datei | Rolle |
|-------|-------|
| `datatable.js` | Öffentlicher Einstieg: registriert `<jw-datatable>`, exportiert `createDataTable()` u. a. |
| `jwDataTable.js` | Die Web Component (State, Rendering, Interaktion, Overlays, Responsive) |
| `formatters.js` | Typabhängige Anzeige (`formatValue`, `toText`) |
| `comparators.js` | Sortierung inkl. Multi-Sort |
| `filtering.js` | Wert-/Musterfilter, Operatoren, Distinct-Werte |
| `csv.js` | CSV bauen & herunterladen |
| `templateStore.js` | Vorlagen-Speicher + `LocalStorageAdapter` |
| `contextMenu.js` | Kontextmenü (Rollen `menu`/`menuitem`) |
| `styles.js` | Shadow-DOM-CSS als String (Mobile First, Breakpoint 640px) |
| `i18n.js` | UI-Texte pro Sprache, `getTranslations(locale)` |
| `icons.js` | Lucide-Icons (siehe unten) |
| `util.js` | Reine Hilfsfunktionen (`getCellValue`, `typeGroup`, …) |
| `columns.js` | Spalten-Inferenz aus Daten |
| `demo.html` | Spielwiese mit allen Features |

Konventionen: CSS-Klassen-Präfix `k-dt-` (Kontextmenü `k-ctx-`), Design-Tokens
`--k-*` mit Fallbacks, Events `jw-datatable:<name>` (`bubbles` + `composed`),
private Methoden mit `_`-Präfix, DOM-Aufbau über den `el()`-Helper in
`jwDataTable.js`. Die Module außer `jwDataTable.js`/`contextMenu.js` sind
DOM-frei bzw. DOM-arm und sollen es bleiben (testbar in Node).

## Icon-Workflow (Lucide)

Alle Icons in `icons.js` sind echte Lucide-Icons, der Key ist **exakt der
kanonische Lucide-Name** (kebab-case, z. B. `"trash"`, `"list-filter"`). Keine
selbst gezeichneten Icons, keine Aliase, kein Custom Element, keine
`.svg`-Dateien, kein Inline-SVG im Code.

1. SVG abrufen: `curl -sSL https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/<icon-name>.svg`.
   Bei 404 den Namen auf https://lucide.dev/icons prüfen, nicht raten. Ob ein
   Name kanonisch ist, zeigt `lucide-static@latest/tags.json` (enthält nur
   kanonische Namen; Aliase wie `trash-2` oder `filter` fehlen dort).
2. Nur den Inhalt des `<svg>` übernehmen (path/circle/rect/…), ohne
   `<svg>`-Rahmen und Lizenzkommentar, in einer Zeile.
3. In `ICONS` in `icons.js` unter dem Lucide-Namen eintragen, falls nicht vorhanden.
4. Verwenden über `createIcon("name")` (liefert ein `SVGSVGElement`, dekorativ
   mit `aria-hidden`), in `jwDataTable.js` über `iconEl("name", className?)`,
   im Kontextmenü über `icon: "name"`. Icon-only-Buttons brauchen immer ein
   `aria-label` aus `i18n.js`.
5. Wird ein neues Icon gebraucht, beim Nutzer nachfragen welches, nicht raten.
6. Ungenutzte Icons aus `ICONS` entfernen.

## Lokal ausführen & testen

ES-Module brauchen HTTP (nicht `file://`):

```bash
python3 -m http.server 8000   # dann http://localhost:8000/demo.html
```

Verfügbare Werkzeuge (ohne npm): Node 24 (`node --test`, eingebautes
`WebSocket`), Python 3, `curl`, headless Chromium aus dem Playwright-Cache:

```bash
CHROME=$(find ~/.cache/ms-playwright -name chrome-headless-shell -type f | head -1)
"$CHROME" --no-sandbox --window-size=1280,900 --virtual-time-budget=3000 \
  --screenshot=/tmp/demo.png http://localhost:8000/demo.html
```

- Syntaxcheck aller Module: `for f in *.js; do node --check "$f"; done`
- Reine Module (`util`, `comparators`, `filtering`, `formatters`, `csv`,
  `columns`, `i18n`, `templateStore`) lassen sich direkt in Node importieren.
- Für UI-/A11y-Prüfung: headless Chromium per `--remote-debugging-port` und
  CDP über Nodes eingebautes `WebSocket` steuern (kein Playwright-Paket nötig).
