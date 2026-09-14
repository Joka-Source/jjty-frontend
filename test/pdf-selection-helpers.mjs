export async function selectPdfQuote(page,phrase,occurrence=0,pageNumber=2){
  await page.$eval(`.pdf-page[data-page="${pageNumber}"]`,node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  await page.evaluate(({phrase,occurrence,pageNumber})=>{
    const block=document.querySelector(`.pdf-page[data-page="${pageNumber}"] [data-block]`),text=block.dataset.blockText;
    let start=-1;for(let i=0;i<=occurrence;i++)start=text.indexOf(phrase,start+1);
    if(start<0)throw new Error('Fixture phrase missing');
    function point(char,isEnd){
      const items=[...block.querySelectorAll('[data-pdf-char-start]')];
      const item=items.find(n=>char>=Number(n.dataset.pdfCharStart)&&(isEnd?char<=Number(n.dataset.pdfCharEnd):char<Number(n.dataset.pdfCharEnd)));
      if(!item)throw new Error('Fixture DOM mapping missing');
      let offset=char-Number(item.dataset.pdfCharStart),node;const walker=document.createTreeWalker(item,NodeFilter.SHOW_TEXT);
      while(node=walker.nextNode()){if(offset<=node.length)return [node,offset];offset-=node.length;}throw new Error('Fixture endpoint missing');
    }
    const range=document.createRange();range.setStart(...point(start,false));range.setEnd(...point(start+phrase.length,true));
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  },{phrase,occurrence,pageNumber});
  await page.waitForFunction(()=>!document.querySelector('[data-annotation="highlight"]').disabled);
}
