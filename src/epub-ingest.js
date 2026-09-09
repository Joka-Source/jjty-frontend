import {makeResult} from 'jt-connectors/src/core/result.ts';
import {openEpubPackage,EPUB_LIMITS} from './epub-package.js';
import {prepareEpubChapter} from './epub-content.js';

// The archive remains the authority. Chapter DOM and text are disposable views.
export async function ingestEpub(bytes,{name,document=globalThis.document}={}){
 if(bytes.byteLength>EPUB_LIMITS.sourceBytes)throw new Error('EPUB_SOURCE_LIMIT');
 const sourceBytes=bytes.slice(),book=await openEpubPackage(sourceBytes);
 if(book.layout==='pre-paginated')throw new Error('This book uses fixed page layouts. Fixed-layout EPUB reading is not available yet.');
 const drafts=[],warnings=[...(book.warnings??[])];
 for(let i=0;i<book.spine.length;i++){
  const chapter=prepareEpubChapter(book,i,{document,scopeId:`epub-import-${i}`});
  try{drafts.push(...chapter.blocks.map(({text,kind,locator})=>({text,kind,locator})));warnings.push(...chapter.warnings);}
  finally{chapter.dispose();}
 }
 const result=await makeResult(sourceBytes,drafts,{sourceKind:'epub',name,title:book.title},[...new Set(warnings)]);
 return {...result,sourceBytes,sourceMime:'application/epub+zip'};
}
