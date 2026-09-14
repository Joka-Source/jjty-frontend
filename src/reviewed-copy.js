async function digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
export function reviewOrigin(doc){return {documentId:doc.id,contentDigest:doc.provenance?.contentDigest};}
export async function reviewedCopyMetadata(bytes,origin,kind){
 if(!origin?.documentId||!origin?.contentDigest)throw new Error('The source identity is unavailable. Reopen the document and review again.');
 const resultDigest=await digest(bytes);
 const identity=await digest(new TextEncoder().encode(JSON.stringify([origin.documentId,origin.contentDigest,resultDigest])));
 return {id:`review_${identity}`,derivedFrom:{documentId:origin.documentId,contentDigest:origin.contentDigest,resultDigest,tool:'JETT',operation:kind,lineageScope:'primary-source'}};
}
