import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as mupdf from 'mupdf';
import {inspectPdfForm,fillPdfForm} from '../src/pdf-forms.js';
const original=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url)));
const plain=new Uint8Array(readFileSync(new URL('./fixtures/jett-annotations.pdf',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fieldKey(name,bytes=original){return (await inspectPdfForm(bytes)).fields.find(f=>f.name===name).key;}
function altered(edit,saveOptions={}) {
 const doc=new mupdf.PDFDocument(original.slice());doc.disableJS(); const objects=[];
 const get=(obj,...keys)=>{const value=obj.get(...keys);objects.push(value);return value;};
 const trailer=doc.getTrailer();objects.push(trailer);
 try {edit(doc,get(trailer,'Root','AcroForm'),get,trailer);const b=doc.saveToBuffer(saveOptions);try{return new Uint8Array(b.asUint8Array());}finally{b.destroy();}}
 finally{objects.reverse().forEach(o=>o.destroy());doc.destroy();}
}
function renderHash(bytes){const d=new mupdf.PDFDocument(bytes);const p=d.loadPage(0);const pix=p.toPixmap([1,0,0,1,0,0],mupdf.ColorSpace.DeviceRGB,false,true);try{return hash(pix.getPixels());}finally{pix.destroy();p.destroy();d.destroy();}}
test('plain PDFs without AcroForm report no fields without mutation or failure',async()=>{
 const before=hash(plain),doc=new mupdf.PDFDocument(plain.slice()),trailer=doc.getTrailer(),form=trailer.get('Root','AcroForm');
 try{assert.equal(form.isNull(),true);}finally{form.destroy();trailer.destroy();doc.destroy();}
 assert.deepEqual(await inspectPdfForm(plain),{fields:[],restrictions:[],canFill:false});
 assert.equal(hash(plain),before);
});
test('enumerates real widgets with stable keys, shared values and choice options',async()=>{
 const m=await inspectPdfForm(original);assert.equal(m.canFill,true);assert.deepEqual(m.restrictions,[]);assert.equal(m.fields.length,8);
 assert.equal(new Set(m.fields.map(f=>f.key)).size,8);assert.deepEqual((await inspectPdfForm(original)).fields,m.fields);
 assert.equal(m.fields.filter(f=>f.name==='reference').length,2);
 assert.deepEqual(m.fields.find(f=>f.name==='category').options.map(o=>o.value),['General','Research','Support']);
 assert.deepEqual(m.fields.filter(f=>f.type==='radio').map(f=>f.exportValue),['Email','Post']);
});
test('fills all supported types, mirrors shared widgets, updates appearance and preserves original bytes',async()=>{
 const before=hash(original),m=await inspectPdfForm(original), expected={full_name:'Orchard Reader',reference:'JETT-222',category:'Research',delivery:'Post',consent:true,notes:'First line\nSecond line'};
 const values=Object.fromEntries(m.fields.map(f=>[f.key,expected[f.name]]));const out=await fillPdfForm(original,values);
 assert.notEqual(hash(out),before);assert.equal(hash(original),before);
 for(const f of (await inspectPdfForm(out)).fields)assert.equal(f.value,expected[f.name],f.name);
 assert.notEqual(renderHash(out),renderHash(original),'saved widget appearance changes in real renderer');
 assert.equal((await inspectPdfForm(original)).fields.find(f=>f.name==='full_name').value,'');
 await assert.rejects(fillPdfForm(out,{[await fieldKey('consent',out)]:false}),/REQUIRED_FORM_VALUE_EMPTY/);
});
test('rejects conflicts, unknown fields and invalid field values before exporting',async()=>{
 const m=await inspectPdfForm(original),ref=m.fields.filter(f=>f.name==='reference');
 await assert.rejects(fillPdfForm(original,{[ref[0].key]:'A',[ref[1].key]:'B'}),/CONFLICTING_SHARED/);
 await assert.rejects(fillPdfForm(original,{'not-a-key':'x'}),/UNKNOWN_FORM_FIELD/);
 await assert.rejects(fillPdfForm(original,{[await fieldKey('category')]:'Invented'}),/INVALID_FORM_CHOICE/);
 await assert.rejects(fillPdfForm(original,{[await fieldKey('consent')]:'true'}),/INVALID_FORM_VALUE_TYPE/);
 await assert.rejects(fillPdfForm(original,{[await fieldKey('full_name')]:'x'.repeat(101)}),/FORM_TEXT_TOO_LONG/);
});
test('inherited read-only flags prevent shared-field edits',async()=>{
 const b=altered((_doc,form,get)=>get(form,'Fields',1).put('Ff',1));
 const refs=(await inspectPdfForm(b)).fields.filter(f=>f.name==='reference');assert.ok(refs.every(f=>f.readOnly));
 await assert.rejects(fillPdfForm(b,{[refs[0].key]:'no'}),/FORM_FIELD_NOT_EDITABLE/);
});
test('choice export/display values remain distinct and export roundtrips',async()=>{
 const b=altered((doc,form,get)=>{
  const field=get(form,'Fields',2); const array=doc.newArray();const pair=doc.newArray();const value=doc.newString('R');const label=doc.newString('Research display');
  try{pair.push(value);pair.push(label);array.push(pair);field.put('Opt',array);}finally{value.destroy();label.destroy();pair.destroy();array.destroy();}
 });
 const field=(await inspectPdfForm(b)).fields.find(f=>f.name==='category');assert.deepEqual(field.options,[{value:'R',label:'Research display'}]);
 const out=await fillPdfForm(b,{[field.key]:'R'});assert.equal((await inspectPdfForm(out)).fields.find(f=>f.name==='category').value,'R');
});
test('dynamic XFA and calculation forms fail closed; multiselect is visibly unsupported',async()=>{
 for(const kind of ['XFA','CO']){
  const b=altered((doc,form)=>{const array=doc.newArray();const item=doc.newInteger(1);try{array.push(item);form.put(kind,array);}finally{item.destroy();array.destroy();}});
  assert.equal((await inspectPdfForm(b)).canFill,false);await assert.rejects(fillPdfForm(b,{}),/FORM_RESTRICTED/);
 }
 const b=altered((_doc,form,get)=>get(form,'Fields',2).put('Ff',1<<21));
 const f=(await inspectPdfForm(b)).fields.find(f=>f.name==='category');assert.ok(f.unsupported.includes('multi-select-unsupported'));
 await assert.rejects(fillPdfForm(b,{[f.key]:'Research'}),/FORM_FIELD_NOT_EDITABLE/);
});
test('encrypted documents cannot be modified even with empty user password',async()=>{
 const b=altered(()=>{}, {encrypt:'aes-256','owner-password':'synthetic-owner','user-password':''});
 assert.ok((await inspectPdfForm(b)).restrictions.includes('encrypted'));await assert.rejects(fillPdfForm(b,{}),/FORM_RESTRICTED/);
});
test('populated signature fields block export while blank signature field leaves other fields usable',async()=>{
 const make=signed=>altered((doc,form,get)=>{
  const fields=get(form,'Fields');const sig=doc.newDictionary();const ft=doc.newName('Sig');
  try{sig.put('FT',ft);if(signed){const v=doc.newDictionary();try{v.put('ByteRange',[0,10,20,30]);sig.put('V',v);}finally{v.destroy();}}fields.push(sig);}finally{ft.destroy();sig.destroy();}
 });
 const blank=make(false);assert.equal((await inspectPdfForm(blank)).canFill,true);
 const signed=make(true);assert.ok((await inspectPdfForm(signed)).restrictions.includes('signed-document'));
 await assert.rejects(fillPdfForm(signed,{}),/FORM_RESTRICTED/);
});
test('field actions are exposed as unsupported and cannot execute through filling',async()=>{
 const b=altered((doc,form,get)=>{
  const action=doc.newDictionary(),kind=doc.newName('JavaScript'),script=doc.newString('event.value="unexpected";'),aa=doc.newDictionary();
  try{action.put('S',kind);action.put('JS',script);aa.put('V',action);get(form,'Fields',0).put('AA',aa);}
  finally{action.destroy();kind.destroy();script.destroy();aa.destroy();}
 });
 const field=(await inspectPdfForm(b)).fields.find(f=>f.name==='full_name');
 assert.ok(field.unsupported.includes('field-actions-unsupported'));
 await assert.rejects(fillPdfForm(b,{[field.key]:'Safe text'}),/FORM_FIELD_NOT_EDITABLE/);
 assert.equal((await inspectPdfForm(b)).fields.find(f=>f.name==='full_name').value,'');
});
test('same-name independent fields are rejected while canonical shared parents remain editable',async()=>{
 const metadata=await inspectPdfForm(original),refs=metadata.fields.filter(f=>f.name==='reference');
 assert.equal(refs[0].groupId,refs[1].groupId);
 const b=altered((doc,form,get)=>{const duplicate=doc.newString('reference');try{get(form,'Fields',0).put('T',duplicate);}finally{duplicate.destroy();}});
 const m=await inspectPdfForm(b);assert.ok(m.restrictions.includes('ambiguous-duplicate-field-name'));assert.equal(m.canFill,false);
 await assert.rejects(fillPdfForm(b,{[m.fields[0].key]:'Do not merge'}),/FORM_RESTRICTED/);
});
test('serialized output is reopened and dropped edits are rejected',async()=>{
 const key=await fieldKey('full_name'),save=mupdf.PDFDocument.prototype.saveToBuffer;
 mupdf.PDFDocument.prototype.saveToBuffer=function(){return new mupdf.Buffer(original);};
 try{await assert.rejects(fillPdfForm(original,{[key]:'Saved or rejected'}),/FORM_SERIALIZED_READBACK_FAILED/);}
 finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
});
test('required supplied text cannot be blank; optional checkbox can still be cleared',async()=>{
 const required=altered((_doc,form,get)=>get(form,'Fields',0).put('Ff',2));
 await assert.rejects(fillPdfForm(required,{[await fieldKey('full_name',required)]:'  '}),/REQUIRED_FORM_VALUE_EMPTY/);
 const optional=altered((_doc,form,get)=>get(form,'Fields',4).put('Ff',0));
 const key=await fieldKey('consent',optional),checked=await fillPdfForm(optional,{[key]:true});
 const cleared=await fillPdfForm(checked,{[key]:false});assert.equal((await inspectPdfForm(cleared)).fields.find(f=>f.name==='consent').value,false);
});
test('shared checkboxes with different on-states are refused instead of treated as one boolean',async()=>{
 const bytes=altered((_doc,form,get)=>get(form,'Fields',3).put('Ff',0));
 const before=hash(bytes),metadata=await inspectPdfForm(bytes);
 const boxes=metadata.fields.filter(field=>field.name==='delivery');
 assert.equal(boxes.length,2);
 assert.ok(boxes.every(field=>field.type==='checkbox'));
 assert.equal(boxes[0].groupId,boxes[1].groupId);
 assert.deepEqual(boxes.map(field=>field.exportValue),['Email','Post']);
 assert.ok(boxes.every(field=>field.unsupported.includes('shared-checkbox-states-unsupported')));
 for(const field of boxes) await assert.rejects(fillPdfForm(bytes,{[field.key]:true}),/FORM_FIELD_NOT_EDITABLE/);
 assert.equal(hash(bytes),before);
 // Unsupported choices do not prevent independent ordinary text edits.
 const out=await fillPdfForm(bytes,{[await fieldKey('full_name',bytes)]:'Reader'});
 assert.equal((await inspectPdfForm(out)).fields.find(field=>field.name==='full_name').value,'Reader');
});
