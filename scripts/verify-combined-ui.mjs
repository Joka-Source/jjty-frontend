import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const proof=path.resolve(root,'../runtime/combined-proof',String(Date.now()));
const child=spawn(process.execPath,['--import','tsx','--test','test/pdf-combined-preview.test.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,JETT_COMBINED_PROOF_DIR:proof}});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;if(code===0)console.log(JSON.stringify({proof}));});
