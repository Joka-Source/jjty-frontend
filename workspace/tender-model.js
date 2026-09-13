export const tender = Object.freeze({id:'2026_PWR_1337988_1',title:'Concrete road and gutter',place:'Old Kothali · Muktainagar',value:2126275,emd:22000,fee:1090,deadline:'2026-09-18T17:00:00+05:30',days:90,bidderClass:'MSS Class-A',reference:'E-Tender Notice No-12 For 2026-27-MSS',authority:'Executive Engineer P.W.(North) Division, Jalgaon',source:'https://mahatenders.gov.in/nicgep/app',checked:'2026-09-13'});
export const requirements = [
 ['nit','Notice inviting tender','Tendernotice_1.pdf','Official notice'],
 ['terms','Tender document','12_1.pdf','Official terms'],
 ['boq','Original bill of quantities','BOQ_2288013.xls','Official pricing template'],
 ['registration','MSS Class-A registration','','Bidder evidence'],
 ['capacity','QR-based bid capacity and technical manpower certificate','','Required in technical cover'],
 ['technical','Technical documents','','Scope to confirm against NIT'],
 ['signed','Signed tender document','','Required in finance cover'],
 ['priced','Completed bill of quantities','','Required in finance cover'],
 ['payment','Tender fee and EMD evidence','','Payment confirmation'],
].map(([id,label,expected,note])=>({id,label,expected,note}));
export const initialBid = ()=>({company:'',registration:'',notes:'',eligibility:false,corrigenda:false,documents:{},history:[]});
export function blockers(bid,now=Date.now()) {
 const result=[];
 if(now>=Date.parse(tender.deadline))result.push('The recorded submission deadline has passed. Verify any extension on MahaTenders.');
 if(!bid.company?.trim())result.push('Add the bidding organisation.');
 if(!bid.registration?.trim()||!bid.eligibility)result.push('Verify MSS Class-A registration and all NIT eligibility conditions.');
 if(!bid.corrigenda)result.push('Review the latest corrigenda and confirm the deadline.');
 for(const r of requirements)if(!bid.documents[r.id]?.reviewed)result.push(`Review ${r.label.toLowerCase()}.`);
 return result;
}
export function fileProblem(id,file) {
 const r=requirements.find(r=>r.id===id);
 if(!r)return 'Unknown document category.';
 if(!file?.size)return 'Choose a non-empty file.';
 if(file.size>50*1024*1024)return 'Choose a file under 50 MB.';
 if(r.expected&&file.name!==r.expected)return `Use the official file named ${r.expected}.`;
 if(!/\.(pdf|xls|xlsx|zip|rar)$/i.test(file.name))return 'Use a PDF, Excel workbook, ZIP or RAR file.';
 return '';
}
