// i18n — UI strings and locale settings for jw-datatable.
//
// To add a new language:
//   1. Copy the "en" block, change the key to the BCP-47 language code (e.g. "fr")
//   2. Translate all string values and template functions
//   3. That's it — getTranslations("fr-FR") will pick it up automatically.
//
// String properties are plain strings.
// Function properties accept parameters for interpolation; they return a string.

/** @type {Record<string, object>} */
export const LOCALES = {

    // ------------------------------------------------------------------ English
    en: {
        // Toolbar
        searchPlaceholder: "Search…",
        searchAriaLabel: "Search table",
        clearFilters: "Clear all filters",
        filterCount: (n) => `Filter (${n})`,
        tableView: "Table view",
        gridView: "Grid view",
        showHideColumns: "Show or hide columns",
        viewTemplates: "View templates",
        exportCsv: "Export as CSV",

        // Column header
        sortHint: "Sort (Shift+click for multi-column)",
        filterActive: "Filter active — edit",
        filter: "Filter",
        copyValue: "Copy value",

        // Table body
        emptyData: "No data.",
        noResults: "No rows match the current filters.",

        // Footer / pagination
        pageInfo: (start, end, total) => `${start}–${end} of ${total}`,
        perPage: "per page:",
        rowsPerPage: "Rows per page",
        paginationAriaLabel: "Pagination",
        firstPage: "First page",
        prevPage: "Previous page",
        nextPage: "Next page",
        lastPage: "Last page",

        // Context menu
        sortAsc: "Sort ascending",
        sortDesc: "Sort descending",
        addSortKey: "Add as sort key (asc)",
        removeSortKey: "Remove sort for this column",
        filterByValue: (v) => `Filter by “${v}”`,
        excludeValue: (v) => `Exclude “${v}”`,
        openFilter: "Open filter…",
        clearColumnFilter: "Clear column filter",
        copyCell: "Copy cell",
        copyRow: "Copy row",
        copyColumn: "Copy column",
        hideColumn: "Hide column",

        // Filter panel
        filterPanelTitle: (label) => `Filter: ${label}`,
        valuesTab: "Values",
        patternTab: "Pattern",
        reset: "Reset",
        apply: "Apply",
        searchValues: "Search values…",
        selectAll: "Select all",
        selectAllResults: "Select all search results",
        searchResultsMode: "Search results",
        searchResultsOnly: "Show only these values",
        searchResultsAdd: "Add these values to the filter",
        emptyValue: "(empty)",
        condition: "Condition",

        // Column chooser panel
        columnsPanel: "Columns",

        // Templates panel
        templatesPanel: "View templates",
        templateNamePlaceholder: "Template name",
        save: "Save",
        noTemplates: "No templates saved yet.",
        loadTemplate: "Load template",
        deleteTemplate: "Delete template",

        // Accessibility: keyboard hints, accessible names, screen-reader announcements
        tableKeyboardHint: "Arrow keys move between cells, Enter opens a link, Shift+F10 opens the actions menu.",
        gridKeyboardHint: "Arrow keys move between cards, Shift+F10 opens the actions menu.",
        actionsFor: (label) => `Actions: ${label}`,
        pageN: (n) => `Page ${n}`,
        filterMode: "Filter type",
        operandValue: "Value",
        operandFrom: "From",
        operandTo: "To",
        resultsCount: (n) => (n === 1 ? "1 row" : `${n} rows`),
        sortedBy: (list) => `Sorted by ${list}`,
        sortCleared: "Sorting removed",
        ascending: "ascending",
        sortPriority: (n) => `, sort priority ${n}`,
        descending: "descending",
        copied: "Copied to clipboard",
        copiedValue: (value) => `Copied to clipboard: ${value}`,
        columnHidden: (label) => `Column “${label}” hidden`,
        templateSaved: (name) => `Template “${name}” saved`,
        templateLoaded: (name) => `Template “${name}” loaded`,

        // Boolean cell display (overridable per column via format.trueLabel / format.falseLabel)
        boolTrue: "Yes",
        boolFalse: "No",

        // Filter operator labels (keyed by operator id from filtering.js)
        operators: {
            contains: "contains",
            notContains: "does not contain",
            equals: "equals",
            notEquals: "does not equal",
            startsWith: "starts with",
            endsWith: "ends with",
            regex: "RegEx",
            empty: "is empty",
            notEmpty: "is not empty",
            gt: ">",
            gte: "≥",
            lt: "<",
            lte: "≤",
            between: "between",
            on: "on",
            before: "before",
            after: "after",
            isTrue: "is true",
            isFalse: "is false"
        }
    },

    // ------------------------------------------------------------------ German
    de: {
        // Toolbar
        searchPlaceholder: "Suchen…",
        searchAriaLabel: "Tabelle durchsuchen",
        clearFilters: "Alle Filter zurücksetzen",
        filterCount: (n) => `Filter (${n})`,
        tableView: "Tabellenansicht",
        gridView: "Rasteransicht",
        showHideColumns: "Spalten ein-/ausblenden",
        viewTemplates: "Ansichts-Vorlagen",
        exportCsv: "Als CSV exportieren",

        // Column header
        sortHint: "Sortieren (Umschalt+Klick für Mehrspaltigkeit)",
        filterActive: "Filter aktiv – bearbeiten",
        filter: "Filtern",
        copyValue: "Wert kopieren",

        // Table body
        emptyData: "Keine Daten vorhanden.",
        noResults: "Keine Treffer für die aktuelle Filterung.",

        // Footer / pagination
        pageInfo: (start, end, total) => `${start}–${end} von ${total}`,
        perPage: "pro Seite:",
        rowsPerPage: "Einträge pro Seite",
        paginationAriaLabel: "Seitennavigation",
        firstPage: "Erste Seite",
        prevPage: "Vorherige Seite",
        nextPage: "Nächste Seite",
        lastPage: "Letzte Seite",

        // Context menu
        sortAsc: "Aufsteigend sortieren",
        sortDesc: "Absteigend sortieren",
        addSortKey: "Als weiteres Kriterium (aufsteigend)",
        removeSortKey: "Sortierung dieser Spalte entfernen",
        filterByValue: (v) => `Nach „${v}“ filtern`,
        excludeValue: (v) => `„${v}“ ausschließen`,
        openFilter: "Filter öffnen…",
        clearColumnFilter: "Spaltenfilter zurücksetzen",
        copyCell: "Zelle kopieren",
        copyRow: "Zeile kopieren",
        copyColumn: "Spalte kopieren",
        hideColumn: "Spalte ausblenden",

        // Filter panel
        filterPanelTitle: (label) => `Filter: ${label}`,
        valuesTab: "Werte",
        patternTab: "Muster",
        reset: "Zurücksetzen",
        apply: "Anwenden",
        searchValues: "Werte durchsuchen…",
        selectAll: "Alle auswählen",
        selectAllResults: "Alle Suchergebnisse auswählen",
        searchResultsMode: "Suchergebnisse",
        searchResultsOnly: "Nur diese Werte anzeigen",
        searchResultsAdd: "Diese Werte zum Filter hinzufügen",
        emptyValue: "(leer)",
        condition: "Bedingung",

        // Column chooser panel
        columnsPanel: "Spalten",

        // Templates panel
        templatesPanel: "Ansichts-Vorlagen",
        templateNamePlaceholder: "Name der Vorlage",
        save: "Speichern",
        noTemplates: "Noch keine Vorlagen gespeichert.",
        loadTemplate: "Vorlage laden",
        deleteTemplate: "Vorlage löschen",

        // Accessibility: keyboard hints, accessible names, screen-reader announcements
        tableKeyboardHint: "Pfeiltasten wechseln zwischen Zellen, Enter öffnet einen Link, Umschalt+F10 öffnet das Aktionsmenü.",
        gridKeyboardHint: "Pfeiltasten wechseln zwischen Karten, Umschalt+F10 öffnet das Aktionsmenü.",
        actionsFor: (label) => `Aktionen: ${label}`,
        pageN: (n) => `Seite ${n}`,
        filterMode: "Filterart",
        operandValue: "Wert",
        operandFrom: "Von",
        operandTo: "Bis",
        resultsCount: (n) => (n === 1 ? "1 Zeile" : `${n} Zeilen`),
        sortedBy: (list) => `Sortiert nach ${list}`,
        sortCleared: "Sortierung entfernt",
        ascending: "aufsteigend",
        sortPriority: (n) => `, Sortierpriorität ${n}`,
        descending: "absteigend",
        copied: "In die Zwischenablage kopiert",
        copiedValue: (value) => `In die Zwischenablage kopiert: ${value}`,
        columnHidden: (label) => `Spalte „${label}“ ausgeblendet`,
        templateSaved: (name) => `Vorlage „${name}“ gespeichert`,
        templateLoaded: (name) => `Vorlage „${name}“ geladen`,

        // Boolean cell display
        boolTrue: "Ja",
        boolFalse: "Nein",

        // Filter operator labels
        operators: {
            contains: "enthält",
            notContains: "enthält nicht",
            equals: "ist gleich",
            notEquals: "ist ungleich",
            startsWith: "beginnt mit",
            endsWith: "endet mit",
            regex: "RegEx",
            empty: "ist leer",
            notEmpty: "ist nicht leer",
            gt: ">",
            gte: "≥",
            lt: "<",
            lte: "≤",
            between: "zwischen",
            on: "am",
            before: "vor",
            after: "nach",
            isTrue: "ist wahr",
            isFalse: "ist falsch"
        }
    }
};

/**
 * Canonical locale codes and their human-readable display names.
 * This is the single source of truth for which locales are available in UI pickers.
 * Keys are BCP-47 locale strings suitable for `config.locale`; values are display labels.
 * Add a new entry here whenever you add a new language bundle to LOCALES above.
 */
export const LOCALE_NAMES = {
    "en-US": "English",
    "de-DE": "Deutsch"
};

/**
 * Returns the best-matching translation bundle for a locale string.
 * Resolution order: exact key → language prefix → "en" fallback.
 *
 * Examples:
 *   "de-DE"  → LOCALES.de
 *   "de-AT"  → LOCALES.de
 *   "de"     → LOCALES.de
 *   "fr-FR"  → LOCALES.en  (not yet defined → English fallback)
 *   "en-US"  → LOCALES.en
 *
 * @param {string} locale  BCP-47 locale string, e.g. "de-DE" or "en-US"
 * @returns {typeof LOCALES["en"]}
 */
export function getTranslations(locale = "en-US") {
    const key = String(locale);
    if (LOCALES[key]) return LOCALES[key];
    const lang = key.split("-")[0].toLowerCase();
    return LOCALES[lang] ?? LOCALES.en;
}
