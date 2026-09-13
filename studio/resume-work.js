const key='jetty-last-real-work';
const valid=route=>route==='#files'||/^#(?:editor|scan)\/[A-Za-z0-9._:%-]+(?:\/[1-9][0-9]*)?$/.test(route);
export function rememberWork(route){if(valid(route))try{localStorage.setItem(key,route);}catch{}}
export function resumeWork(){if(location.hash)return;try{const route=localStorage.getItem(key);if(valid(route))history.replaceState(null,'',route);}catch{}}
