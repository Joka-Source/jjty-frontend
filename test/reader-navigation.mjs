// Navigate the actual workspace/disclosures before exercising existing tools.
export async function selectWorkspace(page, value) {
  await page.waitForFunction(value => {
    const select = document.getElementById('reader-workspace');
    return document.body.dataset.view === 'read' && select && !select.disabled && [...select.options].some(option => option.value === value && !option.disabled);
  }, {}, value);
  await page.select('#reader-workspace', value);
}
export async function openReaderMenu(page, id = 'reader-document-menu') {
  if (!await page.$eval(`#${id}`, node => node.open)) await page.locator(`#${id} > summary`).click();
}
export async function clickReaderControl(page, selector) {
  try {
    await page.$eval(selector,node=>{node.__readerTestClicked=false;node.addEventListener('click',()=>{node.__readerTestClicked=true;},{once:true});});
    await page.$eval(selector,node=>node.scrollIntoView({block:"center",behavior:"instant"}));
    await page.locator(selector).click();
    if(!await page.$eval(selector,node=>node.__readerTestClicked))throw new Error('Pointer did not reach the requested control');
  }
  catch (error) {
    const state = await page.evaluate(selector => ({selector,view:document.body.dataset.view,workspace:document.getElementById('reader-workspace')?.value,element:document.querySelector(selector)?.outerHTML,rect:document.querySelector(selector)?.getBoundingClientRect().toJSON(),hit:(()=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML:null;})(),status:document.getElementById('status-text')?.textContent}),selector);
    throw new Error(`Reader control failed: ${JSON.stringify(state)}`,{cause:error});
  }
}

export async function navigateSecondary(page, route) {
  if(!await page.$eval('body',node=>node.classList.contains('sheet-more')))await page.locator('#tab-more').click();
  await page.locator(`#more-panel a[href="#/${route}"]`).click();
}

export async function navigateApp(page, route) {
  if (['home','read'].includes(route) || (route==='settings' && await page.$eval('[data-view-link="settings"]',n=>n.getBoundingClientRect().width>0))) {
    await page.locator(`[data-view-link="${route}"]`).click();
  } else await navigateSecondary(page,route);
}
export async function openPaste(page) {
  const selector='.paste-composer';
  if (!await page.$eval(selector,n=>n.open)) await page.locator(`${selector} > summary`).click();
}
