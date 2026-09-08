// A deliberately bounded local-destination subset. Snapshot before rearrangePages,
// which can mutate outline nodes, and rebuild from owned semantic data afterward.
function fail(){const error=new Error('REORDER_ADVANCED_STRUCTURE_UNSUPPORTED');error.code=error.message;throw error;}
function use(object,key,fn){const value=object.get(key);try{return fn(value);}finally{value.destroy();}}
function keys(object,allowed){object.forEach((value,key)=>{try{if(!allowed.includes(key))fail();}finally{value.destroy();}});}
function id(object){if(!object.isIndirect())fail();return object.asIndirect();}
function optionalNumber(object,key){return use(object,key,v=>{if(v.isNull())return null;if(!v.isNumber()||!Number.isFinite(v.asNumber()))fail();return v.asNumber();});}
export function readPdfOutlines(doc,originalIndices){
 const pages=new Map();for(let i=0;i<doc.countPages();i++){const page=doc.loadPage(i),object=page.getObject();try{pages.set(id(object),originalIndices[i]);}finally{object.destroy();page.destroy();}}
 const trailer=doc.getTrailer(),root=trailer.get('Root'),outlines=root.get('Outlines');
 try{
  if(outlines.isNull())return null;if(!outlines.isDictionary())fail();
  keys(outlines,['Type','First','Last','Count']);use(outlines,'Type',v=>{if(!v.isNull()&&(!v.isName()||v.asName()!=='Outlines'))fail();});
  const seen=new Set();let total=0,titleBytes=0;
  function destination(value){
   if(!value.isArray()||value.length<2)fail();
   const target=use(value,0,v=>{if(v.isIndirect()&&pages.has(v.asIndirect()))return {page:pages.get(v.asIndirect()),numeric:false};if(v.isNumber()&&Number.isSafeInteger(v.asNumber())&&v.asNumber()>=0&&v.asNumber()<originalIndices.length)return {page:originalIndices[v.asNumber()],numeric:true};fail();});
   const mode=use(value,1,v=>{if(!v.isName())fail();return v.asName();});
   const lengths={XYZ:5,Fit:2,FitH:3,FitV:3,FitR:6,FitB:2,FitBH:3,FitBV:3};if(lengths[mode]!==value.length)fail();
   const args=[];for(let i=2;i<value.length;i++)args.push(use(value,i,v=>{if(v.isNull()&&mode!=='FitR')return null;if(!v.isNumber()||!Number.isFinite(v.asNumber()))fail();return v.asNumber();}));
   return {...target,mode,args};
  }
  function chain(parent,depth){
   if(depth>64)fail();const result=[];let current=parent.get('First'),previous=null;
   try{while(!current.isNull()){
    const currentId=id(current);if(seen.has(currentId)||++total>10000)fail();seen.add(currentId);
    if(!current.isDictionary())fail();keys(current,['Title','Parent','Prev','Next','First','Last','Count','Dest','A','C','F']);
    use(current,'Parent',v=>{if(id(v)!==id(parent))fail();});
    use(current,'Prev',v=>{if(previous===null?!v.isNull():v.isNull()||id(v)!==previous)fail();});
    const title=use(current,'Title',v=>{if(!v.isString())fail();const bytes=v.asByteString();if(bytes.byteLength>65536||(titleBytes+=bytes.byteLength)>1048576)fail();return Array.from(bytes);});
    const count=optionalNumber(current,'Count');if(count!==null&&!Number.isSafeInteger(count))fail();
    const style=optionalNumber(current,'F');if(style!==null&&(!Number.isInteger(style)||style<0||style>3))fail();
    const color=use(current,'C',v=>{if(v.isNull())return null;if(!v.isArray()||v.length!==3)fail();return [0,1,2].map(i=>use(v,i,n=>{if(!n.isNumber()||n.asNumber()<0||n.asNumber()>1)fail();return n.asNumber();}));});
    const dest=current.get('Dest'),action=current.get('A');let target=null,actionForm=false;
    try{if(!dest.isNull()&&!action.isNull())fail();if(!dest.isNull())target=destination(dest);else if(!action.isNull()){if(!action.isDictionary())fail();keys(action,['Type','S','D']);use(action,'Type',v=>{if(!v.isNull()&&(!v.isName()||v.asName()!=='Action'))fail();});use(action,'S',v=>{if(!v.isName()||v.asName()!=='GoTo')fail();});target=use(action,'D',destination);actionForm=true;}}finally{dest.destroy();action.destroy();}
    const children=chain(current,depth+1);
    const visible=children.reduce((sum,child)=>sum+1+Math.max(0,child.count??0),0);
    if(count!==null&&Math.abs(count)!==visible)fail();
    result.push({title,count,style,color,target,actionForm,children});previous=currentId;
    const next=current.get('Next');current.destroy();current=next;
   }
   use(parent,'Last',v=>{if(previous===null?!v.isNull():v.isNull()||id(v)!==previous)fail();});
   return result;
   }finally{current.destroy();}
  }
  const count=optionalNumber(outlines,'Count');if(count!==null&&(!Number.isSafeInteger(count)||count<0))fail();
  const children=chain(outlines,0);if(!children.length)fail();
  if(count!==null&&count!==children.reduce((sum,child)=>sum+1+Math.max(0,child.count??0),0))fail();
  return {count,children};
 }finally{outlines.destroy();root.destroy();trailer.destroy();}
}
export function writePdfOutlines(doc,tree,order){
 if(!tree)return;const inverse=new Map(order.map((source,index)=>[source,index]));
 const held=[];const keep=v=>(held.push(v),v);const trailer=doc.getTrailer(),catalog=trailer.get('Root');
 try{
  const root=keep(doc.addObject({}));root.put('Type',keep(doc.newName('Outlines')));if(tree.count!==null)root.put('Count',tree.count);
  function chain(parent,nodes){
   const objects=nodes.map(()=>keep(doc.addObject({})));
   objects.forEach((object,i)=>{
    const node=nodes[i];object.put('Title',keep(doc.newByteString(node.title)));object.put('Parent',parent);
    if(i)object.put('Prev',objects[i-1]);if(i+1<objects.length)object.put('Next',objects[i+1]);
    if(node.count!==null)object.put('Count',node.count);if(node.style!==null)object.put('F',node.style);if(node.color!==null)object.put('C',node.color);
    if(node.target){const target=node.target,index=inverse.get(target.page);let pageObject=index;
     if(!target.numeric){const page=doc.loadPage(index);try{pageObject=keep(page.getObject());}finally{page.destroy();}}
     const dest=keep(doc.newArray());dest.push(pageObject);dest.push(keep(doc.newName(target.mode)));for(const value of target.args)dest.push(value);
     if(node.actionForm){const action=keep(doc.newDictionary());action.put('S',keep(doc.newName('GoTo')));action.put('D',dest);object.put('A',action);}else object.put('Dest',dest);
    }
    chain(object,node.children);
   });
   if(objects.length){parent.put('First',objects[0]);parent.put('Last',objects.at(-1));}
  }
  chain(root,tree.children);catalog.put('Outlines',root);
 }finally{for(const object of held.reverse())object.destroy();catalog.destroy();trailer.destroy();}
}
