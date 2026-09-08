/** Visual controls dispatch the review's existing verified snapshot operations. */
export function initPdfPageOverview({pages,download,orderInput,orderButton,extractInput,extractButton,undoButton}){
 const toolbar=document.createElement('div');toolbar.className='pdf-page-overview-toolbar';
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Page overview';toggle.setAttribute('aria-pressed','false');
 const extract=document.createElement('button');extract.type='button';extract.textContent='Extract selected';extract.dataset.overviewExtract='';extract.disabled=true;
 const count=document.createElement('span');count.setAttribute('role','status');count.textContent='No pages selected';
 toolbar.append(toggle,extract,undoButton,count);pages.before(toolbar);
 toggle.addEventListener('click',()=>{const enabled=pages.classList.toggle('is-overview');toggle.setAttribute('aria-pressed',String(enabled));pages.parentElement.querySelector('.pdf-review-tools').hidden=enabled;});
 function selected(){return [...pages.querySelectorAll('[data-overview-select]:checked')].map(n=>Number(n.dataset.overviewSelect));}
 function sync(){
  const figures=[...pages.querySelectorAll('.pdf-review-page')],busy=download.disabled;
  for(const [index,figure] of figures.entries()){
   if(!figure.querySelector('.pdf-page-select')){
    const label=document.createElement('label');label.className='pdf-page-select';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.overviewSelect=String(index);checkbox.setAttribute('aria-label',`Select page ${index+1}`);label.append(checkbox,document.createTextNode(`Select page ${index+1}`));figure.prepend(label);
    checkbox.addEventListener('change',sync);
    for(const [direction,delta] of [['earlier',-1],['later',1]]){
     const button=document.createElement('button');button.type='button';button.dataset.overviewMove=String(delta);button.textContent=`Move ${direction}`;button.setAttribute('aria-label',`Move page ${index+1} ${direction}`);
     button.addEventListener('click',()=>{if(button.disabled||orderButton.disabled)return;const live=[...pages.querySelectorAll('.pdf-review-page')],position=live.indexOf(figure);if(position<0||position+delta<0||position+delta>=live.length)return;const order=live.map((_,i)=>i+1);[order[position],order[position+delta]]=[order[position+delta],order[position]];orderInput.value=order.join(',');orderInput.form.requestSubmit(orderButton);});figure.querySelector('.pdf-review-page-actions').append(button);
    }
   }
   figure.querySelector('[data-overview-select]').disabled=busy||extractButton.disabled;
   for(const button of figure.querySelectorAll('[data-overview-move]')){const destination=index+Number(button.dataset.overviewMove);button.disabled=busy||orderButton.disabled||destination<0||destination>=figures.length;}
  }
  const selection=selected();count.textContent=selection.length?`${selection.length} pages selected`:'No pages selected';extract.disabled=busy||extractButton.disabled||!selection.length;
 }
 extract.addEventListener('click',()=>{if(extract.disabled)return;extractInput.value=selected().map(i=>i+1).join(',');extractInput.form.requestSubmit(extractButton);});
 new MutationObserver(sync).observe(pages,{childList:true});
 for(const button of [download,orderButton,extractButton,undoButton])new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['disabled']});
 sync();return {sync};
}
