import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('scanner browser entry and processing worker bundle for production',async t=>{
 const outDir=await mkdtemp(path.join(tmpdir(),'jt-scan-build-'));t.after(()=>rm(outDir,{recursive:true,force:true}));
 await build({configFile:false,logLevel:'error',worker:{format:'es'},build:{target:'esnext',outDir,lib:{entry:path.resolve('packages/jt-scan/ui.js'),formats:['es'],fileName:'scan'}}});
 assert.ok((await readdir(outDir)).includes('scan.js'));
});
