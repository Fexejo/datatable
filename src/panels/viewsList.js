// Parts of the saved views panel (`viewsPanel.js`), built from its state:
// the current view, questions, the default view, the groups of own views and
// of views others shared, and their items. They get the state and the
// actions, nothing else.

import { el, iconEl } from "../ui/dom.js";
import { uid } from "../core/util.js";

/** @typedef {import("../core/i18n.js").Translations} Translations */
/** @typedef {import("../types.js").SharedView} SharedView */
/** @typedef {import("../types.js").ActiveView} ActiveView */
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
 * @property {() => void} loadDefault             Back to the table's initial state.
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
 * isDefault: the table is in its initial state.
 * @typedef {{ collapsed: Collapsed, menu: boolean, sharing: boolean, active: ActiveView|null, isDefault: boolean }} ListOptions
 */

// The error message, when it belongs at `at`.
/**
 * @param {PanelState} ui
 * @param {ErrorAt} at
 * @param {string} errorId
 */
export function errorText(ui, at, errorId) {
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

// A question with its answers, modal in the panel; focus goes to Cancel (the safe answer).
/**
 * @param {Translations} t
 * @param {string} text
 * @param {string} okText
 * @param {() => void} onOk
 * @param {string} cancelKey Focus key after cancelling.
 * @param {Actions} actions
 */
export function question(t, text, okText, onOk, cancelKey, actions) {
    const id = uid("jwdt-vq");
    return el("div", {
        class: "jw-dt-views-confirm", role: "alertdialog", "aria-modal": "true", "aria-labelledby": id,
        onkeydown: stepBackOnEscape(actions, cancelKey)
    }, [
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
export function activeView(t, active, actions) {
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
export function visibleNames(ui) {
    return (ui.names ?? []).filter((name) => name === ui.step?.name || matches(ui.filter, name));
}

// The views of others the filter lets through (by name or detail).
/** @param {PanelState} ui */
export function visibleShared(ui) {
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

// The table's initial state, as a view above the groups; the filter doesn't hide it.
/**
 * @param {Translations} t
 * @param {ListOptions} options
 * @param {Actions} actions
 */
export function defaultView(t, { isDefault }, actions) {
    return el("div", { class: "jw-dt-views-item jw-dt-views-default" }, [
        el("button", {
            type: "button",
            class: "jw-dt-views-load",
            title: t.loadView,
            "data-vk": "default",
            "aria-current": isDefault ? "true" : null,
            onclick: () => actions.loadDefault()
        }, [isDefault ? iconEl("check") : el("span", { class: "jw-dt-ic" }), viewText(t.defaultView, null)])
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
export function listContent(t, ui, errorId, { collapsed, menu, sharing, active }, actions) {
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
export function sharedContent(t, ui, errorId, { collapsed, active }, actions) {
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

// A view being renamed: the name field (with its error) and the answers, modal in the panel.
/**
 * @param {Translations} t
 * @param {PanelState} ui
 * @param {string} errorId
 * @param {string} name
 * @param {Actions} actions
 */
function renameItem(t, ui, errorId, name, actions) {
    const invalid = ui.error?.at === "rename";
    return el("li", { class: "jw-dt-views-item is-step" }, [el("div", {
        class: "jw-dt-views-rename", role: "dialog", "aria-modal": "true", "aria-label": t.renameViewNamed(name),
        onkeydown: stepBackOnEscape(actions, `rename:${name}`)
    }, [
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
    ])]);
}
