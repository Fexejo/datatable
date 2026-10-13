// Saved views panel: save, load, rename and delete views. Questions
// (overwrite? delete?), the rename field and errors appear inside the panel;
// the parts are rebuilt in place and focus moves to the element with that
// `data-vk`. The name field is never rebuilt, so typing survives the list
// loading.

import { el, iconEl, deepActiveElement } from "../ui/dom.js";
import { uid } from "../core/util.js";

// `views`: async { list(), save(name), load(name) → found?, rename(old, new),
// remove(name) } and active() → { name, modified } | null.
// `announce(message)`, `close()`: status message, close the panel.
// Returns { panel, refresh }: call `refresh()` once the panel is shown.
export function buildViewsPanel({ t, views, announce, close }) {
    // names: null while loading; step: { kind: "overwrite"|"rename"|"delete", name };
    // error: { text, at: "name"|"rename"|"list" }.
    const ui = { names: null, step: null, error: null, busy: false, renameDraft: "" };
    const errorId = uid("kdt-verr");

    const nameInput = el("input", {
        type: "text",
        class: "k-dt-input",
        placeholder: t.viewNamePlaceholder,
        "aria-label": t.viewNamePlaceholder,
        "data-vk": "name",
        "data-autofocus": "",
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }
    });
    const activeSection = el("div", { class: "k-dt-views-active-wrap" });
    const saveExtra = el("div", { class: "k-dt-views-extra" });
    const listSection = el("div", { class: "k-dt-views-list" });
    const panel = el("div", { class: "k-dt-panel k-dt-views-panel" }, [
        el("h2", { class: "k-dt-panel-head", text: t.savedViews }),
        activeSection,
        el("div", { class: "k-dt-views-save" }, [
            nameInput,
            el("button", { type: "button", class: "k-dt-btn k-dt-btn-primary", text: t.save, "data-vk": "save", onclick: () => save() })
        ]),
        saveExtra,
        listSection
    ]);

    const isOpen = () => panel.isConnected;
    const errorEl = (at) => (ui.error?.at === at
        ? el("p", { class: "k-dt-views-error", id: errorId, text: ui.error.text })
        : null);
    // Escape inside a question or the rename field steps back, not out of the panel.
    const onEscape = (focusKey) => (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        ui.step = null;
        ui.error = null;
        render(focusKey);
    };
    // A question with its answers; focus goes to Cancel (the safe answer).
    const question = (text, okText, onOk, cancelKey) => {
        const id = uid("kdt-vq");
        return el("div", { class: "k-dt-views-confirm", role: "group", "aria-labelledby": id, onkeydown: onEscape(cancelKey) }, [
            el("p", { class: "k-dt-views-question", id, text }),
            el("div", { class: "k-dt-panel-actions" }, [
                el("button", { type: "button", class: "k-dt-btn k-dt-btn-primary", text: okText, "aria-describedby": id, onclick: onOk }),
                el("button", {
                    type: "button", class: "k-dt-btn", text: t.cancel, "data-vk": "step-cancel", "aria-describedby": id,
                    onclick: () => { ui.step = null; render(cancelKey); }
                })
            ])
        ]);
    };

    const renderActive = () => {
        const active = views.active();
        if (!active) { activeSection.replaceChildren(); return; }
        const id = uid("kdt-vact");
        activeSection.replaceChildren(el("div", { class: "k-dt-views-active" }, [
            el("p", { id }, [
                `${t.activeView}: `,
                el("strong", { text: active.name }),
                active.modified && el("span", { class: "k-dt-views-badge", text: ` (${t.viewModified})` })
            ]),
            active.modified && el("button", {
                type: "button", class: "k-dt-btn", text: t.updateView, "data-vk": "update", "aria-describedby": id,
                onclick: () => run(() => views.save(active.name), {
                    message: t.viewUpdated(active.name), focus: `load:${active.name}`, errorAt: "list", errorFocus: "update"
                })
            })
        ]));
    };

    const renderItem = (name) => {
        const step = ui.step?.name === name ? ui.step.kind : null;
        if (step === "delete") {
            return el("li", { class: "k-dt-views-item is-step" }, [question(t.confirmDelete(name), t.deleteView, () => remove(name), `delete:${name}`)]);
        }
        if (step === "rename") {
            const input = el("input", {
                type: "text",
                class: "k-dt-input",
                value: ui.renameDraft,
                "aria-label": t.newViewName(name),
                "data-vk": "rename-input",
                "aria-invalid": ui.error?.at === "rename" ? "true" : null,
                "aria-describedby": ui.error?.at === "rename" ? errorId : null,
                oninput: (e) => { ui.renameDraft = e.target.value; },
                onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); rename(name); } }
            });
            return el("li", { class: "k-dt-views-item is-step", onkeydown: onEscape(`rename:${name}`) }, [
                input,
                errorEl("rename"),
                el("div", { class: "k-dt-panel-actions" }, [
                    el("button", { type: "button", class: "k-dt-btn k-dt-btn-primary", text: t.renameView, onclick: () => rename(name) }),
                    el("button", {
                        type: "button", class: "k-dt-btn", text: t.cancel,
                        onclick: () => { ui.step = null; ui.error = null; render(`rename:${name}`); }
                    })
                ])
            ]);
        }
        const isActive = views.active()?.name === name;
        return el("li", { class: "k-dt-views-item" }, [
            el("button", {
                type: "button",
                class: "k-dt-views-load",
                title: t.loadView,
                "data-vk": `load:${name}`,
                "aria-current": isActive ? "true" : null,
                onclick: () => load(name)
            }, [isActive ? iconEl("check") : el("span", { class: "k-dt-ic" }), el("span", { class: "k-dt-views-name", text: name })]),
            el("button", {
                type: "button", class: "k-dt-icon-btn", title: t.renameView,
                "aria-label": t.renameViewNamed(name), "data-vk": `rename:${name}`,
                onclick: () => { ui.step = { kind: "rename", name }; ui.error = null; ui.renameDraft = name; render("rename-input"); }
            }, [iconEl("pencil")]),
            el("button", {
                type: "button", class: "k-dt-icon-btn", title: t.deleteView,
                "aria-label": t.deleteViewNamed(name), "data-vk": `delete:${name}`,
                onclick: () => { ui.step = { kind: "delete", name }; ui.error = null; render("step-cancel"); }
            }, [iconEl("trash")])
        ]);
    };

    const renderList = () => {
        const nodes = [errorEl("list")];
        if (ui.names === null && ui.error?.at === "list") {
            nodes.push(el("button", { type: "button", class: "k-dt-btn", text: t.retry, "data-vk": "retry", onclick: () => loadList("retry") }));
        } else if (ui.names === null) {
            nodes.push(el("p", { class: "k-dt-views-empty", text: t.viewsLoading }));
        } else if (ui.names.length === 0) {
            nodes.push(el("p", { class: "k-dt-views-empty", text: t.noSavedViews }));
        } else {
            nodes.push(el("ul", { class: "k-dt-views-items", "aria-label": t.savedViews }, ui.names.map(renderItem)));
        }
        listSection.replaceChildren(...nodes.filter(Boolean));
    };

    const render = (focusKey) => {
        if (!isOpen()) return;
        const focused = deepActiveElement();
        renderActive();
        const nameError = ui.error?.at === "name";
        if (nameError) {
            nameInput.setAttribute("aria-invalid", "true");
            nameInput.setAttribute("aria-describedby", errorId);
        } else {
            nameInput.removeAttribute("aria-invalid");
            nameInput.removeAttribute("aria-describedby");
        }
        saveExtra.replaceChildren(...[
            errorEl("name"),
            ui.step?.kind === "overwrite" && question(t.confirmOverwrite(ui.step.name), t.overwrite, () => doSave(ui.step.name), "name")
        ].filter(Boolean));
        renderList();
        const target = focusKey && panel.querySelector(`[data-vk="${CSS.escape(focusKey)}"]`);
        if (target) target.focus();
        else if (!focused?.isConnected || !panel.contains(focused)) nameInput.focus();
    };

    // Runs an adapter action; failures stay in the panel as a message.
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
    const fail = (text, at, focusKey) => {
        ui.error = { text, at };
        render(focusKey);
        announce(text);
    };

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
    const doSave = (name) => run(async () => {
        await views.save(name);
        nameInput.value = "";
    }, { message: t.viewSaved(name), focus: "name", errorAt: "name", errorFocus: "name" });

    const rename = (oldName) => {
        const newName = ui.renameDraft.trim();
        if (!newName) return fail(t.viewNameRequired, "rename", "rename-input");
        if (newName === oldName) { ui.step = null; ui.error = null; render(`rename:${oldName}`); return; }
        if (ui.names?.includes(newName)) return fail(t.viewNameTaken(newName), "rename", "rename-input");
        run(() => views.rename(oldName, newName), {
            message: t.viewRenamed(oldName, newName), focus: `load:${newName}`, errorAt: "rename", errorFocus: "rename-input"
        });
    };

    const remove = (name) => {
        const index = ui.names?.indexOf(name) ?? -1;
        run(() => views.remove(name), {
            message: t.viewDeleted(name),
            // Focus the next view, else the previous one, else the name field.
            focus: () => {
                const next = ui.names[index] ?? ui.names[index - 1];
                return next != null ? `load:${next}` : "name";
            },
            errorAt: "list",
            errorFocus: "step-cancel"
        });
    };

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
        announce(ui.error.text);
    };

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
