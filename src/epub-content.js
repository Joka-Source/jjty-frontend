import createDOMPurify from 'dompurify';
import * as cssTree from 'css-tree';
import {resolveEpubHref} from './epub-package.js';

const tags=['html','head','body','a','abbr','address','article','aside','b','bdi','bdo','blockquote','br','caption','cite','code','col','colgroup','dd','del','details','dfn','div','dl','dt','em','figcaption','figure','h1','h2','h3','h4','h5','h6','hr','i','img','ins','kbd','li','main','nav','header','footer','mark','ol','p','pre','q','rp','rt','ruby','s','samp','section','small','span','strong','sub','summary','sup','table','tbody','td','tfoot','th','thead','tr','u','ul','var','wbr','style','link'];
const attributes=['id','class','title','lang','xml:lang','dir','href','src','alt','width','height','colspan','rowspan','scope','start','reversed','value','style','rel','type','media','role','aria-label','aria-labelledby','aria-describedby','epub:type'];
const properties=new Set(('color background-color background-image background-position background-size background-repeat border border-color border-style border-width border-top border-right border-bottom border-left border-radius border-collapse border-spacing box-sizing caption-side clear direction display empty-cells float font-family font-size font-style font-weight font-variant font-variant-caps font-stretch font-feature-settings font-kerning hyphens letter-spacing line-height list-style list-style-type list-style-position list-style-image margin margin-top margin-right margin-bottom margin-left max-width min-width width max-height min-height height orphans padding padding-top padding-right padding-bottom padding-left page-break-before page-break-after page-break-inside break-before break-after break-inside text-align text-align-last text-decoration text-decoration-color text-decoration-line text-decoration-style text-indent text-transform text-underline-offset unicode-bidi vertical-align white-space widows word-break word-spacing overflow-wrap writing-mode').split(' '));
const functions=new Set(['rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color','color-mix','calc','min','max','clamp','linear-gradient','radial-gradient','repeating-linear-gradient','repeating-radial-gradient']);
const blockTags=new Set('ADDRESS ARTICLE ASIDE BLOCKQUOTE CAPTION DD DIV DL DT FIGCAPTION FIGURE H1 H2 H3 H4 H5 H6 LI MAIN OL P PRE SECTION TABLE TBODY TD TFOOT TH THEAD TR UL'.split(' '));
const decoder=new TextDecoder();
const pathOnly=href=>href.split('#')[0];
const mimeAllowed=(mime,kind)=>kind==='image'?['image/png','image/jpeg','image/gif','image/webp','image/avif','image/svg+xml'].includes(mime):kind==='font'?['font/woff','font/woff2','font/ttf','font/otf','application/font-woff','application/vnd.ms-opentype','application/x-font-ttf','application/x-font-opentype'].includes(mime):mime==='text/css';

/** A detached, sanitized chapter. The caller owns mounting, navigation and dispose. */
export function prepareEpubChapter(book,spineIndex,{document,scopeId}={}){
 if(!document?.defaultView||!/^epub-[A-Za-z0-9_-]+$/.test(scopeId??''))throw new Error('EPUB_RENDER_SCOPE_INVALID');
 const chapter=book.spine?.[spineIndex],bytes=book.resources?.get(chapter?.href);
 if(!chapter||!bytes)throw new Error('EPUB_CHAPTER_MISSING');
 const purify=createDOMPurify(document.defaultView),warnings=[],ownedUrls=[],urlCache=new Map(),manifest=new Map((book.manifest??[]).map(item=>[item.href,item])),idMap=new Map(),fonts=new Map();
 const warn=message=>{if(!warnings.includes(message))warnings.push(message);};
 const element=document.createElement('section');element.id=scopeId;element.className='epub-chapter';element.dataset.epubChapter=chapter.href;
 const blobURL=(data,mime)=>{const url=document.defaultView.URL.createObjectURL(new document.defaultView.Blob([data],{type:mime}));ownedUrls.push(url);return url;};
 const resolve=(href,base)=>{try{return resolveEpubHref(href,base);}catch{warn('External or invalid resource references were blocked.');return null;}};
 function localResource(href,base,kind){
  const resolved=resolve(href,base);if(!resolved)return null;const path=pathOnly(resolved),resource=book.resources.get(path),mime=manifest.get(path)?.mediaType;
  if(!resource||!mimeAllowed(mime,kind)){warn('A missing or unsupported local resource could not be displayed.');return null;}
  const key=`${kind}:${path}`;if(urlCache.has(key))return urlCache.get(key);
  let content=resource;
  if(mime==='image/svg+xml'){
   // SVG remains an image resource, never live publisher DOM. Remove every
   // reference and style so even nested image/font/filter loads stay offline.
   const svg=purify.sanitize(decoder.decode(resource),{USE_PROFILES:{svg:true,svgFilters:false},RETURN_DOM_FRAGMENT:true,FORBID_TAGS:['style','foreignObject','image','use','a','script','animate','animateMotion','animateTransform','set'],FORBID_ATTR:['href','xlink:href','style'],ALLOW_DATA_ATTR:false});
   for(const node of svg.querySelectorAll('*'))for(const attr of [...node.attributes])if(/url\s*\(|\\/i.test(attr.value)||/^(?:on|xmlns:)/i.test(attr.name))node.removeAttribute(attr.name);
   if(!svg.querySelector('svg')){warn('An unsupported SVG illustration was omitted.');return null;}
   content=new document.defaultView.XMLSerializer().serializeToString(svg);warn('SVG illustrations were sanitized; interactive features are unavailable.');
  }
  const url=blobURL(content,mime);urlCache.set(key,url);return url;
 }
 const fragment=purify.sanitize(decoder.decode(bytes),{ALLOWED_TAGS:tags,ALLOWED_ATTR:attributes,ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:true,RETURN_DOM_FRAGMENT:true,WHOLE_DOCUMENT:true,FORBID_TAGS:['script','iframe','object','embed','form','input','button','textarea','select','video','audio','source','svg','math','base','meta'],FORBID_ATTR:['srcset','ping','target','download','name','is']});
 if(purify.removed.some(item=>item.element?!['TITLE'].includes(item.element.tagName)&&!(item.element.tagName==='META'&&!item.element.hasAttribute('http-equiv')):item.attribute&&!/^xmlns(?::|$)/i.test(item.attribute.name)))warn('Active or unsupported publisher markup was removed.');
 const cssSources=[];
 for(const node of fragment.querySelectorAll('style,link')){
  if(node.localName==='style')cssSources.push({text:node.textContent,base:chapter.href});
  else if((node.getAttribute('rel')??'').toLowerCase().split(/\s+/).includes('stylesheet')){
   const resolved=resolve(node.getAttribute('href')??'',chapter.href),path=resolved&&pathOnly(resolved);
   if(path&&book.resources.has(path)&&manifest.get(path)?.mediaType==='text/css')cssSources.push({text:decoder.decode(book.resources.get(path)),base:path});else warn('A stylesheet was missing or blocked.');
  }node.remove();
 }
 const body=fragment.querySelector('body');if(body){for(const name of ['class','lang','xml:lang','dir','style'])if(body.hasAttribute(name))element.setAttribute(name,body.getAttribute(name));const content=document.createDocumentFragment();content.append(...body.childNodes);fragment.replaceChildren(content);}
 for(const node of fragment.querySelectorAll('[id]')){const original=node.id;if(!idMap.has(original))idMap.set(original,`${scopeId}--id-${idMap.size}`);node.id=idMap.get(original);node.dataset.epubId=original;}
 function safeDeclarations(block,base,fontFace=false){
  const result=[];
  block.children.forEach(node=>{
   if(node.type!=='Declaration')return;const property=node.property.toLowerCase();
   if(!(fontFace?['font-family','src','font-weight','font-style','font-stretch','unicode-range','font-display'].includes(property):properties.has(property))){warn('Unsupported publisher CSS was removed.');return;}
   const raw=cssTree.generate(node.value);if(raw.length>4000||raw.includes('\\'))return;
   let valid=true;
   cssTree.walk(node.value,item=>{
    if(item.type==='Raw')valid=false;
    if(item.type==='Function'&&!(functions.has(item.name.toLowerCase())||fontFace&&['format','tech'].includes(item.name.toLowerCase())))valid=false;
    if(item.type==='Url'){const url=localResource(item.value,base,fontFace?'font':'image');if(url)item.value=url;else valid=false;}
   });
   if(!valid){warn('Unsafe or unsupported publisher CSS values were removed.');return;}
   if(property==='font-family'){
    const families=cssTree.generate(node.value).split(',').map(name=>name.trim().replace(/^(['"])(.*)\1$/,'$2'));
    node.value=cssTree.parse(families.map(name=>fonts.has(name)?`"${fonts.get(name)}"`:(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','math','emoji','fangsong'].includes(name)?name:JSON.stringify(name))).join(','),{context:'value'});
   }
   result.push(`${property}:${cssTree.generate(node.value)}`);
  });return result.join(';');
 }
 function scopedSelector(selector){
  let valid=true;cssTree.walk(selector,node=>{
   if(node.type==='Raw'||node.type==='PseudoElementSelector')valid=false;
   if(node.type==='PseudoClassSelector'&&!['root','first-child','last-child','only-child','first-of-type','last-of-type','only-of-type','nth-child','nth-of-type','nth-last-child','nth-last-of-type','lang','empty'].includes(node.name.toLowerCase()))valid=false;
   if(node.type==='IdSelector'){if(idMap.has(node.name))node.name=idMap.get(node.name);else valid=false;}
  });if(!valid)return null;
  let text=cssTree.generate(selector);if(text.includes('\\')||text.includes('|')||/^[+~]/.test(text))return null;
  // Leading document roots refer to this chapter only. Every other selector
  // starts below the unique root, including sibling and attribute selectors.
  let rooted=false;while(/^(?:html|body|:root)(?=[\s.#:[>+~]|$)/i.test(text)){text=text.replace(/^(?:html|body|:root)/i,'');rooted=true;if(/^\s+(?:html|body|:root)(?=[\s.#:[>+~]|$)/i.test(text))text=text.trimStart();else break;}
  if(rooted&&/[+~]/.test(text))return null;
  return rooted?`#${scopeId}${text}`:`#${scopeId} ${text}`;
 }
 function registerFonts(ast){cssTree.walk(ast,node=>{if(node.type==='Atrule'&&node.name.toLowerCase()==='font-face'&&node.block){node.block.children.forEach(declaration=>{if(declaration.type==='Declaration'&&declaration.property.toLowerCase()==='font-family'){const family=cssTree.generate(declaration.value).trim().replace(/^(['"])(.*)\1$/,'$2');if(!fonts.has(family))fonts.set(family,`${scopeId}-font-${fonts.size}`);}});}});}
 function safeStyles(text,base){
  let ast;try{ast=cssTree.parse(text,{parseCustomProperty:true,onParseError(){throw new Error('invalid css');}});}catch{warn('An invalid publisher stylesheet was omitted.');return '';}
  registerFonts(ast);
  function rules(list){const out=[];list.forEach(node=>{
   if(node.type==='Rule'&&node.prelude?.type==='SelectorList'){
    const selectors=[];node.prelude.children.forEach(selector=>{const safe=scopedSelector(selector);if(safe)selectors.push(safe);});
    const declarations=safeDeclarations(node.block,base);if(selectors.length&&declarations)out.push(`${selectors.join(',')}{${declarations}}`);
   }else if(node.type==='Atrule'&&node.name.toLowerCase()==='font-face'&&node.block){const declarations=safeDeclarations(node.block,base,true);if(declarations.includes('src:')&&declarations.includes('font-family:'))out.push(`@font-face{${declarations};font-display:swap}`);}
   else if(node.type==='Atrule'&&node.name.toLowerCase()==='media'&&node.prelude&&node.block){const media=cssTree.generate(node.prelude);if(!/[{};\\]/.test(media)&&!media.includes('url('))out.push(`@media ${media}{${rules(node.block.children)}}`);}
   else warn('Unsupported publisher CSS rules were removed.');
  });return out.join('\n');}return rules(ast.children);
 }
 for(const source of cssSources){try{registerFonts(cssTree.parse(source.text));}catch{}}
 const styles=cssSources.map(source=>safeStyles(source.text,source.base)).filter(Boolean).join('\n');
 for(const node of [element,...fragment.querySelectorAll('*')]){
  if(node.hasAttribute('xml:lang')&&!node.hasAttribute('lang'))node.setAttribute('lang',node.getAttribute('xml:lang'));
  for(const name of ['aria-labelledby','aria-describedby'])if(node.hasAttribute(name))node.setAttribute(name,node.getAttribute(name).split(/\s+/).map(id=>idMap.get(id)).filter(Boolean).join(' '));
  if(node.hasAttribute('style')){try{const ast=cssTree.parse(node.getAttribute('style'),{context:'declarationList'}),safe=safeDeclarations(ast,chapter.href);if(safe)node.setAttribute('style',safe);else node.removeAttribute('style');}catch{node.removeAttribute('style');}}
  if(node.localName==='img'){
   const url=localResource(node.getAttribute('src')??'',chapter.href,'image');node.removeAttribute('src');if(url)node.setAttribute('src',url);else{node.setAttribute('role','img');node.setAttribute('aria-label',node.alt||'Illustration unavailable');}
   node.style.setProperty('max-width','100%','important');node.style.setProperty('object-fit','contain','important');
  }else node.removeAttribute('src');
  if(node.hasAttribute('href')){const href=resolve(node.getAttribute('href'),chapter.href);node.removeAttribute('href');if(href&&book.resources.has(pathOnly(href))){node.dataset.epubHref=href;node.setAttribute('href','#');}else warn('An external or missing link was disabled.');}
 }
 element.classList.add('epub-chapter');element.append(fragment);
 if(styles){const style=document.createElement('style');style.textContent=styles;element.prepend(style);}
 for(const [property,value]of Object.entries({contain:'layout style paint',isolation:'isolate',position:'relative','z-index':'0','max-width':'100%','box-sizing':'border-box'}))element.style.setProperty(property,value,'important');
 const blocks=[];
 function trimEdges(node){const walker=document.createTreeWalker(node,document.defaultView.NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode())texts.push(walker.currentNode);for(const text of texts){text.data=text.data.replace(/^\s+/u,'');if(text.data)break;}for(const text of texts.reverse()){text.data=text.data.replace(/\s+$/u,'');if(text.data)break;}}
 function collect(node,path){
  if(node.nodeType!==1||['STYLE','IMG','HR','BR'].includes(node.tagName))return;
  const hasBlocks=[...node.children].some(child=>blockTags.has(child.tagName)||child.querySelector([...blockTags].join(',')));
  if(!hasBlocks&&node===element){const span=document.createElement('span');span.append(...[...node.childNodes].filter(child=>child.nodeType!==1||child.tagName!=='STYLE'));node.append(span);collect(span,`${path}/text-0`);return;}
  if(!hasBlocks){trimEdges(node);if(node.textContent.trim())blocks.push({element:node,text:node.textContent,kind:/^H[1-6]$/.test(node.tagName)?'heading':node.tagName==='LI'?'list-item':node.tagName==='PRE'?'code':'paragraph',locator:`epub:${chapter.href}#${path}`});return;}
  let group=[],part=0;const flush=()=>{if(!group.length)return;if(group.some(n=>n.textContent.trim())){const span=document.createElement('span');group[0].before(span);span.append(...group);trimEdges(span);blocks.push({element:span,text:span.textContent,kind:'paragraph',locator:`epub:${chapter.href}#${path}/text-${part++}`});}group=[];};
  const children=[...node.childNodes];let index=0;for(const child of children){if(child.nodeType===1&&(blockTags.has(child.tagName)||child.querySelector([...blockTags].join(',')))){flush();collect(child,`${path}/${child.localName}-${index++}`);}else if(child.nodeType!==1||child.tagName!=='STYLE')group.push(child);}flush();
 }
 collect(element,'chapter');
 let disposed=false;return {element,blocks,warnings,idMap,dispose(){if(disposed)return;disposed=true;element.remove();ownedUrls.forEach(url=>document.defaultView.URL.revokeObjectURL(url));}};
}
