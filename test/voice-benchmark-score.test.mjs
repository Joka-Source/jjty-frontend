import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreVoiceTrials,normalizeVoiceText} from '../scripts/voice-benchmark-score.mjs';
import {scoreBenchmarkResults} from '../scripts/voice-benchmark-score.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('normalization ignores punctuation/case but retains different words and Unicode',()=>{
  assert.equal(normalizeVoiceText('Please, HIGHLIGHT this!'),'please highlight this');
  assert.equal(normalizeVoiceText('नमस्ते café'),'नमस्ते café');
  assert.notEqual(normalizeVoiceText('highlight this'),normalizeVoiceText('I like this'));
});
test('real parser distinguishes intent equality from transcription equality',()=>{
  const result=scoreVoiceTrials([{kind:'command',expectedText:'please highlight this',transcript:'Highlight this.',condition:'off'},
    {kind:'command',expectedText:'highlight this',transcript:'I like this',condition:'boost2'}]);
  assert.equal(result.trials[0].normalizedTextMatch,false);
  assert.equal(result.trials[0].commandIntentMatch,true);
  assert.equal(result.trials[0].recognizedCommands[0].act,'highlight');
  assert.equal(result.trials[1].commandIntentMatch,false);
  assert.deepEqual(result.trials[1].recognizedCommands,[]);
  assert.equal(result.byCondition.off.commandIntentMatches,1);
  assert.equal(result.byCondition.boost2.commandIntentMatches,0);
});
test('ordinary speech remains no-op, but ASR command substitution is reported as risk',()=>{
  const result=scoreVoiceTrials([
    {kind:'control',expectedText:'I like this',transcript:'I like this'},
    {kind:'control',expectedText:'and highlighting',transcript:'and highlighting'},
    {kind:'reading',expectedText:'Until repairs are complete rent remains due',transcript:'Until repairs are complete rent remains due'},
    {kind:'control',expectedText:'I like this',transcript:'highlight this'},
  ]);
  assert.deepEqual(result.trials.map(r=>r.falseCommandRisk),[false,false,false,true]);
  assert.equal(result.summary.falseCommandRiskTrials,1);
  assert.equal(result.summary.commandTrials,0);
});
test('unsupported staged phrases and recognition errors cannot be counted as command successes',()=>{
  const result=scoreVoiceTrials([
    {kind:'command',expectedText:'end highlighting',transcript:'end highlighting'},
    {kind:'command',expectedText:'highlight this',transcript:'highlight this',error:'audio-capture'},
  ]);
  assert.equal(result.trials[0].normalizedTextMatch,true);
  assert.equal(result.trials[0].commandIntentMatch,null);
  assert.equal(result.summary.unsupportedCommandExpectations,1);
  assert.equal(result.trials[1].normalizedTextMatch,false);
  assert.equal(result.trials[1].commandIntentMatch,false);
  assert.equal(result.summary.recognitionErrors,1);
});
test('different command arguments and extra commands fail exact intent comparison without changing inputs',()=>{
  const trials=[{kind:'command',expectedText:'add a note check source',transcript:'add a note different words'},
    {kind:'command',expectedText:'highlight this',transcript:'highlight this. undo'}];
  const before=structuredClone(trials),result=scoreVoiceTrials(trials);
  assert.deepEqual(result.trials.map(r=>r.commandIntentMatch),[false,false]);
  assert.deepEqual(trials,before);
  assert.throws(()=>scoreVoiceTrials([{kind:'control',expectedText:'a',transcript:42}]),/Invalid trial/);
});

test('interim-only transcripts cannot count as successes but retain false-command risk',()=>{
  const result=scoreVoiceTrials([
    {kind:'command',expectedText:'highlight this',transcript:'highlight this',finalized:false},
    {kind:'control',expectedText:'I like this',transcript:'highlight this',finalized:false},
    {kind:'command',expectedText:'highlight this',transcript:'highlight this',finalized:true},
    {kind:'command',expectedText:'highlight this',transcript:'highlight this'},
  ]);
  assert.equal(result.summary.incompleteRecognitionTrials,2);
  assert.equal(result.trials[0].normalizedTextMatch,false);
  assert.equal(result.trials[0].commandIntentMatch,false);
  assert.equal(result.trials[1].falseCommandRisk,true);
  assert.equal(result.trials[1].recognizedCommands[0].act,'highlight');
  assert.deepEqual(result.trials.slice(2).map(r=>r.commandIntentMatch),[true,true]);
  assert.equal(result.summary.normalizedTextMatches,2);
  assert.throws(()=>scoreVoiceTrials([{kind:'command',expectedText:'undo',transcript:'undo',finalized:'false'}]),/Invalid trial/);
});

test('result envelopes report unavailable/no-data separately from completed recorded trials',()=>{
  const empty=scoreBenchmarkResults({trials:[],benchmark:{availability:'downloadable',done:false,error:'No local pack'}});
  assert.equal(empty.dataStatus,'no-data');
  assert.deepEqual(empty.benchmark,{availability:'downloadable',done:false,error:'No local pack'});
  assert.match(empty.interpretation,/not evidence/);
  const unknown=scoreBenchmarkResults({trials:[]});assert.equal(unknown.benchmark.done,null);assert.equal(unknown.benchmark.availability,null);
  const recorded=scoreBenchmarkResults({trials:[{kind:'command',expectedText:'undo',transcript:'undo'}],benchmark:{availability:'available',done:true}});
  assert.equal(recorded.dataStatus,'trials-recorded');assert.equal(recorded.summary.commandIntentMatches,1);assert.equal(recorded.benchmark.done,true);
  assert.throws(()=>scoreBenchmarkResults({trials:{}}),/trials array/);
  assert.throws(()=>scoreBenchmarkResults({trials:[],benchmark:{done:'true'}}),/metadata/);
});

test('CLI writes valid JSON, fails malformed payloads, and importing performs no CLI work',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'jett-voice-score-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const script=fileURLToPath(new URL('../scripts/voice-benchmark-score.mjs',import.meta.url));
  const file=path.join(directory,'results.json');await writeFile(file,JSON.stringify({trials:[],benchmark:{done:false,availability:'unavailable'}}));
  const run=spawnSync(process.execPath,[script,file],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).dataStatus,'no-data');
  await writeFile(file,'{"trials":{}}');const invalid=spawnSync(process.execPath,[script,file],{encoding:'utf8'});assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');assert.match(invalid.stderr,/trials array/);
  const imported=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../scripts/voice-benchmark-score.mjs',import.meta.url).href)});`,'does-not-exist.json'],{encoding:'utf8'});
  assert.equal(imported.status,0,imported.stderr);assert.equal(imported.stdout,'');assert.equal(imported.stderr,'');
});
