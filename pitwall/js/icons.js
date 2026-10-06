'use strict';
// 小さな絵(アイコン)。SVG を文字で持っておき、画面に埋めこむ。
(function () {
  const s = (body, vb = '0 0 24 24') => `<svg class="ico" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  window.PW.ICON = {
    sun: s('<circle cx="12" cy="12" r="5" fill="#f2c14e"/><g stroke="#f2c14e" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></g>'),
    cloud: s('<path d="M7 18h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z" fill="#e8dfcc"/>'),
    rain: s('<path d="M7 14h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 5.5 4.3 4.3 0 0 0 7 14z" fill="#b9c3cf"/><g stroke="#7fb0e0" stroke-width="2" stroke-linecap="round"><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></g>'),
    storm: s('<path d="M7 13h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 4.5 4.3 4.3 0 0 0 7 13z" fill="#8d97a6"/><path d="M12 13l-3 5h3l-2 5 5-7h-3l2-3z" fill="#f2c14e"/><g stroke="#7fb0e0" stroke-width="2" stroke-linecap="round"><path d="M6 16l-1 3M18 16l-1 3"/></g>'),
    fuel: s('<rect x="4" y="4" width="11" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="6.5" y="7" width="6" height="4" fill="currentColor"/><path d="M15 9h2l2 2v7a1.5 1.5 0 0 1-3 0v-3h-1" fill="none" stroke="currentColor" stroke-width="2"/>'),
    tire: s('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>'),
    wrench: s('<path d="M14.5 3.5a5 5 0 0 0-5.6 6.7L3 16.1 5.9 19l5.9-5.9a5 5 0 0 0 6.7-5.6l-3 3-2.8-.7-.7-2.8 3-3z" fill="currentColor"/>'),
    engine: s('<path d="M4 9h3l2-2h5v2h2l2 2h2v6h-2l-2 2H9l-2-2H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 4h4" stroke="currentColor" stroke-width="2"/>'),
    gear: s('<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2l1.5 3 3.3-.6.6 3.3 3 1.5-1.6 2.8 1.6 2.8-3 1.5-.6 3.3-3.3-.6L12 22l-1.5-3-3.3.6-.6-3.3-3-1.5L5.2 12 3.6 9.2l3-1.5.6-3.3 3.3.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    brake: s('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6a9 9 0 0 1 12 0" fill="none" stroke="#e2483d" stroke-width="3"/><circle cx="12" cy="12" r="2" fill="currentColor"/>'),
    bolt: s('<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="#f2c14e"/>'),
    flag: s('<path d="M5 3v18" stroke="currentColor" stroke-width="2"/><path d="M6 4h12l-3 4 3 4H6z" fill="currentColor"/>'),
    chequer: s('<path d="M5 3v18" stroke="currentColor" stroke-width="2"/><rect x="6" y="4" width="13" height="9" fill="#f4f1ea"/><path d="M6 4h3.25v3H6zM12.5 4h3.25v3H12.5zM9.25 7h3.25v3H9.25zM15.75 7H19v3h-3.25zM6 10h3.25v3H6zM12.5 10h3.25v3H12.5z" fill="#111"/>'),
    helmet: s('<path d="M3 15a9 9 0 0 1 18-2v4H9l-2 2H4z" fill="currentColor"/><path d="M12 10h8" stroke="#2d2a32" stroke-width="2.5"/>'),
    eye: s('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    coin: s('<circle cx="12" cy="12" r="9" fill="#d4a64a"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#8a6526" stroke-width="1.5"/><text x="12" y="16" font-size="10" text-anchor="middle" fill="#5a3d16" font-weight="700">¥</text>'),
    crew: s('<circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="7" r="3" fill="currentColor"/><path d="M2 20a6 6 0 0 1 12 0zM10 20a6 6 0 0 1 12 0z" fill="currentColor"/>'),
    wing: s('<path d="M2 9h20v3H2z" fill="currentColor"/><path d="M5 12v6M19 12v6" stroke="currentColor" stroke-width="2"/><path d="M2 9l2-3M22 9l-2-3" stroke="currentColor" stroke-width="2"/>'),
    radio: s('<rect x="4" y="8" width="16" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8l8-5" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="14.5" r="2.5" fill="currentColor"/><path d="M14 13h3M14 16h3" stroke="currentColor" stroke-width="2"/>'),
    trophy: s('<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#d4a64a"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" fill="none" stroke="#d4a64a" stroke-width="2"/><path d="M11 13h2v4h3v3H8v-3h3z" fill="#d4a64a"/>'),
    camera: s('<rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13.5" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 7l2-3h4l2 3" fill="none" stroke="currentColor" stroke-width="2"/>'),
    pause: s('<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>'),
    play: s('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
    book: s('<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v14" stroke="currentColor" stroke-width="2"/>'),
  };
})();
