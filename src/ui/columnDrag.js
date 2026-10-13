// Moving a column from its header cell: Ctrl+Shift+←/→ (Ctrl+Alt+arrows
// belong to screen reader table navigation and the Windows Magnifier,
// Alt+Shift switches the Windows keyboard layout) and drag and drop.

// `drag`: { key } shared by the header cells of one table (the dragged column).
// `canDrag()`: drag and drop is offered (not on touch, where a long-press
// opens the context menu). `onStep(step)`: keyboard move by -1/+1.
// `onDrop(draggedKey, after)`: dropped on this cell, before or after it.
/**
 * @param {HTMLTableCellElement} th
 * @param {{ key: string, label: string, drag: { key: string|null }, canDrag: () => boolean,
 *     onStep: (step: number) => void, onDrop: (draggedKey: string, after: boolean) => void }} options
 */
export function bindColumnMove(th, { key, label, drag, canDrag, onStep, onDrop }) {
    th.addEventListener("keydown", (event) => {
        if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onStep(event.key === "ArrowLeft" ? -1 : 1);
    });

    th.draggable = canDrag();
    const row = () => th.parentElement;
    const clearMarks = () => row()?.querySelectorAll(".is-drop-before, .is-drop-after")
        .forEach((n) => n.classList.remove("is-drop-before", "is-drop-after"));
    // Drop before or after `th`, depending on the half the pointer is over.
    /** @param {DragEvent} event */
    const dropAfter = (event) => {
        const rect = th.getBoundingClientRect();
        return event.clientX > rect.left + rect.width / 2;
    };
    th.addEventListener("dragstart", (event) => {
        if (!canDrag()) { event.preventDefault(); return; }
        drag.key = key;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", label);
        }
        th.classList.add("is-dragging");
    });
    th.addEventListener("dragover", (event) => {
        if (!drag.key) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        clearMarks();
        if (drag.key !== key) th.classList.add(dropAfter(event) ? "is-drop-after" : "is-drop-before");
    });
    th.addEventListener("dragleave", (event) => {
        if (!th.contains(/** @type {Node|null} */ (event.relatedTarget))) th.classList.remove("is-drop-before", "is-drop-after");
    });
    th.addEventListener("drop", (event) => {
        if (!drag.key) return;
        event.preventDefault();
        clearMarks();
        onDrop(drag.key, dropAfter(event));
    });
    th.addEventListener("dragend", () => {
        drag.key = null;
        clearMarks();
        th.classList.remove("is-dragging");
    });
}
