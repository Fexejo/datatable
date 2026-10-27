// Saved views panel: save, load, rename and delete views, or go back to the
// default view (the table's initial state). Questions
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
// Questions, the rename field and the actions menu are modal inside the
// panel: while one is open, the rest of the panel is inert (`isolate()`).
//
// `buildViewsPanel` holds the panel state and the actions; `viewsList.js`
// builds the parts from that state.

import { el, deepActiveElement } from "../ui/dom.js";
import { openContextMenu } from "../ui/contextMenu.js";
import { uid } from "../core/util.js";
import { activeView, defaultView, errorText, listContent, question, sharedContent, visibleNames, visibleShared } from "./viewsList.js";

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
 * @property {() => boolean} isDefault  The table is in its initial state.
 * @property {() => void} reset         Back to the initial state (announces it).
 */
/** @typedef {import("./viewsList.js").PanelState} PanelState */
/** @typedef {import("./viewsList.js").ErrorAt} ErrorAt */
/** @typedef {import("./viewsList.js").Collapsed} Collapsed */
/** @typedef {import("./viewsList.js").Actions} Actions */
/** @typedef {import("./viewsList.js").ListOptions} ListOptions */

// `views`: async { list() → [{ name, shared }], save(name), load(name) → found?,
// rename(old, new), remove(name), share(name, shared), listShared(),
// loadShared(view) → found? }, active() → { name, modified, shared? } | null,
// isDefault() and reset().
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
        // Like loading a view: the panel closes (focus back on its button), then the table announces it.
        loadDefault: () => {
            if (ui.busy) return;
            close();
            views.reset();
        },
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
                onClose: () => {
                    button.setAttribute("aria-expanded", "false");
                    isolate();
                }
            });
            isolate();
        }
    };

    // Makes everything in the panel inert but the open menu or modal step (and
    // the live region), level by level up to the panel; without one, nothing.
    const isolate = () => {
        for (const node of panel.querySelectorAll("[data-inert]")) {
            if (node instanceof HTMLElement) node.inert = false;
            node.removeAttribute("data-inert");
        }
        /** @type {Element|null} */
        let node = panel.querySelector(".jw-ctx-menu") ?? panel.querySelector('[aria-modal="true"]');
        for (; node && node.parentElement && node !== panel; node = node.parentElement) {
            for (const sibling of node.parentElement.children) {
                if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute("data-live")) continue;
                sibling.inert = true;
                sibling.setAttribute("data-inert", "");
            }
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
        const options = { collapsed, menu, sharing, active, isDefault: views.isDefault() };
        listSection.replaceChildren(
            defaultView(t, options, actions),
            ...listContent(t, ui, errorId, options, actions),
            ...(sharing ? sharedContent(t, ui, errorId, options, actions) : [])
        );
        isolate();
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
