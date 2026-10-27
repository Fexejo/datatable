// jw-datatable styles as a string (injected into the shadow root).
//
// Mobile First: the base rules target small / touch screens (compact spacing,
// 44px touch targets, always-visible copy buttons, stacked toolbar & footer).
// The `@media (min-width: 640px)` block then layers on the roomier desktop
// experience (more padding, hover-reveal copy buttons, inline pagination).
// Touch screens at that width (tablets) keep the desktop layout but get the
// touch targets and visible copy buttons back (`(pointer: coarse)` block).
// Overlays and the context menu use explicit `--sheet` modifiers (toggled from
// JS via matchMedia) so they turn into bottom sheets on phones.
//
// Theme variables `--jw-dt-*` are read with their default as fallback and never
// set here, so a page can set them on any ancestor (README "Theming"). Internal
// variables are `--dt-*`.
// Extra CSS via `config.styles`; style elements via `part` (root, toolbar, table, grid, card, footer).
//
// The CSS is split by area into src/ui/styles/; this joins the parts in a
// fixed order, which matters: later rules override earlier ones of the same
// specificity, and the media blocks of `responsive.js` come last.

import { baseStyles } from "./styles/base.js";
import { tableStyles } from "./styles/table.js";
import { cardStyles } from "./styles/cards.js";
import { footerStyles } from "./styles/footer.js";
import { overlayStyles } from "./styles/overlays.js";
import { controlStyles } from "./styles/controls.js";
import { panelStyles } from "./styles/panels.js";
import { a11yStyles } from "./styles/a11y.js";
import { responsiveStyles } from "./styles/responsive.js";

export const datatableStyles = [
    baseStyles,
    tableStyles,
    cardStyles,
    footerStyles,
    overlayStyles,
    controlStyles,
    panelStyles,
    a11yStyles,
    responsiveStyles
].join("");
