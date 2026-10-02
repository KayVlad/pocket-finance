import type {Plugin} from 'vite';

// Browser extensions inject errors into the page's global error events.
// Keep them in the browser console, but out of the app's development overlay.
const extensionFilter = `
if (typeof window !== 'undefined' && !window.__pocketExtensionErrorFilter) {
  window.__pocketExtensionErrorFilter = true;
  const fromExtension = value => typeof value === 'string' && /(?:chrome|moz)-extension:\\/\\//.test(value);
  window.addEventListener('unhandledrejection', event => {
    if (fromExtension(event.reason?.stack)) event.stopImmediatePropagation();
  }, true);
  window.addEventListener('error', event => {
    if (fromExtension(event.filename) || fromExtension(event.error?.stack)) event.stopImmediatePropagation();
  }, true);
}
`;

export function devExtensionErrors():Plugin {
 return {
  name:'pocket-dev-extension-errors',
  apply:'serve',
  enforce:'pre',
  transform(source,id){
   const path=id.replaceAll('\\','/').split('?')[0];
   if(!path.endsWith('/vinext/dist/client/dev-error-overlay.js'))return;
   return {code:extensionFilter+source,map:null};
  },
 };
}
