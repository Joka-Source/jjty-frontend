// Follow the visible control groups a reader uses; never click hidden tools.
export async function prepareStudioControl(page,selector){
 const visible=await page.$eval(selector,e=>e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})).catch(()=>false);
 if(visible)return;
 const action=selector.match(/data-doc-action=["']?([^"'\]]+)/)?.[1];
 if(['ink','focus-text','markup-panel','undo','redo'].includes(action))await page.locator('[data-doc-action="write-panel"]').click();
 if(['previous','next','zoom-in','zoom-out','fit','page-text'].includes(action))await page.locator('.real-jelly [data-doc-action="pages-panel"]').click();
 if(selector==='[data-a="theme"]'){
  const panelVisible=await page.$eval('[data-real-panel="export"]',e=>!e.hidden);
  if(!panelVisible)await page.locator('[data-doc-action="export-panel"]').click();
  const open=await page.$eval('.real-more',e=>e.open);if(!open)await page.locator('.real-more summary').click();
 }
}
