import {openEpubPackage} from './epub-package.js';
import {prepareEpubChapter} from './epub-content.js';
import './epub-reader.css';

export async function mountEpubReader(article,doc,{onSelect,onPreferences,getReaderTop=()=>0,preferences={}}={}){
 const document=article.ownerDocument,book=await openEpubPackage(new Uint8Array(doc.sourceBytes));
 if(book.layout==='pre-paginated')throw new Error('Fixed-layout EPUB reading is not available yet.');
 const chapters=[],blocks=[],texts=[];
 const root=document.createElement('div');root.className='epub-book';root.dataset.epubDocId=doc.id;root.dataset.epubDigest=doc.provenance.contentDigest;root.lang=book.language||'';root.dir=book.direction||'ltr';
 const tools=document.createElement('nav');tools.className='epub-tools';tools.setAttribute('aria-label','Book controls');
 tools.innerHTML='<details><summary>Contents</summary><ol class="epub-contents"></ol></details><label>Text size <select aria-label="Book text size"><option value="18">Small</option><option value="22">Medium</option><option value="26">Large</option><option value="30">Extra large</option></select></label><label>Typeface <select aria-label="Book typeface"><option value="publisher">Publisher</option><option value="serif">Serif</option><option value="sans">Sans serif</option></select></label><button type="button" class="epub-return" disabled>Return to passage</button><label>Find in book <input type="search" maxlength="200"></label><button type="button" class="epub-find">Next match</button><span role="status"></span>';
 const status=tools.querySelector('[role=status]'),size=tools.querySelector('[aria-label="Book text size"]'),font=tools.querySelector('[aria-label="Book typeface"]'),back=tools.querySelector('.epub-return');
 let departure=null,lastQuery='',matchIndex=-1;
 function visibleBlock(){return blocks.find(node=>node.getBoundingClientRect().bottom>getReaderTop())||blocks[0];}
 function go(target,{remember=true}={}){
  if(!target)return false;
  if(remember){departure=visibleBlock();back.disabled=!departure;}
  document.defaultView.scrollBy({top:target.getBoundingClientRect().top-getReaderTop(),behavior:'instant'});
  const index=blocks.findIndex(node=>node===target||target.contains(node)||node.contains(target));
  if(index>=0)onSelect?.(index);
  return true;
 }
 function navigate(href){
  const [path,fragment]=href.split('#'),chapter=chapters.find(item=>item.element.dataset.epubChapter===path);
  if(!chapter){status.textContent='This destination is not in the reading order.';return;}
  let decoded;try{decoded=decodeURIComponent(fragment||'');}catch{status.textContent='This passage could not be found.';return;}
  const target=fragment?chapter.element.querySelector(`#${CSS.escape(chapter.idMap.get(decoded)||"missing-epub-target")}`):chapter.element;
  if(!go(target))status.textContent='This passage could not be found.';
 }
 try{
  for(let i=0;i<book.spine.length;i++){
   const chapter=prepareEpubChapter(book,i,{document,scopeId:`epub-read-${i}`});chapters.push(chapter);
   for(const block of chapter.blocks){
    const index=blocks.length,saved=doc.blocks?.[index];
    if(!saved||saved.text!==block.text||saved.locator!==block.locator)throw new Error('This book’s saved passage map differs from its source. The original is preserved; import the original again to create a fresh reading copy.');
    block.element.classList.add('reading-block');block.element.dataset.block=String(index);block.element.dataset.kind=block.kind;
    block.element.addEventListener('click',()=>onSelect?.(index));blocks.push(block.element);texts.push(block.text);
   }
   root.append(chapter.element);
  }
  if(blocks.length!==doc.blocks?.length)throw new Error('The saved book passage map is incomplete.');
  function contents(items,list){for(const item of items){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=item.label||'Chapter';button.onclick=()=>{tools.querySelector('details').open=false;navigate(item.href);};li.append(button);if(item.children?.length){const nested=document.createElement('ol');contents(item.children,nested);li.append(nested);}list.append(li);}}
  contents(book.toc.length?book.toc:book.spine.map((item,i)=>({label:`Chapter ${i+1}`,href:item.href})),tools.querySelector('ol'));
  root.addEventListener('click',event=>{const link=event.target.closest('[data-epub-href]');if(link){event.preventDefault();navigate(link.dataset.epubHref);}});
  back.onclick=()=>{const held=departure;departure=null;back.disabled=true;go(held,{remember:false});};
  size.value=['18','22','26','30'].includes(String(preferences.size))?String(preferences.size):'22';font.value=['publisher','serif','sans'].includes(preferences.font)?preferences.font:'publisher';
  function apply(){root.style.fontSize=`${size.value}px`;root.dataset.typeface=font.value;for(const node of root.querySelectorAll('[data-epub-font-base]'))node.style.setProperty('font-size',`${Number(node.dataset.epubFontBase)*Number(size.value)/22}px`,'important');}
  function change(){const held=visibleBlock(),offset=held?held.getBoundingClientRect().top-getReaderTop():0;apply();if(held)document.defaultView.scrollBy({top:held.getBoundingClientRect().top-getReaderTop()-offset,behavior:'instant'});onPreferences?.({size:Number(size.value),font:font.value});}
  size.onchange=change;font.onchange=change;root.style.fontSize='22px';
  const search=tools.querySelector('input');
  function find(){const query=search.value.trim().toLocaleLowerCase();if(!query){status.textContent='Enter words to find.';return;}if(lastQuery!==query){matchIndex=-1;lastQuery=query;}const matches=texts.flatMap((text,i)=>text.toLocaleLowerCase().includes(query)?[i]:[]);if(!matches.length){status.textContent='No matches';return;}matchIndex=(matchIndex+1)%matches.length;go(blocks[matches[matchIndex]]);status.textContent=`${matchIndex+1} of ${matches.length} matching passages`;}
  tools.querySelector('.epub-find').onclick=find;search.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();find();}};
  const warnings=[...new Set(chapters.flatMap(chapter=>chapter.warnings))];if(warnings.length){const notes=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent='Book display notes';text.textContent=warnings.join(' ');notes.append(summary,text);tools.append(notes);}
  const textOptions=document.createElement('details'),textSummary=document.createElement('summary'),textPanel=document.createElement('div');textSummary.textContent='Text';textPanel.className='epub-popover';textPanel.append(size.closest('label'),font.closest('label'));textOptions.append(textSummary,textPanel);
  const findOptions=document.createElement('details'),findSummary=document.createElement('summary'),findPanel=document.createElement('div');findSummary.textContent='Find';findPanel.className='epub-popover';findPanel.append(search.closest('label'),tools.querySelector('.epub-find'),status);findOptions.append(findSummary,findPanel);tools.insertBefore(textOptions,back);tools.insertBefore(findOptions,back);
  for(const detail of tools.querySelectorAll(':scope > details'))detail.addEventListener('toggle',()=>{if(detail.open)for(const sibling of tools.querySelectorAll(':scope > details'))if(sibling!==detail)sibling.open=false;});
  document.getElementById('reader-chrome').append(tools);article.append(root);article.classList.add('epub-document');
  for(const node of root.querySelectorAll('.epub-chapter,.epub-chapter *:not(style)')){const base=parseFloat(document.defaultView.getComputedStyle(node).fontSize);if(Number.isFinite(base))node.dataset.epubFontBase=String(base);}apply();
  return {blocks,blockTexts:texts,dispose(){tools.remove();root.remove();article.classList.remove('epub-document');chapters.forEach(chapter=>chapter.dispose());}};
 }catch(error){chapters.forEach(chapter=>chapter.dispose());tools.remove();root.remove();throw error;}
}
