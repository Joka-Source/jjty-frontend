// Local-only experimental ASR harness. Generated audio never reaches a speaker
// or physical microphone; it feeds an explicit Web Audio destination track.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
const directory=path.resolve(process.argv[2]??'../runtime/voice-ab'),port=Number(process.argv[3]??4996);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be an integer from 1024 to 65535');
const serverOrigin='http://127.0.0.1:'+port,allowedOrigin=process.argv[4]??serverOrigin;
const parsedOrigin=new URL(allowedOrigin);
if(parsedOrigin.origin!==allowedOrigin||parsedOrigin.protocol!=='http:'||parsedOrigin.hostname!=='127.0.0.1')throw Error('Frame origin must be an exact loopback HTTP origin');
const tailMs=Number(process.argv[5]??3500);
if(!Number.isInteger(tailMs)||tailMs<500||tailMs>10000)throw Error('Tail duration must be 500 to 10000 ms');
const recognitionMode=process.argv[6]??'continuous';
if(!['continuous','single'].includes(recognitionMode))throw Error('Recognition mode must be continuous or single');
const continuous=recognitionMode==='continuous';
const token=randomBytes(24).toString('hex');
const cases=[['highlight this','command'],['please highlight this','command'],['mark this important','command'],['undo','command'],['I like this','control'],['and highlighting','control'],['The northern orchard produces crisp apples every autumn','reading'],['Until repairs are complete rent remains due','reading']].map(([expectedText,kind],index)=>({index,expectedText,kind}));
await fs.mkdir(directory,{recursive:true});
for(const item of cases){const file=path.join(directory,`${item.index}.wav`);const made=spawnSync('say',['-v','Samantha','-r','165','--data-format=LEI16@16000','-o',file,item.expectedText],{encoding:'utf8'});if(made.status!==0)throw Error(made.stderr||'Audio generation failed');item.sha256=createHash('sha256').update(await fs.readFile(file)).digest('hex');}
await fs.writeFile(path.join(directory,'corpus.json'),JSON.stringify({voice:'macOS Samantha',rate:165,cases},null,2));
const html=`<!doctype html><meta charset="utf-8"><title>JETT local voice comparison</title><style>body{font:16px system-ui;max-width:800px;margin:40px auto;padding:20px;background:#171a16;color:#e7ecdf}button{font:inherit;padding:14px}pre{white-space:pre-wrap}</style><h1>Local voice comparison</h1><p>Synthetic Samantha audio only. No microphone, speaker output, document edits or remote recognition.</p><button id="start">Run comparison</button><pre id="state">Ready to check local English availability.</pre><script>
const continuous=${continuous},tailMs=${tailMs},serverOrigin=${JSON.stringify(serverOrigin)},token=${JSON.stringify(token)},cases=${JSON.stringify(cases)},hints=['highlight this','start highlighting','end highlighting','stop highlighting'];
const R=window.SpeechRecognition||window.webkitSpeechRecognition,state=document.getElementById('state');let context,active=null,running=false,cancelled=false;
window.results=[];window.benchmark={physicalMicCalls:0,done:false,tailMs,continuous};
if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{benchmark.physicalMicCalls++;throw Error('Physical microphone forbidden in this harness');};
function show(message){state.textContent=message+'\\n'+JSON.stringify(results,null,2);}
async function trial(item,boost){
 const buffer=await context.decodeAudioData(await(await fetch(serverOrigin+'/audio/'+item.index)).arrayBuffer());
 if(cancelled)throw Error('Comparison cancelled before recognition');
 const rec=new R();
 if(!('processLocally' in rec))throw Error('Per-instance local recognition unavailable');
 rec.lang='en-US';rec.processLocally=true;rec.continuous=continuous;rec.interimResults=true;
 if(boost){if(typeof SpeechRecognitionPhrase!=='function'||!('phrases' in rec))throw Error('Phrase hints unavailable');rec.phrases=hints.map(p=>new SpeechRecognitionPhrase(p,boost));}
 const destination=context.createMediaStreamDestination(),track=destination.stream.getAudioTracks()[0],source=context.createBufferSource();
 const padded=context.createBuffer(buffer.numberOfChannels,buffer.length+Math.ceil(buffer.sampleRate*tailMs/1000),buffer.sampleRate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++)padded.copyToChannel(buffer.getChannelData(channel),channel);
 source.buffer=padded;source.connect(destination);
 const result={...item,condition:boost?'hints-2':'hints-off',boost,tailMs,transcript:'',finalized:false,events:[],partials:[],error:null,started:false,local:rec.processLocally,generatedTrack:true,audioDurationMs:buffer.duration*1000,explicitSilenceMs:tailMs};
 const began=performance.now();let timer,stopTimer,ended=false;
 return new Promise(resolve=>{
  const finish=()=>{if(ended)return;ended=true;clearTimeout(timer);clearTimeout(stopTimer);source.onended=null;try{source.stop();}catch{}source.disconnect();track.stop();rec.onstart=rec.onresult=rec.onerror=rec.onend=rec.onspeechend=rec.onaudioend=null;result.elapsedMs=performance.now()-began;result.trackEnded=track.readyState==='ended';active=null;resolve(result);};
  const recordEvent=type=>{if(!ended)result.events.push({type,atMs:performance.now()-began});};
  source.onended=()=>recordEvent('source-ended');rec.onspeechend=()=>recordEvent('speech-ended');rec.onaudioend=()=>recordEvent('audio-ended');
  active={rec,finish};rec.onstart=()=>{if(ended)return;result.started=true;result.startMs=performance.now()-began;source.start(context.currentTime+.15);stopTimer=setTimeout(()=>{if(!ended)try{result.stopRequestedMs=performance.now()-began;rec.stop();}catch(error){result.error=error.message;finish();}},result.audioDurationMs+tailMs+500);};
  rec.onresult=e=>{if(ended)return;result.firstResultMs??=performance.now()-began;const segments=Array.from(e.results);result.transcript=segments.filter(r=>r.isFinal).map(r=>r[0]?.transcript??'').join(' ').trim();result.finalized=segments.length>0&&segments.every(r=>r.isFinal);result.partials.push({atMs:performance.now()-began,text:segments.map(r=>r[0]?.transcript??'').join(' ').trim(),final:result.finalized});};
  rec.onerror=e=>{if(!ended)result.error=e.error;};rec.onend=finish;
  timer=setTimeout(()=>{result.error??='timeout';try{rec.abort();}catch{}finish();},20000);
  try{rec.start(track);}catch(error){result.error=error.name+': '+error.message;finish();}
 });
}
document.getElementById('start').onclick=async()=>{
 if(running)return;running=true;document.getElementById('start').disabled=true;
 try{
  if(document.featurePolicy?.allowsFeature('microphone')!==false)throw Error('Microphone must be blocked by browser Permissions Policy before running');
  const chromeMajor=Number(navigator.userAgent.match(/Chrome\\/(\\d+)/)?.[1]);
  if(!chromeMajor||chromeMajor<135)throw Error('This harness requires Chrome 135 or newer for explicit audio-track recognition');
  if(!R?.available)throw Error('On-device recognition API unavailable');
  benchmark.availability=await R.available({langs:['en-US'],processLocally:true});
  if(benchmark.availability!=='available')throw Error('Local English is '+benchmark.availability+'; no download or remote fallback attempted');
  context=new AudioContext();await context.resume();
  for(const item of cases){for(const boost of item.index%2?[2,0]:[0,2]){if(cancelled)throw Error('Comparison cancelled by navigation');show('Running '+item.expectedText+' / boost '+boost);results.push(await trial(item,boost));}}
 }catch(error){benchmark.error=error.message;}finally{
  try{active?.rec.abort();active?.finish();await context?.close();}catch{}
  benchmark.done=true;benchmark.audioContextClosed=!context||context.state==='closed';show('Comparison finished');
  await fetch(serverOrigin+'/results',{method:'POST',headers:{'Content-Type':'application/json','X-JETT-Benchmark':token},body:JSON.stringify({benchmark,trials:results,userAgent:navigator.userAgent})});
 }
};
addEventListener('pagehide',()=>{cancelled=true;try{active?.rec.abort();active?.finish();void context?.close();}catch{}});
</script>`;
const frame='<!doctype html><meta charset="utf-8"><title>JETT voice benchmark frame</title><iframe id="benchmark" title="Local-only voice comparison" allow="microphone \'none\'; on-device-speech-recognition \'self\'" style="border:0;width:100%;height:95vh"></iframe><script>document.getElementById("benchmark").srcdoc='+JSON.stringify(html).replaceAll('<','\\u003c')+';</script>';
await fs.writeFile(path.join(directory,'frame.html'),frame);
const server=http.createServer(async(req,res)=>{
 try {
  res.setHeader('Permissions-Policy','microphone=(), on-device-speech-recognition=(self)');
  res.setHeader('Cache-Control','no-store');
  if(req.headers.host!=='127.0.0.1:'+port){res.statusCode=403;res.end('Forbidden');return;}
  if(req.headers.origin===allowedOrigin){
   res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
   res.setHeader('Vary','Origin');
   res.setHeader('Access-Control-Allow-Headers','Content-Type, X-JETT-Benchmark');
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  }
  if(req.method==='OPTIONS'){
   res.statusCode=req.headers.origin===allowedOrigin?204:403;res.end();return;
  }
  if(req.method==='GET'&&req.url==='/'){
   res.setHeader('Content-Type','text/html');res.end(html);return;
  }
  const match=/^\/audio\/([0-7])$/.exec(req.url??'');
  if(req.method==='GET'&&match){
   res.setHeader('Content-Type','audio/wav');
   res.end(await fs.readFile(path.join(directory,match[1]+'.wav')));return;
  }
  if(req.method==='POST'&&req.url==='/results'){
   if(req.headers['x-jett-benchmark']!==token||req.headers.origin!==allowedOrigin){
    res.statusCode=403;res.end('Forbidden');return;
   }
   let body='';
   for await(const chunk of req){body+=chunk;if(body.length>1000000)throw Error('Result too large');}
   const result=JSON.parse(body);result.recordedAt=new Date().toISOString();
   const bytes=JSON.stringify(result,null,2);
   await fs.writeFile(path.join(directory,'results-'+Date.now()+'.json'),bytes,{flag:'wx'});
   await fs.writeFile(path.join(directory,'results.json'),bytes);
   console.log(JSON.stringify({done:true,trials:result.trials?.length,benchmark:result.benchmark}));
   res.end('saved');return;
  }
  res.statusCode=404;res.end('Not found');
 } catch(error) {
  res.statusCode=400;res.end('Invalid request');console.error(error.message);
 }
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:serverOrigin,directory,cases:cases.length})));
