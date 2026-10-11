// Lightweight, reusable context menu.
// Rendered in the table shadow root, positioned with `position: fixed` at the pointer.
// Supports separators, icons, disabled/checked items, and one level of submenus.
//
// Keyboard (WAI-ARIA menu pattern): ArrowUp/ArrowDown move, Home/End jump,
// ArrowRight/ArrowLeft open/close a submenu, Enter/Space activate,
// Escape/Tab close. On close via keyboard or activation, focus returns to the
// opener (see `restoreFocus`).

import { createIcon } from "./icons.js";

let activeMenu = null;

// items: array of
//   { separator: true }
//   { label, icon?, danger?, disabled?, checked?, onSelect?, submenu?: items[] }
//
// options:
//   x, y          pointer position (ignored for `sheet`)
//   label         accessible name of the menu
//   sheet         render as bottom sheet (touch)
//   restoreFocus  () => void — called after a keyboard close / activation when
//                 focus would otherwise be lost
//   onClose       () => void
export function openContextMenu(root, { x, y, items, label, onClose, restoreFocus, sheet = false } = {}) {
    closeContextMenu();

    const menu = buildMenu(items, (options) => closeContextMenu(options));
    if (label) menu.setAttribute("aria-label", label);
    if (sheet) menu.classList.add("k-ctx-menu--sheet");
    // The menu lives outside the table root, so suppress the native menu here too
    // (e.g. long-press directly on an open menu item).
    menu.addEventListener("contextmenu", (event) => event.preventDefault());
    menu.addEventListener("keydown", (event) => handleMenuKey(event, menu));
    root.appendChild(menu);

    if (!sheet) {
        // Position synchronously (so the menu can take focus right away) and keep it within the viewport.
        const rect = menu.getBoundingClientRect();
        let left = x;
        let top = y;
        if (left + rect.width > window.innerWidth) left = Math.max(4, window.innerWidth - rect.width - 4);
        if (top + rect.height > window.innerHeight) top = Math.max(4, window.innerHeight - rect.height - 4);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }
    focusItem(menuItems(menu)[0]);

    const handleOutside = (event) => {
        const path = event.composedPath ? event.composedPath() : [event.target];
        if (!path.includes(menu)) closeContextMenu();
    };
    // Escape while focus is elsewhere (e.g. menu opened by pointer).
    const handleKey = (event) => {
        if (event.key === "Escape") closeContextMenu({ restoreFocus: true });
    };
    // Only a real window blur (switching apps/tabs) — element blurs inside the
    // page also reach a capturing window listener.
    const handleBlur = (event) => {
        if (event.target === window) closeContextMenu();
    };

    // Register on next tick so the opening click does not close immediately.
    const timer = setTimeout(() => {
        document.addEventListener("pointerdown", handleOutside, true);
        document.addEventListener("keydown", handleKey, true);
        window.addEventListener("blur", handleBlur, true);
    }, 0);

    activeMenu = {
        el: menu,
        restoreFocus,
        cleanup: () => {
            clearTimeout(timer);
            document.removeEventListener("pointerdown", handleOutside, true);
            document.removeEventListener("keydown", handleKey, true);
            window.removeEventListener("blur", handleBlur, true);
            onClose?.();
        }
    };
    return menu;
}

// options.restoreFocus: return focus to the opener if it would otherwise be lost.
export function closeContextMenu({ restoreFocus = false } = {}) {
    if (!activeMenu) return;
    // Clear the reference first: removing the (focused) menu fires a synchronous
    // `blur`; any re-entrant call must be a no-op, avoiding a double removal
    // ("node is no longer a child") error.
    const current = activeMenu;
    activeMenu = null;
    const hadFocus = current.el.contains(deepActiveElement());
    current.el.remove();
    current.cleanup();
    if (restoreFocus && current.restoreFocus && (hadFocus || focusIsLost())) current.restoreFocus();
}

export function isContextMenuOpen() {
    return activeMenu !== null;
}

// ---- Keyboard -------------------------------------------------------------

function menuItems(menu) {
    // Direct items of this menu level only (submenu items belong to their own level).
    return Array.from(menu.querySelectorAll('[role^="menuitem"]'))
        .filter((item) => item.closest('[role="menu"]') === menu);
}

function focusItem(item) {
    if (!item) return;
    const menu = item.closest('[role="menu"]');
    menuItems(menu).forEach((i) => { i.tabIndex = -1; });
    item.tabIndex = 0;
    item.focus();
}

function openSubmenu(entry) {
    const wrap = entry.parentElement;
    wrap.classList.add("is-open");
    entry.setAttribute("aria-expanded", "true");
    focusItem(menuItems(wrap.querySelector('[role="menu"]'))[0]);
}

function closeSubmenu(submenu) {
    const wrap = submenu.parentElement;
    const entry = wrap.querySelector(':scope > [role^="menuitem"]');
    wrap.classList.remove("is-open");
    entry.setAttribute("aria-expanded", "false");
    focusItem(entry);
}

function handleMenuKey(event, rootMenu) {
    const item = event.target.closest('[role^="menuitem"]');
    if (!item) return;
    const menu = item.closest('[role="menu"]');
    const items = menuItems(menu);
    const index = items.indexOf(item);
    const isSub = menu !== rootMenu;

    switch (event.key) {
        case "ArrowDown":
            focusItem(items[(index + 1) % items.length]);
            break;
        case "ArrowUp":
            focusItem(items[(index - 1 + items.length) % items.length]);
            break;
        case "Home":
            focusItem(items[0]);
            break;
        case "End":
            focusItem(items[items.length - 1]);
            break;
        case "ArrowRight":
            if (item.getAttribute("aria-haspopup") === "menu") openSubmenu(item);
            else return;
            break;
        case "ArrowLeft":
            if (isSub) closeSubmenu(menu);
            else return;
            break;
        case "Escape":
            if (isSub) closeSubmenu(menu);
            else closeContextMenu({ restoreFocus: true });
            break;
        case "Tab":
            closeContextMenu({ restoreFocus: true });
            break;
        default:
            return;
    }
    event.preventDefault();
    event.stopPropagation();
}

// ---- Building -------------------------------------------------------------

function buildMenu(items, requestClose, isSubmenu = false) {
    const menu = document.createElement("div");
    menu.className = "k-ctx-menu" + (isSubmenu ? " k-ctx-submenu" : "");
    menu.setAttribute("role", "menu");

    (items || []).forEach((item) => {
        if (!item) return;
        if (item.separator) {
            const sep = document.createElement("div");
            sep.className = "k-ctx-sep";
            sep.setAttribute("role", "separator");
            menu.appendChild(sep);
            return;
        }

        const entry = document.createElement("button");
        entry.type = "button";
        entry.className = "k-ctx-item" + (item.danger ? " k-ctx-danger" : "");
        entry.setAttribute("role", item.checked != null ? "menuitemcheckbox" : "menuitem");
        if (item.checked != null) entry.setAttribute("aria-checked", String(!!item.checked));
        entry.tabIndex = -1;
        if (item.disabled) entry.setAttribute("aria-disabled", "true");

        const icon = document.createElement("span");
        icon.className = "k-ctx-icon";
        if (item.icon) icon.appendChild(createIcon(item.icon));
        else if (item.checked) icon.appendChild(createIcon("check"));
        entry.appendChild(icon);

        const label = document.createElement("span");
        label.className = "k-ctx-label";
        label.textContent = item.label ?? "";
        entry.appendChild(label);

        if (item.submenu && item.submenu.length) {
            const arrow = document.createElement("span");
            arrow.className = "k-ctx-arrow";
            arrow.setAttribute("aria-hidden", "true");
            arrow.textContent = "›";
            entry.appendChild(arrow);
            entry.setAttribute("aria-haspopup", "menu");
            entry.setAttribute("aria-expanded", "false");

            const sub = buildMenu(item.submenu, requestClose, true);
            sub.setAttribute("aria-label", item.label ?? "");
            const wrap = document.createElement("div");
            wrap.className = "k-ctx-haschild";
            wrap.appendChild(entry);
            wrap.appendChild(sub);
            // Click/tap toggles the submenu (hover opens it via CSS on desktop).
            entry.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (wrap.classList.contains("is-open")) closeSubmenu(sub);
                else openSubmenu(entry);
            });
            menu.appendChild(wrap);
            return;
        }

        if (!item.disabled) {
            entry.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                // Close first so the action may move focus (e.g. open a panel);
                // focus is only restored if nothing else took it.
                const restore = activeMenu?.restoreFocus;
                requestClose();
                item.onSelect?.(event);
                if (focusIsLost()) restore?.();
            });
        }
        menu.appendChild(entry);
    });

    return menu;
}

// ---- Focus helpers --------------------------------------------------------

function deepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

function focusIsLost() {
    const active = deepActiveElement();
    return !active || active === document.body || !active.isConnected;
}

export { deepActiveElement };
