// Shared readback proof; error codes retain reorder compatibility.
function fail(code){const error=new Error(code);error.code=code;throw error;}
const INHERITED=['MediaBox','CropBox','Rotate','Resources'];
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
// Native data is compared in original page identity space, so annotation /P
// links remain meaningful even when indirect object numbers change on save.
export async function snapshotPdfStructure(doc,originalIndices){
  const pageIds=new Map(),pages=[];
  try{
    for(let index=0;index<doc.countPages();index++){
      const page=doc.loadPage(index),object=page.getObject();pages.push({page,object});
      if(!object.isIndirect())fail('REORDER_UNSUPPORTED_PAGE');
      pageIds.set(object.asIndirect(),originalIndices[index]);
    }
    async function fingerprint(root,path,expandPage=false){
      const seen=new Map();let count=0;
      async function visit(object,at,depth=0,expand=false){
        if(++count>200000||depth>256)fail('REORDER_DOCUMENT_TOO_COMPLEX');
        if(object.isIndirect()){
          const id=object.asIndirect();
          if(!expand&&pageIds.has(id))return ['page',pageIds.get(id)];
          if(seen.has(id))return ['reference',seen.get(id)];seen.set(id,at);
        }
        if(object.isNull())return null;
        if(object.isBoolean())return ['boolean',object.asBoolean()];
        if(object.isNumber())return ['number',object.asNumber()];
        if(object.isName())return ['name',object.asName()];
        if(object.isString())return ['string',Array.from(object.asByteString())];
        if(object.isArray()){
          const items=[];for(let i=0;i<object.length;i++){const value=object.get(i);try{items.push(await visit(value,at+'/'+i,depth+1));}finally{value.destroy();}}return items;
        }
        if(object.isDictionary()||object.isStream()){
          // Numeric local targets outside rebuilt outlines are not remapped by
          // this operation. MuPDF can remove these links outright; refuse before
          // mutation rather than exposing a late failure or stale destination.
          for(const key of ['Dest','D']){
            const value=object.get(key),action=key==='D'?object.get('S'):null;
            try{if(key==='D'&&(!action.isName()||action.asName()!=='GoTo'))continue;
              if(value.isArray()&&value.length){const target=value.get(0);try{if(target.isNumber())fail('REORDER_ADVANCED_STRUCTURE_UNSUPPORTED');}finally{target.destroy();}}
            }finally{action?.destroy();value.destroy();}
          }

          const type=object.get('Type');let isPage;try{isPage=type.asName()==='Page';}finally{type.destroy();}
          const entries=[];object.forEach((value,key)=>entries.push([key,value]));const items=[],stream=object.isStream();
          try{
            for(const [key,value]of entries.sort((a,b)=>a[0].localeCompare(b[0]))){
              if(isPage&&(key==='Parent'||INHERITED.includes(key)))continue;
              if(stream&&['Length','Filter','DecodeParms'].includes(key))continue;
              items.push([key,await visit(value,at+'/'+key,depth+1)]);
            }
            if(stream){const buffer=object.readStream();try{items.push(['decodedStreamSHA256',await hash(buffer.asUint8Array())]);}finally{buffer.destroy();}}
          }finally{for(const [,value]of entries)value.destroy();}
          return ['dictionary',items];
        }
        fail('REORDER_UNSUPPORTED_OBJECT');
      }
      return visit(root,path,0,expandPage);
    }
    const results=[];
    for(const {page,object}of pages){
      const inherited=[];
      for(const key of INHERITED){const value=object.getInheritable(key);try{
        if(key==='Rotate'){
          const rotation=value.isNull()?0:value.asNumber();
          if(!value.isNull()&&(!value.isNumber()||!Number.isSafeInteger(rotation)||rotation%90))fail('REORDER_INVALID_EXISTING_ANGLE');
          inherited.push([key,((rotation%360)+360)%360]);
        }else inherited.push([key,await fingerprint(value,key)]);
      }finally{value.destroy();}}
      results.push(JSON.stringify({page:await fingerprint(object,'page',true),inherited,bounds:page.getBounds()}));
    }
    const trailer=doc.getTrailer(),catalog=trailer.get('Root'),info=trailer.get('Info'),entries=[];
    try{
      catalog.forEach((value,key)=>entries.push([key,value]));const data=[];
      for(const [key,value]of entries.sort((a,b)=>a[0].localeCompare(b[0])))if(key!=='Pages'&&key!=='Outlines')data.push([key,await fingerprint(value,'catalog/'+key)]);
      return {pages:results,catalog:JSON.stringify(data),info:JSON.stringify(await fingerprint(info,'Info'))};
    }finally{for(const [,value]of entries)value.destroy();info.destroy();catalog.destroy();trailer.destroy();}
  }finally{for(const {page,object}of pages){object.destroy();page.destroy();}}
}
