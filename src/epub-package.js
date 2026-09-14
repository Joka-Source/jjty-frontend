import {Unzip,UnzipInflate} from 'fflate';

export const EPUB_LIMITS=Object.freeze({sourceBytes:32*1024*1024,expandedBytes:64*1024*1024,entryBytes:8*1024*1024,entries:2000});
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const utf8=bytes=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('EPUB_ENCODING_INVALID');}};
function entryPath(path){if(!path||path.startsWith('/')||path.includes('\\')||/[\u0000-\u001f]/.test(path)||/^[a-z][a-z0-9+.-]*:/i.test(path)||path.split('/').some(p=>p==='.'||p==='..'||p===''))fail('EPUB_PATH_INVALID');return path;}
/** Resolve a publication-relative URI against a canonical archive file path. */
export function resolveEpubHref(href,basePath=''){
 if(typeof href!=='string'||!href||href.startsWith('/')||href.startsWith('//')||href.includes('\\')||/[\u0000-\u001f]/.test(href)||/^[a-z][a-z0-9+.-]*:/i.test(href)||href.includes('?'))fail('EPUB_PATH_INVALID');
 const hash=href.indexOf('#'),fragment=hash<0?'':href.slice(hash),raw=hash<0?href:href.slice(0,hash);let decoded;try{decoded=decodeURIComponent(raw);}catch{fail('EPUB_PATH_INVALID');}
 if(decoded.includes('\\')||decoded.startsWith('/')||/[\u0000-\u001f]/.test(decoded)||/^[a-z][a-z0-9+.-]*:/i.test(decoded))fail('EPUB_PATH_INVALID');
 const parts=basePath?basePath.split('/').slice(0,-1):[];
 if(!raw){if(!basePath)fail('EPUB_PATH_INVALID');return basePath+fragment;}
 for(const piece of decoded.split('/')){if(piece==='.'||piece==='')continue;if(piece==='..'){if(!parts.length)fail('EPUB_PATH_INVALID');parts.pop();}else parts.push(piece);}
 return entryPath(parts.join('/'))+fragment;
}
const resourcePath=href=>href.split('#')[0];
function zipIndex(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))fail('EPUB_ARCHIVE_INVALID');
 const count=u16(end+10),size=u32(end+12),start=u32(end+16);if(count>EPUB_LIMITS.entries)fail('EPUB_ENTRY_LIMIT');if(count===65535||start+size!==end||start>end)fail('EPUB_ARCHIVE_INVALID');
 const entries=new Map(),offsets=new Set();let offset=start,total=0;
 for(let i=0;i<count;i++){
  if(offset+46>end||u32(offset)!==0x02014b50)fail('EPUB_ARCHIVE_INVALID');
  const flags=u16(offset+8),method=u16(offset+10),compressed=u32(offset+20),expanded=u32(offset+24),nameLength=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),localOffset=u32(offset+42);if(offset+46+nameLength+extra+comment>end)fail('EPUB_ARCHIVE_INVALID');
  const name=utf8(bytes.subarray(offset+46,offset+46+nameLength)),directory=name.endsWith('/');entryPath(directory?name.slice(0,-1):name);
  if(entries.has(name))fail('EPUB_DUPLICATE_ENTRY');if(flags&(1|64))fail('EPUB_ENCRYPTED_UNSUPPORTED');if(![0,8].includes(method)||localOffset>=start||compressed===0xffffffff||expanded===0xffffffff)fail('EPUB_ARCHIVE_UNSUPPORTED');
  if(offsets.has(localOffset)||localOffset+30>start||u32(localOffset)!==0x04034b50||u16(localOffset+8)!==method||u16(localOffset+6)!==flags)fail('EPUB_ARCHIVE_INVALID');offsets.add(localOffset);
  const localNameLength=u16(localOffset+26),localExtra=u16(localOffset+28);if(localOffset+30+localNameLength+localExtra>start||utf8(bytes.subarray(localOffset+30,localOffset+30+localNameLength))!==name)fail('EPUB_ARCHIVE_INVALID');
  if(expanded>EPUB_LIMITS.entryBytes)fail('EPUB_ENTRY_LIMIT');total+=expanded;if(total>EPUB_LIMITS.expandedBytes)fail('EPUB_EXPANSION_LIMIT');
  entries.set(name,{crc:u32(offset+16),expanded,directory,method,localOffset});offset+=46+nameLength+extra+comment;
 }
 if(offset!==end)fail('EPUB_ARCHIVE_INVALID');const mime=entries.get('mimetype');if(!mime||mime.method!==0||mime.localOffset!==0)fail('EPUB_MIMETYPE_INVALID');return entries;
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crcPart(crc,bytes){for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return crc;}
function unpack(bytes){
 const index=zipIndex(bytes),resources=new Map(),seen=new Set();let total=0,error=null;
 const unzip=new Unzip(file=>{
  const info=index.get(file.name);if(!info||seen.has(file.name))fail('EPUB_DUPLICATE_ENTRY');seen.add(file.name);let length=0,crc=0xffffffff,chunks=[];
  file.ondata=(failure,data,final)=>{
   if(error)return;if(failure){error=failure;return;}
   length+=data.length;total+=data.length;
   if(length>EPUB_LIMITS.entryBytes||length>info.expanded){error=Object.assign(new Error('EPUB_ENTRY_LIMIT'),{code:'EPUB_ENTRY_LIMIT'});file.terminate();return;}
   if(total>EPUB_LIMITS.expandedBytes){error=Object.assign(new Error('EPUB_EXPANSION_LIMIT'),{code:'EPUB_EXPANSION_LIMIT'});file.terminate();return;}
   crc=crcPart(crc,data);chunks.push(data);
   if(final){if(length!==info.expanded||((crc^0xffffffff)>>>0)!==info.crc){error=Object.assign(new Error('EPUB_ARCHIVE_CORRUPT'),{code:'EPUB_ARCHIVE_CORRUPT'});return;}if(!info.directory){const output=new Uint8Array(length);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}resources.set(file.name,output);}chunks=[];}
  };file.start();
 });unzip.register(UnzipInflate);
 // Small compressed slices bound each inflate callback allocation even when ZIP
 // headers lie about expanded size; enforce actual bytes before retaining chunks.
 try{for(let at=0;at<bytes.length;at+=1024){unzip.push(bytes.subarray(at,at+1024),at+1024>=bytes.length);if(error)throw error;}}catch(e){if(e.code?.startsWith?.('EPUB_'))throw e;fail('EPUB_ARCHIVE_CORRUPT');}
 if(seen.size!==index.size||resources.size!==[...index.values()].filter(e=>!e.directory).length)fail('EPUB_ARCHIVE_CORRUPT');return resources;
}
function xml(bytes){const text=utf8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('EPUB_XML_UNSUPPORTED');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName==='parsererror')fail('EPUB_XML_INVALID');return doc;}
const children=(node,name)=>[...node.children].filter(n=>n.localName===name);
const descendants=(node,name)=>[...node.getElementsByTagName('*')].filter(n=>n.localName===name);
const tokens=value=>(value??'').trim().split(/\s+/).filter(Boolean);
function requiredResource(resources,path){const data=resources.get(resourcePath(path));if(!data)fail('EPUB_RESOURCE_MISSING');return data;}
function nav3(doc,base,resources){
 const nav=descendants(doc,'nav').find(n=>tokens(n.getAttributeNS('http://www.idpf.org/2007/ops','type')??n.getAttribute('epub:type')).includes('toc'));if(!nav)fail('EPUB_NAV_INVALID');
 function list(ol,depth=0){if(depth>32)fail('EPUB_NAV_LIMIT');return children(ol,'li').map(li=>{const anchor=children(li,'a')[0],labelNode=anchor??children(li,'span')[0],nested=children(li,'ol')[0],href=anchor?resolveEpubHref(anchor.getAttribute('href'),base):'';if(href)requiredResource(resources,href);if(!labelNode?.textContent.trim())fail('EPUB_NAV_INVALID');return {label:labelNode.textContent.trim(),href,children:nested?list(nested,depth+1):[]};});}
 const ol=children(nav,'ol')[0];if(!ol)fail('EPUB_NAV_INVALID');return list(ol);
}
function nav2(doc,base,resources){const nav=descendants(doc,'navMap')[0];if(!nav)fail('EPUB_NAV_INVALID');function list(node,depth=0){if(depth>32)fail('EPUB_NAV_LIMIT');return children(node,'navPoint').map(point=>{const label=children(point,'navLabel')[0]?.textContent.trim(),src=children(point,'content')[0]?.getAttribute('src');if(!label||!src)fail('EPUB_NAV_INVALID');const href=resolveEpubHref(src,base);requiredResource(resources,href);return {label,href,children:list(point,depth+1)};});}return list(nav);}

/** Parse original EPUB2/3 bytes without executing or rendering publication content. */
export async function openEpubPackage(input){
 if(!(input instanceof Uint8Array)&&!(input instanceof ArrayBuffer))fail('EPUB_SOURCE_INVALID');const bytes=new Uint8Array(input);if(bytes.length>EPUB_LIMITS.sourceBytes)fail('EPUB_SOURCE_LIMIT');if(bytes.length<22)fail('EPUB_ARCHIVE_INVALID');
 const resources=unpack(bytes);if(utf8(requiredResource(resources,'mimetype'))!=='application/epub+zip')fail('EPUB_MIMETYPE_INVALID');
 if(resources.has('META-INF/encryption.xml'))fail('EPUB_ENCRYPTED_UNSUPPORTED');
 const container=xml(requiredResource(resources,'META-INF/container.xml'));if(container.documentElement.localName!=='container')fail('EPUB_CONTAINER_INVALID');const rootfile=descendants(container,'rootfile').find(n=>n.getAttribute('media-type')==='application/oebps-package+xml');if(!rootfile)fail('EPUB_CONTAINER_INVALID');const packagePath=resolveEpubHref(rootfile.getAttribute('full-path')),opf=xml(requiredResource(resources,packagePath)),pkg=opf.documentElement;
 if(pkg.localName!=='package'||!/^([23])(\.|$)/.test(pkg.getAttribute('version')??''))fail('EPUB_PACKAGE_UNSUPPORTED');
 const metadata=children(pkg,'metadata')[0],manifestNode=children(pkg,'manifest')[0],spineNode=children(pkg,'spine')[0];if(!metadata||!manifestNode||!spineNode)fail('EPUB_PACKAGE_INVALID');
 const ids=new Map(),paths=new Set(),manifest=children(manifestNode,'item').map(item=>{const id=item.getAttribute('id'),href=resolveEpubHref(item.getAttribute('href'),packagePath),mediaType=item.getAttribute('media-type'),properties=tokens(item.getAttribute('properties'));if(!id||ids.has(id)||paths.has(href)||!mediaType||href.includes('#'))fail('EPUB_MANIFEST_INVALID');requiredResource(resources,href);const entry={id,href,mediaType,properties};ids.set(id,entry);paths.add(href);return entry;});
 const spine=children(spineNode,'itemref').filter(n=>n.getAttribute('linear')!=='no').map(item=>{const entry=ids.get(item.getAttribute('idref'));if(!entry)fail('EPUB_SPINE_INVALID');if(!['application/xhtml+xml','text/html'].includes(entry.mediaType))fail('EPUB_SPINE_UNSUPPORTED');return {...entry,properties:[...entry.properties,...tokens(item.getAttribute('properties'))]};});if(!spine.length)fail('EPUB_SPINE_INVALID');
 const layoutValue=children(metadata,'meta').some(n=>n.getAttribute('name')==='fixed-layout'&&n.getAttribute('content')==='true')?'pre-paginated':children(metadata,'meta').find(n=>n.getAttribute('property')==='rendition:layout')?.textContent.trim()??'reflowable';if(!['reflowable','pre-paginated'].includes(layoutValue))fail('EPUB_LAYOUT_UNSUPPORTED');
 if(spine.some(item=>item.properties.includes('rendition:layout-pre-paginated'))&&layoutValue!=='pre-paginated')fail('EPUB_LAYOUT_UNSUPPORTED');
 const nav=manifest.find(item=>item.properties.includes('nav')),ncx=ids.get(spineNode.getAttribute('toc'));let toc=[];if(nav)toc=nav3(xml(requiredResource(resources,nav.href)),nav.href,resources);else if(ncx)toc=nav2(xml(requiredResource(resources,ncx.href)),ncx.href,resources);else fail('EPUB_NAV_INVALID');
 return {version:1,title:children(metadata,'title')[0]?.textContent.trim()??'',language:children(metadata,'language')[0]?.textContent.trim()??'',layout:layoutValue,direction:spineNode.getAttribute('page-progression-direction')==='rtl'?'rtl':'ltr',spine,manifest,toc,resources};
}
