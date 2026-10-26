// Saved views panel: save, load, rename and delete views. Questions
// (overwrite? delete?), the rename field and errors appear inside the panel;
// the parts are rebuilt in place and focus moves to the element with that
// `data-vk`. The name and filter fields are never rebuilt, so typing
// survives the list loading. The views are collapsible groups; the filter
// field narrows them as you type. With `menu` (mobile), the actions of a
// view are in a menu (bottom sheet) instead of a row of buttons.
//
// With `sharing`, own views get a share toggle, and a second group lists the
// views others shared: those can only be loaded (and saved as an own view).
//
// `buildViewsPanel` holds the panel state and the actions; the functions
// below it build the parts from that state.

import { el, iconEl, deepActiveElement } from "../ui/dom.js";
import { openContextMenu } from "../ui/contextMenu.js";
import { uid } from "../core/util.js";

/** @typedef {import("../core/i18n.js").Translations} Translations */
/** @typedef {import("../types.js").SharedView} SharedView */
/** @typedef {import("../types.js").ActiveView} ActiveView */
/**
 * @typedef {object} ViewsApi
 * @property {() => Promise<{ name: string, shared: boolean }[]>} list
 * @property {(name: string) => Promise<void>} save
 * @property {(name: string) => Promise<boolean>} load
 * @property {(oldName: string, newName: string) => Promise<void>} rename
 * @property {(name: string) => Promise<void>} remove
 * @property {(name: string, shared: boolean) => Promise<void>} share
 * @property {() => Promise<SharedView[]>} listShared
 * @property {(view: SharedView) => Promise<boolean>} loadShared
 * @property {() => ActiveView|null} active
 */
/** @typedef {"name"|"rename"|"list"|"shared"} ErrorAt */
/**
 * names: own views, null while loading; sharedNames: those of them that are
 * shared; others: views others shared, null while loading (othersFailed:
 * loading them failed); step: the open question or rename field; filter: the
 * text of the filter field.
 * @typedef {{ names: string[]|null, sharedNames: Set<string>, others: SharedView[]|null, othersFailed: boolean,
 *     step: { kind: "overwrite"|"rename"|"delete", name: string }|null,
 *     error: { text: string, at: ErrorAt }|null, busy: boolean, renameDraft: string, filter: string }} PanelState
 */
/** Collapsed groups (kept by the component while the table lives). @typedef {{ own: boolean, shared: boolean }} Collapsed */
/**
 * What the parts can trigger.
 * @typedef {object} Actions
 * @property {(name: string) => void} load
 * @property {(view: SharedView) => void} loadShared
 * @property {(name: string) => void} update      Save the active view again.
 * @property {(name: string) => void} saveAs      Fill the name field to save the active view as an own one.
 * @property {(name: string, shared: boolean) => void} share
 * @property {(name: string) => void} startRename
 * @property {(name: string) => void} startDelete
 * @property {(draft: string) => void} setDraft
 * @property {(name: string) => void} rename
 * @property {(name: string) => void} remove
 * @property {(focusKey: string, clearError?: boolean) => void} cancelStep
 * @property {() => void} retry
 * @property {() => void} retryShared
 * @property {(group: keyof Collapsed) => void} toggleGroup
 * @property {(name: string, button: HTMLElement) => void} openMenu  The actions of a view as a menu.
 */
/**
 * How the lists are drawn.
 * @typedef {{ collapsed: Collapsed, menu: boolean, sharing: boolean, active: ActiveView|null }} ListOptions
 */

// `views`: async { list() → [{ name, shared }], save(name), load(name) → found?,
// rename(old, new), remove(name), share(name, shared), listShared(),
// loadShared(view) → found? } and active() → { name, modified, shared? } | null.
// `announce(message)`, `close()`: status message, close the panel.
// `collapsed`: which groups are collapsed; the panel updates it.
// `menu`: the actions of a view in a menu (mobile). `sharing`: the adapter shares views.
// Returns { panel, refresh }: call `refresh()` once the panel is shown.
/**
 * @param {{ t: Translations, views: ViewsApi, announce: (message: string) => void, close: () => void,
 *     collapsed: Collapsed, menu?: boolean, sharing?: boolean }} options
 * @returns {{ panel: HTMLElement, refresh: () => Promise<unknown> }}
 */
export function buildViewsPanel({ t, views, announce, close, collapsed, menu = false, sharing = false }) {
    /** @type {PanelState} */
    const ui = {
        names: null, sharedNames: new Set(), others: null, othersFailed: false,
        step: null, error: null, busy: false, renameDraft: "", filter: ""
    };
    const errorId = uid("jwdt-verr");
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let filterTimer;
    // Running adapter calls; the panel is `aria-busy` while there are any.
    let pending = 0;

    const nameInput = el("input", {
        type: "text",
        class: "jw-dt-input",
        placeholder: t.viewNamePlaceholder,
        "aria-label": t.viewNamePlaceholder,
        "data-vk": "name",
        "data-autofocus": "",
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }
    });
    // Escape in a filled filter field clears it; in an empty one it closes the panel.
    const filterInput = el("input", {
        type: "search",
        class: "jw-dt-input",
        placeholder: t.filterViews,
        "aria-label": t.filterViews,
        "data-vk": "filter",
        oninput: () => setFilter(filterInput.value),
        onkeydown: (e) => {
            if (e.key !== "Escape" || !filterInput.value) return;
            e.preventDefault();
            e.stopPropagation();
            filterInput.value = "";
            setFilter("");
        }
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
        filterInput,
        listSection
    ]);
    const isOpen = () => panel.isConnected;

    /** @type {Actions} */
    const actions = {
        load: (name) => loadView({
            name, focus: `load:${name}`, at: "list", load: () => views.load(name), refresh: refreshOwn
        }),
        loadShared: (view) => loadView({
            name: view.name, focus: `shared:${view.id}`, at: "shared", load: () => views.loadShared(view),
            refresh: async () => { ui.others = await views.listShared(); }
        }),
        update: (name) => run(() => views.save(name), {
            message: t.viewUpdated(name), focus: `load:${name}`, errorAt: "list", errorFocus: "update"
        }),
        saveAs: (name) => {
            nameInput.value = name;
            nameInput.focus();
            nameInput.setSelectionRange(name.length, name.length);
        },
        share: (name, shared) => run(() => views.share(name, shared), {
            message: shared ? t.viewShared(name) : t.viewUnshared(name),
            focus: `share:${name}`, errorAt: "list", errorFocus: `share:${name}`
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
        retry: () => loadOwn("retry"),
        retryShared: () => loadShared(true),
        toggleGroup: (group) => { collapsed[group] = !collapsed[group]; render(`group:${group}`); },
        // The menu lives in the panel, so the panel treats it as inside (no outside click, its own Escape).
        openMenu: (name, button) => {
            const shared = ui.sharedNames.has(name);
            button.setAttribute("aria-expanded", "true");
            openContextMenu(panel, {
                x: 0,
                y: 0,
                sheet: true,
                label: t.actionsFor(name),
                items: [
                    sharing && { label: shared ? t.stopSharing : t.shareView, icon: "share-2", onSelect: () => actions.share(name, !shared) },
                    { label: t.renameView, icon: "pencil", onSelect: () => actions.startRename(name) },
                    { label: t.deleteView, icon: "trash", onSelect: () => actions.startDelete(name) }
                ],
                restoreFocus: () => focusKey(`more:${name}`),
                onClose: () => button.setAttribute("aria-expanded", "false")
            });
        }
    };

    // Narrows the lists as you type; the number of matches is announced once typing pauses.
    /** @param {string} text */
    const setFilter = (text) => {
        ui.filter = text;
        render();
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => {
            if (isOpen() && ui.names) announce(t.viewsCount(visibleNames(ui).length + visibleShared(ui).length));
        }, 400);
    };

    /** @param {boolean} on */
    const busy = (on) => {
        pending += on ? 1 : -1;
        if (pending > 0) panel.setAttribute("aria-busy", "true");
        else panel.removeAttribute("aria-busy");
    };

    /** @param {{ name: string, shared: boolean }[]} list */
    const setOwn = (list) => {
        ui.names = list.map((view) => view.name);
        ui.sharedNames = new Set(list.filter((view) => view.shared).map((view) => view.name));
    };
    const refreshOwn = async () => setOwn(await views.list());

    // With `menu`, the menu button stands in for the share, rename and delete buttons.
    /** @param {string} key */
    const focusKey = (key) => {
        if (menu) key = key.replace(/^(share|rename|delete):/, "more:");
        /** @type {HTMLElement|null} */
        const target = panel.querySelector(`[data-vk="${CSS.escape(key)}"]`);
        target?.focus();
        return target;
    };

    /** @param {string|null} [focusTo] */
    const render = (focusTo) => {
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
        /** @type {ListOptions} */
        const options = { collapsed, menu, sharing, active };
        listSection.replaceChildren(
            ...listContent(t, ui, errorId, options, actions),
            ...(sharing ? sharedContent(t, ui, errorId, options, actions) : [])
        );
        const target = focusTo ? focusKey(focusTo) : null;
        if (!target && (!focused?.isConnected || !panel.contains(focused))) nameInput.focus();
    };

    // Runs an adapter action on the own views; failures stay in the panel as a message.
    /**
     * @param {() => Promise<unknown>} action
     * @param {{ message: string, focus: string|(() => string), errorAt: ErrorAt, errorFocus: string }} options
     */
    const run = async (action, { message, focus, errorAt, errorFocus }) => {
        if (ui.busy) return;
        ui.busy = true;
        busy(true);
        try {
            await action();
            await refreshOwn();
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
            busy(false);
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
        const index = visibleNames(ui).indexOf(name);
        run(() => views.remove(name), {
            message: t.viewDeleted(name),
            // Focus the next view, else the previous one, else the name field.
            focus: () => {
                const names = visibleNames(ui);
                const next = names[index] ?? names[index - 1];
                return next != null ? `load:${next}` : "name";
            },
            errorAt: "list",
            errorFocus: "step-cancel"
        });
    };

    // A loaded view closes the panel; a vanished one refreshes its list (focus
    // moves to the group's heading).
    /**
     * @param {{ name: string, focus: string, at: "list"|"shared", load: () => Promise<boolean>, refresh: () => Promise<void> }} options
     */
    const loadView = async ({ name, focus, at, load, refresh }) => {
        if (ui.busy) return;
        ui.busy = true;
        busy(true);
        try {
            if (await load()) {
                close();
                announce(t.viewLoaded(name));
                return;
            }
            await refresh();
            ui.error = { text: t.viewNotFound(name), at };
            focus = at === "shared" ? "group:shared" : "group:own";
        } catch {
            ui.error = { text: t.viewActionFailed, at };
        } finally {
            ui.busy = false;
            busy(false);
        }
        render(focus);
        if (ui.error) announce(ui.error.text);
    };

    /** @param {string} [focusTo] */
    const loadOwn = async (focusTo) => {
        ui.names = null;
        ui.error = null;
        render(focusTo === "retry" ? null : focusTo);
        busy(true);
        try {
            await refreshOwn();
        } catch {
            ui.error = { text: t.viewsLoadFailed, at: "list" };
            if (isOpen()) announce(ui.error.text);
        } finally {
            busy(false);
        }
        render(ui.names === null ? "retry" : (focusTo === "retry" ? "name" : null));
    };

    // Loads the views others shared; a failure only affects their group.
    const loadShared = async (retry = false) => {
        ui.others = null;
        ui.othersFailed = false;
        render(null);
        busy(true);
        try {
            ui.others = await views.listShared();
        } catch {
            ui.othersFailed = true;
            if (isOpen()) announce(t.sharedViewsLoadFailed);
        } finally {
            busy(false);
        }
        render(retry ? (ui.othersFailed ? "retry-shared" : "group:shared") : null);
    };

    return { panel, refresh: () => Promise.all([loadOwn(), sharing && loadShared()]) };
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
// A view others shared cannot be updated, only saved as an own view.
/**
 * @param {Translations} t
 * @param {ActiveView} active
 * @param {Actions} actions
 */
function activeView(t, active, actions) {
    const id = uid("jwdt-vact");
    const detail = active.shared?.detail;
    return el("div", { class: "jw-dt-views-active" }, [
        el("p", { id }, [
            `${t.activeView}: `,
            el("strong", { text: active.name }),
            detail && el("span", { class: "jw-dt-views-badge", text: ` · ${detail}` }),
            active.modified && el("span", { class: "jw-dt-views-badge", text: ` (${t.viewModified})` })
        ]),
        active.shared
            ? el("button", {
                type: "button", class: "jw-dt-btn", text: t.saveAsOwnView, "data-vk": "save-as", "aria-describedby": id,
                onclick: () => actions.saveAs(active.name)
            })
            : active.modified && el("button", {
                type: "button", class: "jw-dt-btn", text: t.updateView, "data-vk": "update", "aria-describedby": id,
                onclick: () => actions.update(active.name)
            })
    ]);
}

// Whether a name matches the filter (case-insensitive, anywhere in the text).
/**
 * @param {string} filter
 * @param {string} text
 */
function matches(filter, text) {
    return text.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
}

// The names the filter lets through; the view of an open step always stays.
/** @param {PanelState} ui */
function visibleNames(ui) {
    return (ui.names ?? []).filter((name) => name === ui.step?.name || matches(ui.filter, name));
}

// The views of others the filter lets through (by name or detail).
/** @param {PanelState} ui */
function visibleShared(ui) {
    return (ui.others ?? []).filter((view) => matches(ui.filter, view.name) || (view.detail != null && matches(ui.filter, view.detail)));
}

// The list's text: the name, and a second, smaller line (e.g. who shared it).
/**
 * @param {string} name
 * @param {string|null|undefined} detail
 */
function viewText(name, detail) {
    return el("span", { class: "jw-dt-views-text" }, [
        el("span", { class: "jw-dt-views-name", text: name }),
        // The space keeps the accessible name readable ("Active by Anna").
        detail && " ",
        detail && el("span", { class: "jw-dt-views-detail", text: detail })
    ]);
}

// The empty or loading text of a group, or null when there are views to show.
/**
 * @param {Translations} t
 * @param {unknown[]|null} all
 * @param {unknown[]} visible
 * @param {string} emptyText
 */
function groupNote(t, all, visible, emptyText) {
    const text = all === null ? t.viewsLoading : all.length === 0 ? emptyText : visible.length === 0 ? t.noMatchingViews : null;
    return text == null ? null : el("p", { class: "jw-dt-views-empty", text });
}

// A collapsible group: a heading with a disclosure button ("My views (3)",
// the number of views the filter lets through) and the list below it.
/**
 * @param {{ key: keyof Collapsed, label: string, count: number|null, collapsed: boolean,
 *     content: HTMLElement[], actions: Actions }} options
 */
function group({ key, label, count, collapsed, content, actions }) {
    const bodyId = uid("jwdt-vgrp");
    return el("div", { class: "jw-dt-views-group" }, [
        el("h3", { class: "jw-dt-views-group-head" }, [
            el("button", {
                type: "button",
                class: "jw-dt-btn jw-dt-disclosure",
                "aria-expanded": String(!collapsed),
                "aria-controls": bodyId,
                "data-vk": `group:${key}`,
                onclick: () => actions.toggleGroup(key)
            }, [iconEl("chevron-right"), el("span", { text: count == null ? label : `${label} (${count})` })])
        ]),
        el("div", { class: "jw-dt-views-group-body", id: bodyId, hidden: collapsed }, content)
    ]);
}

// A "Try again" button.
/**
 * @param {Translations} t
 * @param {string} key
 * @param {() => void} onclick
 */
function retryButton(t, key, onclick) {
    return el("button", { type: "button", class: "jw-dt-btn", text: t.retry, "data-vk": key, onclick });
}

// The own views (or their loading, empty or error state) as a group.
/**
 * @param {Translations} t
 * @param {PanelState} ui
 * @param {string} errorId
 * @param {ListOptions} options
 * @param {Actions} actions
 * @returns {HTMLElement[]}
 */
function listContent(t, ui, errorId, { collapsed, menu, sharing, active }, actions) {
    // Errors stay outside the group, so a collapsed group does not hide them.
    const error = errorText(ui, "list", errorId);
    if (ui.names === null && error) return [error, retryButton(t, "retry", actions.retry)];
    const names = visibleNames(ui);
    const activeName = active && !active.shared ? active.name : null;
    const content = groupNote(t, ui.names, names, t.noSavedViews)
        ?? el("ul", { class: "jw-dt-views-items", "aria-label": t.myViews }, names.map((name) => {
            const step = ui.step?.name === name ? ui.step.kind : null;
            const shared = sharing ? ui.sharedNames.has(name) : null;
            if (step === "delete") {
                return el("li", { class: "jw-dt-views-item is-step" }, [
                    question(t, shared ? t.confirmDeleteShared(name) : t.confirmDelete(name), t.deleteView,
                        () => actions.remove(name), `delete:${name}`, actions)
                ]);
            }
            if (step === "rename") return renameItem(t, ui, errorId, name, actions);
            return viewItem(t, name, { isActive: name === activeName, shared, menu }, actions);
        }));
    const own = group({ key: "own", label: t.myViews, count: ui.names && names.length, collapsed: collapsed.own, content: [content], actions });
    return error ? [error, own] : [own];
}

// The views others shared (or their loading, empty or error state) as a group.
/**
 * @param {Translations} t
 * @param {PanelState} ui
 * @param {string} errorId
 * @param {ListOptions} options
 * @param {Actions} actions
 * @returns {HTMLElement[]}
 */
function sharedContent(t, ui, errorId, { collapsed, active }, actions) {
    if (ui.others === null && ui.othersFailed) {
        return [
            el("p", { class: "jw-dt-views-error", text: t.sharedViewsLoadFailed }),
            retryButton(t, "retry-shared", actions.retryShared)
        ];
    }
    const error = errorText(ui, "shared", errorId);
    const others = visibleShared(ui);
    const activeId = active?.shared?.id;
    const content = groupNote(t, ui.others, others, t.noSharedViews)
        ?? el("ul", { class: "jw-dt-views-items", "aria-label": t.sharedViews }, others.map((view) =>
            el("li", { class: "jw-dt-views-item" }, [
                el("button", {
                    type: "button",
                    class: "jw-dt-views-load",
                    title: t.loadView,
                    "data-vk": `shared:${view.id}`,
                    "aria-current": view.id === activeId ? "true" : null,
                    onclick: () => actions.loadShared(view)
                }, [view.id === activeId ? iconEl("check") : el("span", { class: "jw-dt-ic" }), viewText(view.name, view.detail)])
            ])));
    const shared = group({
        key: "shared", label: t.sharedViews, count: ui.others && others.length, collapsed: collapsed.shared, content: [content], actions
    });
    return error ? [error, shared] : [shared];
}

// A view: load it (the name), share, rename or delete it (with `menu`: open
// the menu that does). `shared`: null without sharing.
/**
 * @param {Translations} t
 * @param {string} name
 * @param {{ isActive: boolean, shared: boolean|null, menu: boolean }} options
 * @param {Actions} actions
 */
function viewItem(t, name, { isActive, shared, menu }, actions) {
    return el("li", { class: "jw-dt-views-item" }, [
        el("button", {
            type: "button",
            class: "jw-dt-views-load",
            title: t.loadView,
            "data-vk": `load:${name}`,
            "aria-current": isActive ? "true" : null,
            onclick: () => actions.load(name)
        }, [
            isActive ? iconEl("check") : el("span", { class: "jw-dt-ic" }),
            // The menu hides the share toggle, so the list says which views are shared.
            viewText(name, menu && shared ? t.viewIsShared : null)
        ]),
        !menu && shared !== null && el("button", {
            type: "button", class: "jw-dt-icon-btn jw-dt-views-share", title: t.shareView,
            "aria-label": t.shareViewNamed(name), "aria-pressed": String(shared), "data-vk": `share:${name}`,
            onclick: () => actions.share(name, !shared)
        }, [iconEl("share-2")]),
        menu && el("button", {
            type: "button", class: "jw-dt-icon-btn", title: t.viewActions,
            "aria-label": t.actionsFor(name), "aria-haspopup": "menu", "aria-expanded": "false", "data-vk": `more:${name}`,
            onclick: (e) => actions.openMenu(name, e.currentTarget)
        }, [iconEl("ellipsis-vertical")]),
        !menu && el("button", {
            type: "button", class: "jw-dt-icon-btn", title: t.renameView,
            "aria-label": t.renameViewNamed(name), "data-vk": `rename:${name}`,
            onclick: () => actions.startRename(name)
        }, [iconEl("pencil")]),
        !menu && el("button", {
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
