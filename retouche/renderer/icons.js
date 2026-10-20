// Icônes des outils, dessinées en SVG (traits fins, couleur du texte).
// Les icônes des boutons ordinaires viennent de Codicons, comme dans Rune.

const svgIcon = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  move: svgIcon('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  select: svgIcon('<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2.4"/>'),
  crop: svgIcon('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>'),
  brush: svgIcon('<path d="M19.5 3.5c-3 1.6-8.2 6.6-9.6 9.1l1.5 1.5c2.5-1.4 7.5-6.6 9.1-9.6a.75.75 0 0 0-1-1z"/><path d="M9.2 13.4c-2 .2-3.3 1.6-3.5 3.6-.1 1.3-.9 2.2-2.2 2.6 2.9 1.4 6.9.6 7.6-2.6.2-.9.1-1.7-.4-2.3z"/>'),
  eraser: svgIcon('<path d="M7 21h13"/><path d="M5.6 15.6l8.5-8.5a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L12 18.8a2 2 0 0 1-1.4.6H8.4a2 2 0 0 1-1.4-.6l-1.4-1.4a2 2 0 0 1 0-1.8z"/><path d="M9 12l5 5"/>'),
  eyedropper: svgIcon('<path d="M14.5 6.5l3 3"/><path d="M19.6 4.4a2 2 0 0 0-2.8 0l-2.3 2.3-1-1-1.4 1.4 1 1L5.6 15.6a2 2 0 0 0-.6 1.4V19h2a2 2 0 0 0 1.4-.6l7.5-7.5 1 1 1.4-1.4-1-1 2.3-2.3a2 2 0 0 0 0-2.8z"/>'),
  fill: svgIcon('<path d="M5 11l7-7 8 8-7 7a2 2 0 0 1-2.8 0L5 13.8A2 2 0 0 1 5 11z"/><path d="M5 12h15"/><path d="M20.5 16s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>'),
  text: svgIcon('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  hand: svgIcon('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.6 15.6a1.6 1.6 0 0 1 2.3-2.2L8 14.5"/>'),
  zoom: svgIcon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M8 10.5h5M10.5 8v5"/>'),
};
