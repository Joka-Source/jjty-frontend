function fail(code='PDF_CONTENTS_INVALID'){throw new Error(code);}
const MAX_NODES=2000,MAX_DEPTH=32,MAX_TITLE=4096,MAX_TITLES=262144;
// Read a bounded native graph directly; each node keeps its own destination.
export function boundNativeContents(doc){
 const trailer=doc.getTrailer(),root=trailer.get('Root'),outline=root.get('Outlines');
 let count=0,total=0;const seen=new Set(),authority=[],pageIds=new Map();
 for(let i=0;i<doc.countPages();i++){const object=doc.findPage(i);try{pageIds.set(object.asIndirect(),i);}finally{object.destroy();}}
 function walk(parent,depth){if(depth>MAX_DEPTH)fail('PDF_CONTENTS_LIMIT');let node=parent.get('First');try{while(!node.isNull()){
  if(!node.isIndirect()||!node.isDictionary())fail();const id=node.asIndirect();if(seen.has(id))fail();seen.add(id);if(++count>MAX_NODES)fail('PDF_CONTENTS_LIMIT');
  let label='';const title=node.get('Title');try{if(!title.isString())fail();const size=title.asByteString().byteLength;if(size>MAX_TITLE*4||(total+=size)>MAX_TITLES*4)fail('PDF_CONTENTS_LIMIT');label=title.asString();}finally{title.destroy();}
  const dest=node.get('Dest'),action=node.get('A');let pageIndex=null;
  function local(value){
   if(value.isString()||value.isName()){
    if(value.isString()&&value.asByteString().byteLength>MAX_TITLE*4)return null;
    const named=value.isString()?value.asString():value.asName();if(named.length>MAX_TITLE)return null;
    try{return doc.resolveLink('#nameddest='+encodeURIComponent(named));}catch{return null;}
   }
   if(!value.isArray()||value.length<2)return null;
   const target=value.get(0),mode=value.get(1);try{
    if(!((target.isIndirect()&&pageIds.has(target.asIndirect()))||(target.isNumber()&&Number.isSafeInteger(target.asNumber())&&target.asNumber()>=0&&target.asNumber()<doc.countPages())))return null;
    const lengths={XYZ:5,Fit:2,FitH:3,FitV:3,FitR:6,FitB:2,FitBH:3,FitBV:3};if(!mode.isName()||lengths[mode.asName()]!==value.length)return null;
    for(let i=2;i<value.length;i++){const arg=value.get(i);try{if(arg.isNull()&&mode.asName()!=='FitR')continue;if(!arg.isNumber()||!Number.isFinite(arg.asNumber()))return null;}finally{arg.destroy();}}return target.isIndirect()?pageIds.get(target.asIndirect()):target.asNumber();
   }finally{target.destroy();mode.destroy();}
  }
  try{if(action.isNull())pageIndex=local(dest);else if(dest.isNull()&&action.isDictionary()){const type=action.get('S'),target=action.get('D');try{if(type.isName()&&type.asName()==='GoTo')pageIndex=local(target);}finally{type.destroy();target.destroy();}}}finally{action.destroy();dest.destroy();}
  const openCount=node.get('Count');let open=false;try{open=openCount.isNumber()&&openCount.asNumber()>0;}finally{openCount.destroy();}
  authority.push({title:label,pageIndex,depth,open});
  walk(node,depth+1);const next=node.get('Next');node.destroy();node=next;
 }}finally{node.destroy();}}
 try{if(!outline.isNull()){if(!outline.isDictionary())fail();walk(outline,0);}return authority;}finally{outline.destroy();root.destroy();trailer.destroy();}
}
async function normalize(nodes,numPages,describe,resolve,assertActive){
 let count=0,total=0;const seen=new Set();
 async function walk(items,depth){if(items==null)return [];if(!Array.isArray(items))fail();if(depth>MAX_DEPTH)fail('PDF_CONTENTS_LIMIT');const result=[];
 for(const item of items){assertActive();if(!item||typeof item!=='object'||seen.has(item))fail();seen.add(item);if(++count>MAX_NODES)fail('PDF_CONTENTS_LIMIT');
 const {title,children,open}=describe(item);if(typeof title!=='string')fail();if(title.length>MAX_TITLE||(total+=title.length)>MAX_TITLES)fail('PDF_CONTENTS_LIMIT');
 let index=null;try{index=await resolve(item);}catch{assertActive();}assertActive();
 const nested=await walk(children,depth+1);
 result.push({title,pageNumber:Number.isSafeInteger(index)&&index>=0&&index<numPages?index+1:null,children:nested,open:nested.length>0&&!!open});
 }return result;}return walk(nodes,0);
}
export async function readMuPdfContents(doc,assertActive){
 assertActive();const raw=boundNativeContents(doc),nodes=[],parents=[nodes];
 // Each raw node retains its own action and target. No title/position matching
 // against a second native conversion can confer navigation authority.
 for(const item of raw){const node={...item,children:[]};parents[item.depth].push(node);parents[item.depth+1]=node.children;}
 return normalize(nodes,doc.countPages(),item=>item,item=>item.pageIndex,assertActive);
}
export async function readPdfJsContents(doc,assertActive){
 assertActive();const nodes=await doc.getOutline();assertActive();
 return normalize(nodes,doc.numPages,item=>({title:item.title??'',children:item.items,open:!(item.count<0)}),async item=>{
  if(item.url||item.unsafeUrl||item.action||item.newWindow||item.setOCGState)return null;
  let dest=item.dest;if(typeof dest==='string')dest=await doc.getDestination(dest);
  if(!Array.isArray(dest)||dest.length<2)return null;
  const type=dest[1]?.name,lengths={XYZ:5,Fit:2,FitH:3,FitV:3,FitR:6,FitB:2,FitBH:3,FitBV:3};
  if(lengths[type]!==dest.length||dest.slice(2).some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v))))return null;
  if(type==='FitR'&&dest.slice(2).some(v=>v===null))return null;
  if(Number.isInteger(dest[0]))return dest[0];
  if(dest[0]&&Number.isInteger(dest[0].num)&&Number.isInteger(dest[0].gen))return await doc.getPageIndex(dest[0]);
  return null;
 },assertActive);
}
