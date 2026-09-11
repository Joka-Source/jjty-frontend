import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('local dependency repair preserves installed archives and links directory packages idempotently',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'jjty-dependency-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const p of ['scripts','vendor','packages/local','node_modules/archive'])await mkdir(path.join(root,p),{recursive:true});
 await copyFile(new URL('../scripts/resolve-local-dependencies.mjs',import.meta.url),path.join(root,'scripts/resolve-local-dependencies.mjs'));
 await writeFile(path.join(root,'package.json'),JSON.stringify({type:'module',dependencies:{archive:'file:vendor/archive.tgz',local:'file:packages/local'}}));
 await writeFile(path.join(root,'vendor/archive.tgz'),'archive fixture');await writeFile(path.join(root,'node_modules/archive/installed'),'preserve this package');
 for(let i=0;i<2;i++)execFileSync(process.execPath,[path.join(root,'scripts/resolve-local-dependencies.mjs')]);
 assert.equal(await readFile(path.join(root,'node_modules/archive/installed'),'utf8'),'preserve this package');
 assert.equal(await realpath(path.join(root,'node_modules/local')),await realpath(path.join(root,'packages/local')));
});
