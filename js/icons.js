/**
 * Tiny inline icon set (Lucide-style, 24×24, stroke-based) so the app has no
 * icon-font or JS dependency and works offline once cached.
 */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  ticket:
    '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4Z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.5 21a2 2 0 0 0 3 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:
    '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M17.5 14.2A6.2 6.2 0 0 1 22 20"/>',
  chart:
    '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  wrench:
    '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6l-2.8 2.8-2.3-.6-.6-2.3Z"/>',
  "alert-triangle":
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  siren:
    '<path d="M7 18v-5a5 5 0 0 1 10 0v5"/><path d="M5 21h14"/><path d="M5 18h14"/><path d="M12 3V1M4.2 5.2 2.8 3.8M19.8 5.2l1.4-1.4"/><path d="M9 18v-4a3 3 0 0 1 6 0v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  camera:
    '<path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.6"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 16-5-5L5 20"/>',
  "chevron-left": '<path d="m15 5-7 7 7 7"/>',
  "chevron-right": '<path d="m9 5 7 7-7 7"/>',
  "chevron-down": '<path d="m5 9 7 7 7-7"/>',
  "chevron-up": '<path d="m5 15 7-7 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 4.8 4.8"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  "log-in": '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  "arrow-right": '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
  "arrow-left": '<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>',
  "arrow-up-right": '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  "arrow-down": '<path d="M12 4v16"/><path d="m6 14 6 6 6-6"/>',
  "arrow-up": '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 3h16"/>',
  refresh:
    '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.4-2L20 9"/><path d="M4 15l2.5 2A7 7 0 0 0 18 15"/>',
  "map-pin": '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  "calendar-check":
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8.5 15.5 2 2 4-4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 0 1 8-8h2a8 8 0 0 1 8 4Z"/>',
  shield: '<path d="M12 3 4.5 6v6c0 5 7.5 9 7.5 9s7.5-4 7.5-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  clipboard:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  "clipboard-check":
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="m9 13 2 2 4-4"/>',
  hammer:
    '<path d="m14 6 4 4"/><path d="M3 21l9.5-9.5"/><path d="M12.5 4.5 15 2l7 7-2.5 2.5Z"/><path d="m14 6 4 4-8 8H5v-5Z"/>',
  droplet: '<path d="M12 3S5 10 5 15a7 7 0 0 0 14 0c0-5-7-12-7-12Z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  building:
    '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/><path d="M10 21v-3h4v3"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  rotate:
    '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  flag: '<path d="M5 21V4"/><path d="M5 5c4-2 8 2 14 0v9c-6 2-10-2-14 0"/>',
  "user-check": '<circle cx="9" cy="8" r="3.5"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="m16 12 2 2 4-4"/>',
  "user-plus": '<circle cx="9" cy="8" r="3.5"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M19 8v6M16 11h6"/>',
  phone: '<path d="M22 16.9v2.6a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 3.8 2 2 0 0 1 4.1 1.6h2.6a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L7.8 9.4a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  "wifi-off":
    '<path d="M2 2l20 20"/><path d="M8.5 8.5A11 11 0 0 1 22 9"/><path d="M2 9a15.9 15.9 0 0 1 4.6-2.7"/><path d="M5 13a10.9 10.9 0 0 1 4.2-2.1"/><path d="M12 20h.01"/><path d="M8.5 16.5a5.5 5.5 0 0 1 7 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m17 6 2 2M14 9l2 2"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  "external-link": '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  minus: '<path d="M5 12h14"/>',
  "file-text":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  "check-square": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
  "book-open":
    '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z"/>',
  "arrow-up-down": '<path d="M8 4v16"/><path d="m4 8 4-4 4 4"/><path d="M16 20V4"/><path d="m12 16 4 4 4-4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>',
  gauge: '<path d="M4 19a9 9 0 1 1 16 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1"/>',
  "circle-help": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.9"/><path d="M12 17h.01"/>',
  inbox: '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 4h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z"/>',
  "bar-chart": '<path d="M5 20v-7M12 20V5M19 20v-4"/><path d="M2 20h20"/>',
  "pie-chart": '<path d="M21 12A9 9 0 1 1 12 3v9Z"/><path d="M16 3.9A9 9 0 0 1 20.1 8H16Z"/>',
  "more-horizontal": '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  play: '<path d="m7 4 13 8-13 8Z"/>',
  sparkles:
    '<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z"/>',
  "shield-check": '<path d="M12 3 4.5 6v6c0 5 7.5 9 7.5 9s7.5-4 7.5-9V6Z"/><path d="m8.5 12 2.2 2.2 4.8-4.8"/>',
};

export function icon(name, className = "") {
  const body = ICONS[name] ?? ICONS.flag;
  return `<svg class="${className}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}
