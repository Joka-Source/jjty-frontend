import createModule from 'bentopdf-pdfium';
import wasmUrl from 'bentopdf-pdfium/editcore.wasm?url';

export const ENGINE_BUILD='bentopdf-pdfium@0.0.0-8ff5002c6cd5';
export function createEngineModule(options={}) {
  return createModule({...options,locateFile:(file,prefix)=>file.endsWith('.wasm')?wasmUrl:`${prefix}${file}`});
}
