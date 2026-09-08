// Form operations always use fresh owned bytes. PDF JavaScript is disabled;
// dynamic forms and signatures remain outside this editable subset.
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function copy(bytes) { return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes).slice(); }
async function withForm(bytes, action) {
  const mupdf = await import('mupdf');
  const doc = new mupdf.PDFDocument(copy(bytes)), owned = [];
  const keep = object => { owned.push(object); return object; };
  // MuPDF's null sentinel has no owning document; asking it for another key
  // throws. An absent optional dictionary remains absent through traversal.
  const get = (object, ...path) => object.isNull() ? object : keep(object.get(...path));
  const inherited = (object, key) => object.isNull() ? object : keep(object.getInheritable(key));
  try {
    doc.disableJS();
    const restrictions = [], fields = [], widgets = [], pages = [];
    const trailer = keep(doc.getTrailer());
    if (doc.needsPassword() || !get(trailer, 'Encrypt').isNull()) restrictions.push('encrypted');
    if (restrictions.length) return await action({fields, restrictions, canFill:false}, {doc,widgets,pages});
    if (!doc.hasPermission('form')) restrictions.push('form-permission-denied');
    const form = get(trailer, 'Root', 'AcroForm');
    if (!get(form, 'XFA').isNull()) restrictions.push('xfa-unsupported');
    if (get(form, 'CO').length) restrictions.push('calculated-form-unsupported');
    if (!get(trailer, 'Root', 'Perms').isNull()) restrictions.push('signature-protection');
    // Include signature fields with no visible page widget.
    const seen = new Set();
    function scan(field, depth = 0) {
      if (depth > 64) fail('FORM_TREE_TOO_DEEP');
      if (field.isIndirect()) { const id = field.asIndirect(); if (seen.has(id)) return; seen.add(id); }
      if (inherited(field, 'FT').asName() === 'Sig' && !inherited(field,'V').isNull()) restrictions.push('signed-document');
      const kids = get(field,'Kids'); for (let i=0;i<kids.length;i++) scan(get(kids,i),depth+1);
    }
    const roots=get(form,'Fields'); for(let i=0;i<roots.length;i++) scan(get(roots,i));
    const canonicalNames = new Map();
    function fieldIdentity(object, fallback) {
      const visited=new Set();
      for(let depth=0;depth<64;depth++) {
        const id=object.isIndirect()?object.asIndirect():null;
        if(id!==null) { if(visited.has(id)) fail('FORM_PARENT_CYCLE'); visited.add(id); }
        if(!get(object,'T').isNull()) return id!==null?`object:${id}`:fallback;
        const parent=get(object,'Parent');
        if(parent.isNull()) return id!==null?`object:${id}`:fallback;
        object=parent;
      }
      fail('FORM_TREE_TOO_DEEP');
    }
    for(let pageIndex=0;pageIndex<doc.countPages();pageIndex++) {
      const page=keep(doc.loadPage(pageIndex)); pages.push(page);
      page.getWidgets().forEach((widget,widgetIndex) => {
        keep(widget); const object=keep(widget.getObject()), flags=widget.getFieldFlags();
        const name=widget.getName(), nativeType=widget.getFieldType();
        const groupId=fieldIdentity(object,`widget:${pageIndex}:${widgetIndex}`);
        if(name && canonicalNames.has(name) && canonicalNames.get(name)!==groupId) restrictions.push('ambiguous-duplicate-field-name');
        if(name) canonicalNames.set(name,groupId);
        const type=({radiobutton:'radio',combobox:'choice',listbox:'choice'})[nativeType] ?? nativeType;
        const unsupported=[];
        if (!['text','checkbox','radio','choice'].includes(type)) unsupported.push('field-type-unsupported');
        if (flags & mupdf.PDFWidget.TX_FIELD_IS_RICH_TEXT && type==='text') unsupported.push('rich-text-unsupported');
        if (flags & mupdf.PDFWidget.CH_FIELD_IS_MULTI_SELECT && type==='choice') unsupported.push('multi-select-unsupported');
        if (!inherited(object,'AA').isNull()) unsupported.push('field-actions-unsupported');
        const appearances=get(object,'AP','N'), exports=[];
        if(appearances.isDictionary()) appearances.forEach((_value,key)=>{ keep(_value); if(key!=='Off') exports.push(String(key)); });
        const rawValue=widget.getValue();
        const exportOptions=type==='choice'?widget.getOptions(true):[];
        const labels=type==='choice'?widget.getOptions(false):[];
        fields.push({key:`${pageIndex}:${widgetIndex}:${encodeURIComponent(name)}`,name,label:widget.getLabel() || name,
          pageIndex,widgetIndex,groupId,rect:widget.getBounds(),type,value:type==='checkbox'?rawValue!=='Off' && rawValue!=='':rawValue,
          readOnly:widget.isReadOnly(),required:!!(flags & mupdf.PDFWidget.FIELD_IS_REQUIRED),
          maxLength:type==='text'?widget.getMaxLen():0,multiline:type==='text' && widget.isMultiline(),
          options:exportOptions.map((value,i)=>({value,label:labels[i]??value})),
          ...(type==='radio'||type==='checkbox'?{exportValue:exports[0]??null}:{}),unsupported});
        widgets.push(widget);
      });
    }
    // A boolean represents a shared checkbox only when every widget uses the
    // same on-state. Differing exports require a choice, not several booleans:
    // the inherited field value alone cannot say which widget is checked.
    const checkboxGroups = new Map();
    for (const field of fields) if (field.type === 'checkbox') {
      const group = checkboxGroups.get(field.groupId) ?? [];
      group.push(field); checkboxGroups.set(field.groupId, group);
    }
    for (const group of checkboxGroups.values()) {
      if (new Set(group.map(field => field.exportValue)).size > 1) {
        for (const field of group) field.unsupported.push('shared-checkbox-states-unsupported');
      }
    }
    const unique=[...new Set(restrictions)];
    return await action({fields,restrictions:unique,canFill:unique.length===0 && fields.some(f=>!f.readOnly && !f.unsupported.length)}, {doc,widgets,pages});
  } finally { for(const object of owned.reverse()) object.destroy(); doc.destroy(); }
}
export async function inspectPdfForm(bytes) { return withForm(bytes, metadata=>metadata); }
export async function fillPdfForm(bytes, values) {
  if (!values || typeof values!=='object' || Array.isArray(values)) fail('INVALID_FORM_VALUES');
  return withForm(bytes, async (metadata,{doc,widgets,pages}) => {
    if(metadata.restrictions.length) fail(`FORM_RESTRICTED:${metadata.restrictions.join(',')}`);
    const index=new Map(metadata.fields.map((field,i)=>[field.key,{field,widget:widgets[i]}])), shared=new Map();
    for(const [key,value] of Object.entries(values)) {
      const entry=index.get(key); if(!entry) fail('UNKNOWN_FORM_FIELD');
      const {field}=entry;
      if(field.readOnly || field.unsupported.length) fail('FORM_FIELD_NOT_EDITABLE');
      if(typeof value!==(field.type==='checkbox'?'boolean':'string')) fail('INVALID_FORM_VALUE_TYPE');
      if(field.required && (value===false || (typeof value==='string' && !value.trim()))) fail('REQUIRED_FORM_VALUE_EMPTY');
      if(field.type==='text' && field.maxLength>0 && Array.from(value).length>field.maxLength) fail('FORM_TEXT_TOO_LONG');
      if(field.type==='choice' && !field.options.some(option=>option.value===value)) fail('INVALID_FORM_CHOICE');
      if(field.type==='radio' && !metadata.fields.some(other=>other.groupId===field.groupId && other.exportValue===value)) fail('INVALID_FORM_RADIO');
      const identity=field.groupId;
      if(shared.has(identity) && shared.get(identity)!==value) fail('CONFLICTING_SHARED_FORM_VALUES');
      shared.set(identity,value);
    }
    for(const [identity,value] of shared) {
      const group=[...index.values()].filter(({field})=>(field.groupId)===identity);
      if(group.some(({field})=>field.readOnly || field.unsupported.length)) fail('FORM_FIELD_NOT_EDITABLE');
      if(group.some(({field})=>field.type!==group[0].field.type)) fail('INCONSISTENT_SHARED_FORM_TYPE');
      for(const {field,widget} of group) {
        if(field.type==='text') { if(!widget.setTextValue(value)) fail('FORM_VALUE_REJECTED'); }
        else if(field.type==='choice') { if(!widget.setChoiceValue(value)) fail('FORM_VALUE_REJECTED'); }
        else if(field.type==='checkbox') { if((widget.getValue()!=='Off' && widget.getValue()!=='')!==value && !widget.toggle()) fail('FORM_VALUE_REJECTED'); }
        else if(field.type==='radio' && field.exportValue===value && widget.getValue()!==value) { if(!widget.toggle()) fail('FORM_VALUE_REJECTED'); }
      }
    }
    for(const [identity,value] of shared) {
      for(const {field,widget} of index.values()) {
        if((field.groupId)!==identity) continue;
        const actual=widget.getValue();
        if((field.type==='checkbox' ? actual!=='Off' && actual!=='' : actual)!==value) fail('FORM_VALUE_READBACK_FAILED');
      }
    }
    for(const page of pages) page.update();
    const buffer=doc.saveToBuffer({garbage:3,compress:true});
    let output;
    try { output=new Uint8Array(buffer.asUint8Array()); } finally { buffer.destroy(); }
    const reopened=await inspectPdfForm(output), saved=new Map(reopened.fields.map(field=>[field.key,field]));
    for(const field of metadata.fields) {
      if(!shared.has(field.groupId)) continue;
      if(saved.get(field.key)?.value!==shared.get(field.groupId)) fail('FORM_SERIALIZED_READBACK_FAILED');
    }
    return output;
  });
}
