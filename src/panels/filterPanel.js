// Filter panel of one column: a "Values" tab (checkbox list) and a "Pattern"
// tab (operator + operands), as WAI-ARIA tabs.

import { el, segmentedEl } from "../ui/dom.js";
import { operatorsForType, operatorMeta, isActiveFilter } from "../core/filtering.js";
import { typeGroup, uid } from "../core/util.js";

// `filter`: the column's current filter or null. `values`: the column's
// distinct values ({ value, label, count }, see `distinctValues`).
// `onApply(filter)`: called with the new filter, or null to remove it.
export function buildFilterPanel({ t, column, filter, values, onApply }) {
    const group = typeGroup(column.type);
    let mode = filter ? filter.kind : (group === "text" ? "value" : "pattern");

    const panel = el("div", { class: "k-dt-panel" });
    panel.appendChild(el("div", { class: "k-dt-panel-head", text: t.filterPanelTitle(column.label) }));

    // Tabs: Left/Right/Home/End switch, one tab stop.
    const id = uid("kdt-flt");
    const tabs = el("div", { class: "k-dt-tabs", role: "tablist", "aria-label": t.filterMode });
    const makeTab = (name, text) => el("button", {
        type: "button", class: "k-dt-tab", role: "tab", id: `${id}-${name}-tab`,
        "aria-controls": `${id}-${name}`, text
    });
    const valueTab = makeTab("value", t.valuesTab);
    const patternTab = makeTab("pattern", t.patternTab);
    tabs.append(valueTab, patternTab);
    panel.appendChild(tabs);

    const bodyValue = valueFilter(t, values, filter);
    const bodyPattern = patternFilter(t, column, filter);
    for (const [name, body] of [["value", bodyValue], ["pattern", bodyPattern]]) {
        body.el.id = `${id}-${name}`;
        body.el.setAttribute("role", "tabpanel");
        body.el.setAttribute("aria-labelledby", `${id}-${name}-tab`);
        panel.appendChild(body.el);
    }

    const setMode = (next, focusTab = false) => {
        mode = next;
        for (const [tab, body, name] of [[valueTab, bodyValue, "value"], [patternTab, bodyPattern, "pattern"]]) {
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
        class: "k-dt-btn k-dt-btn-primary",
        text: t.apply,
        onclick: () => onApply(mode === "value" ? bodyValue.collect() : bodyPattern.collect())
    });
    panel.appendChild(el("div", { class: "k-dt-panel-actions" }, [
        el("button", { type: "button", class: "k-dt-btn", text: t.reset, onclick: () => onApply(null) }),
        applyButton
    ]));

    // Enter in the value search or on a search-result option applies, like a click on "Apply".
    bodyValue.el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.isComposing) return;
        if (e.target !== bodyValue.focusTarget && e.target.type !== "radio") return;
        e.preventDefault();
        applyButton.click();
    });
    return panel;
}

// Checkbox list of the distinct values with a search field.
function valueFilter(t, values, existing) {
    const container = el("div", { class: "k-dt-filter-body" });
    const selected = new Set(
        existing && existing.kind === "value" ? existing.values.map((v) => String(v)) : values.map((v) => String(v.value))
    );

    // Searching works like Excel: the matches start out checked, and the
    // filter becomes either only the checked matches or (with "add") the
    // checked matches plus the selection from before the search. Clearing
    // the search restores that earlier selection.
    let baseline = null;   // Map<label element, checked> captured when a search starts
    const checkboxes = () => Array.from(list.querySelectorAll(".k-dt-check"));
    const isVisible = (label) => label.style.display !== "none";
    const boxOf = (label) => label.querySelector('input[type="checkbox"]');
    const syncToggleAll = () => {
        const visible = checkboxes().filter(isVisible);
        toggleAllBox.checked = visible.length > 0 && visible.every((label) => boxOf(label).checked);
    };

    const search = el("input", {
        type: "search",
        class: "k-dt-input",
        placeholder: t.searchValues,
        "aria-label": t.searchValues,
        oninput: (e) => {
            const q = e.target.value.trim().toLowerCase();
            if (q && !baseline) baseline = new Map(checkboxes().map((label) => [label, boxOf(label).checked]));
            checkboxes().forEach((label) => {
                const match = !q || label.dataset.label.includes(q);
                label.style.display = match ? "" : "none";
                // Matches start checked; everything else keeps the earlier selection.
                if (baseline) boxOf(label).checked = (q && match) || baseline.get(label);
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
                if (isVisible(label)) boxOf(label).checked = e.target.checked;
            });
        }
    });
    const toggleAllText = el("span", { text: t.selectAll });
    container.appendChild(el("label", { class: "k-dt-check k-dt-check-all" }, [toggleAllBox, toggleAllText]));

    const list = el("div", { class: "k-dt-check-list", onchange: () => syncToggleAll() },
        values.map((entry) => {
            const labelText = String(entry.label || t.emptyValue);
            return el("label", { class: "k-dt-check", dataset: { label: labelText.toLowerCase(), value: String(entry.value) } }, [
                el("input", { type: "checkbox", checked: selected.has(String(entry.value)) }),
                el("span", { class: "k-dt-check-label", text: labelText }),
                el("span", { class: "k-dt-check-count", text: String(entry.count) })
            ]);
        }));
    container.appendChild(list);

    // Only shown while searching.
    const searchMode = segmentedEl(uid("kdt-smode"), t.searchResultsMode, [
        ["replace", t.searchResultsOnly],
        ["add", t.searchResultsAdd]
    ], "replace");
    searchMode.classList.add("k-dt-search-mode");
    searchMode.hidden = true;
    container.appendChild(searchMode);

    return {
        el: container,
        focusTarget: search,
        collect: () => {
            const add = !searchMode.hidden && searchMode.querySelector('input[value="add"]').checked;
            const chosen = [];
            checkboxes().forEach((label) => {
                const take = searchMode.hidden
                    ? boxOf(label).checked
                    : isVisible(label)
                        ? boxOf(label).checked || (add && baseline.get(label))
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
function patternFilter(t, column, existing) {
    const container = el("div", { class: "k-dt-filter-body" });
    const operators = operatorsForType(column.type);
    const current = existing && existing.kind === "pattern" ? existing : null;
    const group = typeGroup(column.type);
    const inputType = group === "number" ? "number"
        : group === "date" ? (column.type === "datetime" ? "datetime-local" : column.type === "time" ? "time" : "date")
        : "text";

    const operandWrap = el("div", { class: "k-dt-operands" });
    const operand1 = el("input", { type: inputType, class: "k-dt-input", value: current ? (current.operand ?? "") : "" });
    const operand2 = el("input", { type: inputType, class: "k-dt-input", value: current ? (current.operand2 ?? "") : "" });
    const selectId = uid("kdt-op");
    const arity = () => operatorMeta(column.type, select.value)?.arity ?? 1;

    const select = el("select", {
        class: "k-dt-select",
        id: selectId,
        onchange: () => renderOperands()
    }, operators.map((op) => el("option", { value: op.id, text: t.operators[op.id] ?? op.label, selected: current && current.operator === op.id })));

    const renderOperands = () => {
        const n = arity();
        operand1.setAttribute("aria-label", n >= 2 ? t.operandFrom : t.operandValue);
        operand2.setAttribute("aria-label", t.operandTo);
        operandWrap.replaceChildren(...[n >= 1 && operand1, n >= 2 && operand2].filter(Boolean));
    };
    renderOperands();

    container.append(
        el("label", { class: "k-dt-field-label", for: selectId, text: t.condition }),
        select,
        operandWrap
    );

    return {
        el: container,
        focusTarget: select,
        collect: () => {
            const n = arity();
            const filter = { kind: "pattern", operator: select.value, arity: n };
            if (n >= 1) filter.operand = operand1.value;
            if (n >= 2) filter.operand2 = operand2.value;
            return isActiveFilter(filter) ? filter : null;
        }
    };
}
