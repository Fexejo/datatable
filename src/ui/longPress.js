// Long-press detection for touch (opens the context menu, like a right-click).

// Waits until the touch that started with `event` has stayed down on `node`
// for `delay` ms without moving more than `tolerance` px, then calls
// `onPress(x, y)`. Lifting, cancelling, leaving or moving the finger ends the
// wait. Returns a function that cancels it.
export function waitForLongPress(node, event, onPress, { delay = 500, tolerance = 10 } = {}) {
    const startX = event.clientX;
    const startY = event.clientY;
    const onMove = (ev) => {
        if (Math.abs(ev.clientX - startX) > tolerance || Math.abs(ev.clientY - startY) > tolerance) cancel();
    };
    const ends = ["pointerup", "pointercancel", "pointerleave"];
    const cancel = () => {
        clearTimeout(timer);
        node.removeEventListener("pointermove", onMove);
        for (const type of ends) node.removeEventListener(type, cancel);
    };
    node.addEventListener("pointermove", onMove);
    for (const type of ends) node.addEventListener(type, cancel);
    const timer = setTimeout(() => {
        cancel();
        onPress(startX, startY);
    }, delay);
    return cancel;
}
