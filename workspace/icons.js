const paths = [
 'M3 5h18v14H3z M3 6l9 7 9-7',
 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
 'M4 3h12l4 4v14H4z M8 10h8 M8 14h8 M8 18h5',
 'M5 3h10l4 4v6 M5 3v18h7 M14 18l5-5 3 3-5 5h-3z',
 'M9 8l-2-2a3 3 0 00-4 4l4 4a3 3 0 004 0 M15 16l2 2a3 3 0 004-4l-4-4a3 3 0 00-4 0 M8 16l8-8',
 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
];
export function navigationIcon(index) {return `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="${paths[index]}"/></svg>`;}
