// Saved views panel: save, load, rename and delete views. Questions
// (overwrite? delete?), the rename field and errors appear inside the panel;
// the parts are rebuilt in place and focus moves to the element with that
// `data-vk`. The name field is never rebuilt, so typing survives the list
// loading.
//
// `buildViewsPanel` holds the panel state and the actions; the functions
// below it build the parts from that state.

import { el, iconEl, deepActiveElement } from "../ui/dom.js";
import { uid } from "../core/util.js";

/** @typedef {import("../core/i18n.js").Translations} Translations */
/**
 * @typedef {object} ViewsApi
 * @property {() => Promise<string[]>} list
 * @property {(name: string) => Promise<void>} save
 * @property {(name: string) => Promise<boolean>} load
 * @property {(oldName: string, newName: string) => Promise<void>} rename
 * @property {(name: string) => Promise<void>} remove
 * @property {() => { name: string, modified: boolean }|null} active
 */
/** @typedef {"name"|"rename"|"list"} ErrorAt */
/**
 * names: null while loading; step: the open question or rename field.
 * @typedef {{ names: string[]|null, step: { kind: "overwrite"|"rename"|"delete", name: string }|null,
 *     error: { text: string, at: ErrorAt }|null, busy: boolean, renameDraft: string }} PanelState
 */
/**
 * What the parts can trigger.
 * @typedef {object} Actions
 * @property {(name: string) => void} load
 * @property {(name: string) => void} update      Save the active view again.
 * @property {(name: string) => void} startRename
 * @property {(name: string) => void} startDelete
 * @property {(draft: string) => void} setDraft
 * @property {(name: string) => void} rename
 * @property {(name: string) => void} remove
 * @property {(focusKey: string, clearError?: boolean) => void} cancelStep
 * @property {() => void} retry
 */

// `views`: async { list(), save(name), load(name) → found?, rename(old, new),
// remove(name) } and active() → { name, modified } | null.
// `announce(message)`, `close()`: status message, close the panel.
// Returns { panel, refresh }: call `refresh()` once the panel is shown.
/**
 * @param {{ t: Translations, views: ViewsApi, announce: (message: string) => void, close: () => void }} options
 * @returns {{ panel: HTMLElement, refresh: () => Promise<void> }}
 */
export function buildViewsPanel({ t, views, announce, close }) {
    /** @type {PanelState} */
    const ui = { names: null, step: null, error: null, busy: false, renameDraft: "" };
    const errorId = uid("jwdt-verr");

    const nameInput = el("input", {
        type: "text",
        class: "jw-dt-input",
        placeholder: t.viewNamePlaceholder,
        "aria-label": t.viewNamePlaceholder,
        "data-vk": "name",
        "data-autofocus": "",
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }
    });
    const activeSection = el("div", { class: "jw-dt-views-active-wrap" });
    const saveExtra = el("div", { class: "jw-dt-views-extra" });
    const listSection = el("div", { class: "jw-dt-views-list" });
    const panel = el("div", { class: "jw-dt-panel jw-dt-views-panel" }, [
        el("h2", { class: "jw-dt-panel-head", text: t.savedViews }),
        activeSection,
        el("div", { class: "jw-dt-views-save" }, [
            nameInput,
            el("button", { type: "button", class: "jw-dt-btn jw-dt-btn-primary", text: t.save, "data-vk": "save", onclick: () => save() })
        ]),
        saveExtra,
        listSection
    ]);
    const isOpen = () => panel.isConnected;

    /** @type {Actions} */
    const actions = {
        load: (name) => load(name),
        update: (name) => run(() => views.save(name), {
            message: t.viewUpdated(name), focus: `load:${name}`, errorAt: "list", errorFocus: "update"
        }),
        startRename: (name) => { ui.step = { kind: "rename", name }; ui.error = null; ui.renameDraft = name; render("rename-input"); },
        startDelete: (name) => { ui.step = { kind: "delete", name }; ui.error = null; render("step-cancel"); },
        setDraft: (draft) => { ui.renameDraft = draft; },
        rename: (name) => rename(name),
        remove: (name) => remove(name),
        cancelStep: (focusKey, clearError = true) => {
            ui.step = null;
            if (clearError) ui.error = null;
            render(focusKey);
        },
        retry: () => loadList("retry")
    };

    /** @param {string|null} [focusKey] */
    const render = (focusKey) => {
        if (!isOpen()) return;
        const focused = deepActiveElement();
        const active = views.active();
        activeSection.replaceChildren(...(active ? [activeView(t, active, actions)] : []));
        if (ui.error?.at === "name") {
            nameInput.setAttribute("aria-invalid", "true");
            nameInput.setAttribute("aria-describedby", errorId);
        } else {
            nameInput.removeAttribute("aria-invalid");
            nameInput.removeAttribute("aria-describedby");
        }
        const step = ui.step;
        saveExtra.replaceChildren(...[
            errorText(ui, "name", errorId),
            step?.kind === "overwrite"
                ? question(t, t.confirmOverwrite(step.name), t.overwrite, () => doSave(step.name), "name", actions)
                : null
        ].flatMap((node) => node ?? []));
        listSection.replaceChildren(...listContent(t, ui, errorId, active?.name, actions));
        /** @type {HTMLElement|null} */
        const target = focusKey ? panel.querySelector(`[data-vk="${CSS.escape(focusKey)}"]`) : null;
        if (target) target.focus();
        else if (!focused?.isConnected || !panel.contains(focused)) nameInput.focus();
    };

    // Runs an adapter action; failures stay in the panel as a message.
    /**
     * @param {() => Promise<unknown>} action
     * @param {{ message: string, focus: string|(() => string), errorAt: ErrorAt, errorFocus: string }} options
     */
    const run = async (action, { message, focus, errorAt, errorFocus }) => {
        if (ui.busy) return;
        ui.busy = true;
        panel.setAttribute("aria-busy", "true");
        try {
            await action();
            ui.names = await views.list();
            ui.step = null;
            ui.error = null;
            render(typeof focus === "function" ? focus() : focus);
            if (isOpen()) announce(message);
        } catch {
            ui.error = { text: t.viewActionFailed, at: errorAt };
            render(errorFocus);
            if (isOpen()) announce(ui.error.text);
        } finally {
            ui.busy = false;
            panel.removeAttribute("aria-busy");
        }
    };
    /**
     * @param {string} text
     * @param {ErrorAt} at
     * @param {string} focusKey
     */
    const fail = (text, at, focusKey) => {
        ui.error = { text, at };
        render(focusKey);
        announce(text);
    };

    // Saving under an existing name asks first.
    const save = () => {
        const name = nameInput.value.trim();
        if (!name) return fail(t.viewNameRequired, "name", "name");
        if (ui.names?.includes(name)) {
            ui.error = null;
            ui.step = { kind: "overwrite", name };
            render("step-cancel");
            return;
        }
        doSave(name);
    };
    /** @param {string} name */
    const doSave = (name) => run(async () => {
        await views.save(name);
        nameInput.value = "";
    }, { message: t.viewSaved(name), focus: "name", errorAt: "name", errorFocus: "name" });

    /** @param {string} oldName */
    const rename = (oldName) => {
        const newName = ui.renameDraft.trim();
        if (!newName) return fail(t.viewNameRequired, "rename", "rename-input");
        if (newName === oldName) { actions.cancelStep(`rename:${oldName}`); return; }
        if (ui.names?.includes(newName)) return fail(t.viewNameTaken(newName), "rename", "rename-input");
        run(() => views.rename(oldName, newName), {
            message: t.viewRenamed(oldName, newName), focus: `load:${newName}`, errorAt: "rename", errorFocus: "rename-input"
        });
    };

    /** @param {string} name */
    const remove = (name) => {
        const index = ui.names?.indexOf(name) ?? -1;
        run(() => views.remove(name), {
            message: t.viewDeleted(name),
            // Focus the next view, else the previous one, else the name field.
            focus: () => {
                const next = ui.names?.[index] ?? ui.names?.[index - 1];
                return next != null ? `load:${next}` : "name";
            },
            errorAt: "list",
            errorFocus: "step-cancel"
        });
    };

    // A loaded view closes the panel; a vanished one refreshes the list.
    /** @param {string} name */
    const load = async (name) => {
        if (ui.busy) return;
        ui.busy = true;
        panel.setAttribute("aria-busy", "true");
        try {
            if (await views.load(name)) {
                close();
                announce(t.viewLoaded(name));
                return;
            }
            ui.names = await views.list();
            ui.error = { text: t.viewNotFound(name), at: "list" };
        } catch {
            ui.error = { text: t.viewActionFailed, at: "list" };
        } finally {
            ui.busy = false;
            panel.removeAttribute("aria-busy");
        }
        render(`load:${name}`);
        if (ui.error) announce(ui.error.text);
    };

    /** @param {string} [focusKey] */
    const loadList = async (focusKey) => {
        ui.names = null;
        ui.error = null;
        render(focusKey === "retry" ? null : focusKey);
        panel.setAttribute("aria-busy", "true");
        try {
            ui.names = await views.list();
        } catch {
            ui.error = { text: t.viewsLoadFailed, at: "list" };
            if (isOpen()) announce(ui.error.text);
        } finally {
            panel.removeAttribute("aria-busy");
        }
        render(ui.error ? "retry" : (focusKey === "retry" ? "name" : null));
    };

    return { panel, refresh: () => loadList() };
}

// ---- Parts ------------------------------------------------------------------

// The error message, when it belongs at `at`.
/**
 * @param {PanelState} ui
 * @param {ErrorAt} at
 * @param {string} errorId
 */
function errorText(ui, at, errorId) {
    return ui.error?.at === at ? el("p", { class: "jw-dt-views-error", id: errorId, text: ui.error.text }) : null;
}

// Escape inside a question or the rename field steps back, not out of the panel.
/**
 * @param {Actions} actions
 * @param {string} focusKey
 */
function stepBackOnEscape(actions, focusKey) {
    return (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        actions.cancelStep(focusKey);
    };
}

// A question with its answers; focus goes to Cancel (the safe answer).
/**
 * @param {Translations} t
 * @param {string} text
 * @param {string} okText
 * @param {() => void} onOk
 * @param {string} cancelKey Focus key after cancelling.
 * @param {Actions} actions
 */
function question(t, text, okText, onOk, cancelKey, actions) {
    const id = uid("jwdt-vq");
    return el("div", { class: "jw-dt-views-confirm", role: "group", "aria-labelledby": id, onkeydown: stepBackOnEscape(actions, cancelKey) }, [
        el("p", { class: "jw-dt-views-question", id, text }),
        el("div", { class: "jw-dt-panel-actions" }, [
            el("button", { type: "button", class: "jw-dt-btn jw-dt-btn-primary", text: okText, "aria-describedby": id, onclick: onOk }),
            el("button", {
                type: "button", class: "jw-dt-btn", text: t.cancel, "data-vk": "step-cancel", "aria-describedby": id,
                // A failed action's message stays until the next attempt.
                onclick: () => actions.cancelStep(cancelKey, false)
            })
        ])
    ]);
}

// The view last saved or loaded; "Update" when the table differs from it.
/**
 * @param {Translations} t
 * @param {{ name: string, modified: boolean }} active
 * @param {Actions} actions
 */
function activeView(t, active, actions) {
    const id = uid("jwdt-vact");
    return el("div", { class: "jw-dt-views-active" }, [
        el("p", { id }, [
            `${t.activeView}: `,
            el("strong", { text: active.name }),
            active.modified && el("span", { class: "jw-dt-views-badge", text: ` (${t.viewModified})` })
        ]),
        active.modified && el("button", {
            type: "button", class: "jw-dt-btn", text: t.updateView, "data-vk": "update", "aria-describedby": id,
            onclick: () => actions.update(active.name)
        })
    ]);
}

// The list (or its loading, empty or error state).
/**
 * @param {Translations} t
 * @param {PanelState} ui
 * @param {string} errorId
 * @param {string|undefined} activeName
 * @param {Actions} actions
 * @returns {HTMLElement[]}
 */
function listContent(t, ui, errorId, activeName, actions) {
    const error = errorText(ui, "list", errorId);
    /** @type {HTMLElement} */
    let content;
    if (ui.names === null && ui.error?.at === "list") {
        content = el("button", { type: "button", class: "jw-dt-btn", text: t.retry, "data-vk": "retry", onclick: () => actions.retry() });
    } else if (ui.names === null) {
        content = el("p", { class: "jw-dt-views-empty", text: t.viewsLoading });
    } else if (ui.names.length === 0) {
        content = el("p", { class: "jw-dt-views-empty", text: t.noSavedViews });
    } else {
        content = el("ul", { class: "jw-dt-views-items", "aria-label": t.savedViews }, ui.names.map((name) => {
            const step = ui.step?.name === name ? ui.step.kind : null;
            if (step === "delete") {
                return el("li", { class: "jw-dt-views-item is-step" }, [
                    question(t, t.confirmDelete(name), t.deleteView, () => actions.remove(name), `delete:${name}`, actions)
                ]);
            }
            if (step === "rename") return renameItem(t, ui, errorId, name, actions);
            return viewItem(t, name, name === activeName, actions);
        }));
    }
    return error ? [error, content] : [content];
}

// A view: load it (the name), rename or delete it.
/**
 * @param {Translations} t
 * @param {string} name
 * @param {boolean} isActive
 * @param {Actions} actions
 */
function viewItem(t, name, isActive, actions) {
    return el("li", { class: "jw-dt-views-item" }, [
        el("button", {
            type: "button",
            class: "jw-dt-views-load",
            title: t.loadView,
            "data-vk": `load:${name}`,
            "aria-current": isActive ? "true" : null,
            onclick: () => actions.load(name)
        }, [isActive ? iconEl("check") : el("span", { class: "jw-dt-ic" }), el("span", { class: "jw-dt-views-name", text: name })]),
        el("button", {
            type: "button", class: "jw-dt-icon-btn", title: t.renameView,
            "aria-label": t.renameViewNamed(name), "data-vk": `rename:${name}`,
            onclick: () => actions.startRename(name)
        }, [iconEl("pencil")]),
        el("button", {
            type: "button", class: "jw-dt-icon-btn", title: t.deleteView,
            "aria-label": t.deleteViewNamed(name), "data-vk": `delete:${name}`,
            onclick: () => actions.startDelete(name)
        }, [iconEl("trash")])
    ]);
}

// A view being renamed: the name field (with its error) and the answers.
/**
 * @param {Translations} t
 * @param {PanelState} ui
 * @param {string} errorId
 * @param {string} name
 * @param {Actions} actions
 */
function renameItem(t, ui, errorId, name, actions) {
    const invalid = ui.error?.at === "rename";
    return el("li", { class: "jw-dt-views-item is-step", onkeydown: stepBackOnEscape(actions, `rename:${name}`) }, [
        el("input", {
            type: "text",
            class: "jw-dt-input",
            value: ui.renameDraft,
            "aria-label": t.newViewName(name),
            "data-vk": "rename-input",
            "aria-invalid": invalid ? "true" : null,
            "aria-describedby": invalid ? errorId : null,
            oninput: (e) => actions.setDraft(e.currentTarget.value),
            onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); actions.rename(name); } }
        }),
        errorText(ui, "rename", errorId),
        el("div", { class: "jw-dt-panel-actions" }, [
            el("button", { type: "button", class: "jw-dt-btn jw-dt-btn-primary", text: t.renameView, onclick: () => actions.rename(name) }),
            el("button", { type: "button", class: "jw-dt-btn", text: t.cancel, onclick: () => actions.cancelStep(`rename:${name}`) })
        ])
    ]);
}
