import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs/research/pdf-expert-ipad');
const read=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const users=await read('user-observations.json');
const official=await read('pdf-expert-ipad-interactions.json');
const bento=await read('bento-reuse-contracts.json');
const rows=[...users,...official.map(r=>({id:r.id,kind:'Official instructions',title:r.job,
  job:r.trigger,description:r.documented_behavior,acceptance:r.proposed_acceptance,
  uncertainty:r.verification_needed,links:[{label:'Official iPad / iOS instructions',url:r.source_url}],
  verification:'Documented behavior; app version unspecified; direct device check outstanding'})),
  ...bento.contracts.map(r=>({id:'bento-'+r.id,kind:'Bento source',title:r.feature,
    job:r.reuseBoundary,description:r.observedBehavior,acceptance:r.fixtureAcceptance.join('\n'),
    uncertainty:r.improvementsAndRisks.join('\n'),
    links:r.attribution.sourceLinks.map((url,i)=>({label:r.sourceModules[i]??'Pinned source',url})),
    verification:'Source inspection only; not integrated or executed. '+r.attribution.applicationLicenseDeclaration}))];
if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate research ID');
for(const row of rows){
  for(const key of ['id','kind','title','description','acceptance','uncertainty','verification']){
    if(typeof row[key]!=='string'||!row[key].trim())throw new Error(`${row.id}: missing ${key}`);
  }
  if(!row.links?.length)throw new Error(`${row.id}: no evidence link`);
  for(const link of row.links)if(new URL(link.url).protocol!=='https:')throw new Error('Invalid evidence URL');
}
const data=JSON.stringify(rows).replaceAll('<','\\u003c');
const template=await readFile(path.join(root,'explorer.template.html'),'utf8');
await writeFile(path.join(root,'explorer.html'),template.replace('/* RESEARCH_DATA */',data));
console.log(`Built research explorer: ${users.length} user observations, ${official.length} documented interactions, ${bento.contracts.length} source contracts.`);
