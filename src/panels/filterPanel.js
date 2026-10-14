// Filter panel of one column: a "Values" tab (checkbox list) and a "Pattern"
// tab (operator + operands), as WAI-ARIA tabs.

import { el, segmentedEl } from "../ui/dom.js";
import { operatorsForType, operatorMeta, isActiveFilter } from "../core/filtering.js";
import { typeGroup, uid } from "../core/util.js";

/** @typedef {import("../core/i18n.js").Translations} Translations */
/** @typedef {import("../types.js").Filter} Filter */
/** @typedef {import("../types.js").PatternFilter} PatternFilter */
/** @typedef {import("../types.js").ValueFilter} ValueFilter */
/** @typedef {{ value: any, label: string, count: number }} DistinctValue */
/**
 * A tab body: its element, the control that takes focus, and the filter it describes.
 * @typedef {{ el: HTMLElement, focusTarget: HTMLElement, collect: () => Filter|null }} FilterBody
 */

// `filter`: the column's current filter or null. `values`: the column's
// distinct values ({ value, label, count }, see `distinctValues`).
// `onApply(filter)`: called with the new filter, or null to remove it.
/**
 * @param {{ t: Translations, column: import("../types.js").NormalizedColumn, filter: Filter|null,
 *     values: DistinctValue[], onApply: (filter: Filter|null) => void }} options
 */
export function buildFilterPanel({ t, column, filter, values, onApply }) {
    const group = typeGroup(column.type);
    let mode = filter ? filter.kind : (group === "text" ? "value" : "pattern");

    const panel = el("div", { class: "jw-dt-panel" });
    panel.appendChild(el("div", { class: "jw-dt-panel-head", text: t.filterPanelTitle(column.label) }));

    // Tabs: Left/Right/Home/End switch, one tab stop.
    const id = uid("jwdt-flt");
    const tabs = el("div", { class: "jw-dt-tabs", role: "tablist", "aria-label": t.filterMode });
    /**
     * @param {string} name
     * @param {string} text
     */
    const makeTab = (name, text) => el("button", {
        type: "button", class: "jw-dt-tab", role: "tab", id: `${id}-${name}-tab`,
        "aria-controls": `${id}-${name}`, text
    });
    const valueTab = makeTab("value", t.valuesTab);
    const patternTab = makeTab("pattern", t.patternTab);
    tabs.append(valueTab, patternTab);
    panel.appendChild(tabs);

    const bodyValue = valueFilter(t, values, filter);
    const bodyPattern = patternFilter(t, column, filter);
    for (const [name, body] of /** @type {[string, FilterBody][]} */ ([["value", bodyValue], ["pattern", bodyPattern]])) {
        body.el.id = `${id}-${name}`;
        body.el.setAttribute("role", "tabpanel");
        body.el.setAttribute("aria-labelledby", `${id}-${name}-tab`);
        panel.appendChild(body.el);
    }

    /** @param {Filter["kind"]} next */
    const setMode = (next, focusTab = false) => {
        mode = next;
        for (const [tab, body, name] of /** @type {[HTMLElement, FilterBody, string][]} */ ([[valueTab, bodyValue, "value"], [patternTab, bodyPattern, "pattern"]])) {
            const selected = next === name;
            tab.classList.toggle("is-active", selected);
            tab.setAttribute("aria-selected", String(selected));
            tab.tabIndex = selected ? 0 : -1;
            body.el.hidden = !selected;
            body.focusTarget.toggleAttribute("data-autofocus", selected);
            if (selected && focusTab) tab.focus();
        }
    };
    valueTab.addEventListener("click", () => setMode("value"));
    patternTab.addEventListener("click", () => setMode("pattern"));
    tabs.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "value"
            : event.key === "End" ? "pattern"
            : mode === "value" ? "pattern" : "value";
        setMode(next, true);
    });
    setMode(mode);

    const applyButton = el("button", {
        type: "button",
        class: "jw-dt-btn jw-dt-btn-primary",
        text: t.apply,
        onclick: () => onApply(mode === "value" ? bodyValue.collect() : bodyPattern.collect())
    });
    panel.appendChild(el("div", { class: "jw-dt-panel-actions" }, [
        el("button", { type: "button", class: "jw-dt-btn", text: t.reset, onclick: () => onApply(null) }),
        applyButton
    ]));

    // Enter in the value search, on a search-result option or in a pattern operand applies,
    // like a click on "Apply".
    /** @param {(target: HTMLInputElement) => boolean} isTarget */
    const applyOnEnter = (isTarget) => (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== "Enter" || e.isComposing || !isTarget(/** @type {HTMLInputElement} */ (e.target))) return;
        e.preventDefault();
        applyButton.click();
    };
    bodyValue.el.addEventListener("keydown", applyOnEnter((t) => t === bodyValue.focusTarget || t.type === "radio"));
    bodyPattern.el.addEventListener("keydown", applyOnEnter((t) => t.tagName === "INPUT"));
    return panel;
}

// Checkbox list of the distinct values with a search field.
/**
 * @param {Translations} t
 * @param {DistinctValue[]} values
 * @param {Filter|null} existing
 * @returns {FilterBody}
 */
function valueFilter(t, values, existing) {
    const container = el("div", { class: "jw-dt-filter-body" });
    const selected = new Set(
        existing && existing.kind === "value" ? existing.values.map((v) => String(v)) : values.map((v) => String(v.value))
    );

    // Searching works like Excel: the matches start out checked, and the
    // filter becomes either only the checked matches or (with "add") the
    // checked matches plus the selection from before the search. Clearing
    // the search restores that earlier selection.
    /** @type {Map<HTMLElement, boolean>|null} */
    let baseline = null;   // captured when a search starts
    /** @returns {HTMLElement[]} */
    const checkboxes = () => Array.from(list.querySelectorAll(".jw-dt-check"));
    /** @param {HTMLElement} label */
    const isVisible = (label) => label.style.display !== "none";
    /** @param {HTMLElement} label */
    const boxOf = (label) => /** @type {HTMLInputElement} */ (label.querySelector('input[type="checkbox"]'));
    const syncToggleAll = () => {
        const visible = checkboxes().filter(isVisible);
        toggleAllBox.checked = visible.length > 0 && visible.every((label) => boxOf(label).checked);
    };

    const search = el("input", {
        type: "search",
        class: "jw-dt-input",
        placeholder: t.searchValues,
        "aria-label": t.searchValues,
        oninput: (e) => {
            const q = e.currentTarget.value.trim().toLowerCase();
            if (q && !baseline) baseline = new Map(checkboxes().map((label) => [label, boxOf(label).checked]));
            checkboxes().forEach((label) => {
                const match = !q || (label.dataset.label ?? "").includes(q);
                label.style.display = match ? "" : "none";
                // Matches start checked; everything else keeps the earlier selection.
                if (baseline) boxOf(label).checked = (!!q && match) || !!baseline.get(label);
            });
            if (!q) baseline = null;
            toggleAllText.textContent = q ? t.selectAllResults : t.selectAll;
            searchMode.hidden = !q;
            syncToggleAll();
        }
    });
    container.appendChild(search);

    const toggleAllBox = el("input", {
        type: "checkbox",
        checked: selected.size === values.length,
        onchange: (e) => {
            checkboxes().forEach((label) => {
                if (isVisible(label)) boxOf(label).checked = e.currentTarget.checked;
            });
        }
    });
    const toggleAllText = el("span", { text: t.selectAll });
    container.appendChild(el("label", { class: "jw-dt-check jw-dt-check-all" }, [toggleAllBox, toggleAllText]));

    const list = el("div", { class: "jw-dt-check-list", onchange: () => syncToggleAll() },
        values.map((entry) => {
            const labelText = String(entry.label || t.emptyValue);
            return el("label", { class: "jw-dt-check", dataset: { label: labelText.toLowerCase(), value: String(entry.value) } }, [
                el("input", { type: "checkbox", checked: selected.has(String(entry.value)) }),
                el("span", { class: "jw-dt-check-label", text: labelText }),
                el("span", { class: "jw-dt-check-count", text: String(entry.count) })
            ]);
        }));
    container.appendChild(list);

    // Only shown while searching.
    const searchMode = segmentedEl(uid("jwdt-smode"), t.searchResultsMode, [
        ["replace", t.searchResultsOnly],
        ["add", t.searchResultsAdd]
    ], "replace");
    searchMode.classList.add("jw-dt-search-mode");
    searchMode.hidden = true;
    container.appendChild(searchMode);

    return {
        el: container,
        focusTarget: search,
        collect: () => {
            const add = !searchMode.hidden && /** @type {HTMLInputElement} */ (searchMode.querySelector('input[value="add"]')).checked;
            /** @type {any[]} */
            const chosen = [];
            checkboxes().forEach((label) => {
                const take = searchMode.hidden
                    ? boxOf(label).checked
                    : isVisible(label)
                        ? boxOf(label).checked || (add && baseline?.get(label))
                        : add && boxOf(label).checked;
                if (take) {
                    const original = values.find((v) => String(v.value) === label.dataset.value);
                    chosen.push(original ? original.value : label.dataset.value);
                }
            });
            // All selected = no filter.
            if (chosen.length === values.length || chosen.length === 0) return null;
            return { kind: "value", values: chosen };
        }
    };
}

// Operator select plus zero, one or two operand fields.
/**
 * @param {Translations} t
 * @param {import("../types.js").Column} column
 * @param {Filter|null} existing
 * @returns {FilterBody}
 */
function patternFilter(t, column, existing) {
    const container = el("div", { class: "jw-dt-filter-body" });
    const operators = operatorsForType(column.type);
    const current = existing && existing.kind === "pattern" ? existing : null;
    const group = typeGroup(column.type);
    const inputType = group === "number" ? "number"
        : group === "date" ? (column.type === "datetime" ? "datetime-local" : column.type === "time" ? "time" : "date")
        : "text";

    const operandWrap = el("div", { class: "jw-dt-operands" });
    const operand1 = el("input", { type: inputType, class: "jw-dt-input", value: current ? (current.operand ?? "") : "" });
    const operand2 = el("input", { type: inputType, class: "jw-dt-input", value: current ? (current.operand2 ?? "") : "" });
    const selectId = uid("jwdt-op");
    const arity = () => operatorMeta(column.type, select.value)?.arity ?? 1;

    const select = el("select", {
        class: "jw-dt-select",
        id: selectId,
        onchange: () => renderOperands()
    }, operators.map((op) => el("option", {
        value: op.id,
        text: t.operators[/** @type {keyof typeof t.operators} */ (op.id)] ?? op.label,
        selected: current && current.operator === op.id
    })));

    const renderOperands = () => {
        const n = arity();
        operand1.setAttribute("aria-label", n >= 2 ? t.operandFrom : t.operandValue);
        operand2.setAttribute("aria-label", t.operandTo);
        operandWrap.replaceChildren(...[operand1, operand2].slice(0, n));
    };
    renderOperands();

    container.append(
        el("label", { class: "jw-dt-field-label", for: selectId, text: t.condition }),
        select,
        operandWrap
    );

    return {
        el: container,
        focusTarget: select,
        collect: () => {
            const n = arity();
            /** @type {PatternFilter} */
            const filter = { kind: "pattern", operator: select.value, arity: n };
            if (n >= 1) filter.operand = operand1.value;
            if (n >= 2) filter.operand2 = operand2.value;
            return isActiveFilter(filter) ? filter : null;
        }
    };
}
