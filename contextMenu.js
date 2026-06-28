// Lightweight, reusable context menu.
// Rendered in the table shadow root, positioned with `position: fixed` at the pointer.
// Supports separators, icons, disabled/checked items, and one level of submenus.

import { iconSvg } from "./icons.js";

let activeMenu = null;

// items: array of
//   { separator: true }
//   { label, icon?, danger?, disabled?, checked?, onSelect?, submenu?: items[] }
export function openContextMenu(root, { x, y, items, onClose, sheet = false } = {}) {
    closeContextMenu();

    const menu = buildMenu(items, () => closeContextMenu());
    if (sheet) menu.classList.add("k-ctx-menu--sheet");
    // The menu lives outside the table root, so suppress the native menu here too
    // (e.g. long-press directly on an open menu item).
    menu.addEventListener("contextmenu", (event) => event.preventDefault());
    menu.style.visibility = "hidden";
    root.appendChild(menu);

    if (sheet) {
        // Bottom sheet on touch: CSS positions it, no viewport math needed.
        requestAnimationFrame(() => {
            menu.style.visibility = "visible";
            const first = menu.querySelector('[role="menuitem"]:not([aria-disabled="true"])');
            first?.focus();
        });
    } else {
        // Position and keep within the viewport.
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let left = x;
            let top = y;
            if (left + rect.width > vw) left = Math.max(4, vw - rect.width - 4);
            if (top + rect.height > vh) top = Math.max(4, vh - rect.height - 4);
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.visibility = "visible";
            const first = menu.querySelector('[role="menuitem"]:not([aria-disabled="true"])');
            first?.focus();
        });
    }

    const handleOutside = (event) => {
        const path = event.composedPath ? event.composedPath() : [event.target];
        if (!path.includes(menu)) closeContextMenu();
    };
    const handleKey = (event) => {
        if (event.key === "Escape") closeContextMenu();
    };

    // Register on next tick so the opening click does not close immediately.
    setTimeout(() => {
        document.addEventListener("pointerdown", handleOutside, true);
        document.addEventListener("keydown", handleKey, true);
        window.addEventListener("blur", closeContextMenu, true);
    }, 0);

    activeMenu = {
        el: menu,
        cleanup: () => {
            document.removeEventListener("pointerdown", handleOutside, true);
            document.removeEventListener("keydown", handleKey, true);
            window.removeEventListener("blur", closeContextMenu, true);
            onClose?.();
        }
    };
    return menu;
}

export function closeContextMenu() {
    if (!activeMenu) return;
    // Clear the reference first: removing the (focused) menu fires a synchronous
    // `blur`, whose capture-phase listener calls closeContextMenu() again. With
    // the reference already nulled that re-entrant call is a no-op, avoiding a
    // double removal ("node is no longer a child") error.
    const current = activeMenu;
    activeMenu = null;
    current.el.remove();
    current.cleanup();
}

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
        entry.setAttribute("role", "menuitem");
        entry.tabIndex = -1;
        if (item.disabled) entry.setAttribute("aria-disabled", "true");

        const icon = document.createElement("span");
        icon.className = "k-ctx-icon";
        if (item.icon) icon.innerHTML = iconSvg(item.icon, item.icon);
        else if (item.checked) icon.innerHTML = iconSvg("calendarCheck", "calendarCheck");
        entry.appendChild(icon);

        const label = document.createElement("span");
        label.className = "k-ctx-label";
        label.textContent = item.label ?? "";
        entry.appendChild(label);

        if (item.submenu && item.submenu.length) {
            const arrow = document.createElement("span");
            arrow.className = "k-ctx-arrow";
            arrow.textContent = "›";
            entry.appendChild(arrow);

            const sub = buildMenu(item.submenu, requestClose, true);
            const wrap = document.createElement("div");
            wrap.className = "k-ctx-haschild";
            wrap.appendChild(entry);
            wrap.appendChild(sub);
            menu.appendChild(wrap);
            return;
        }

        if (!item.disabled) {
            entry.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                item.onSelect?.(event);
                requestClose();
            });
        }
        menu.appendChild(entry);
    });

    return menu;
}
