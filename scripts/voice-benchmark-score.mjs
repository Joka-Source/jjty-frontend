// Pure scoring: actual application parser, never an action executor or ASR model.
// CLI: node scripts/voice-benchmark-score.mjs results.json > score.json
// Input envelope: {trials:[...], benchmark:{availability,done,error?}}.
// Missing metadata is reported as unknown; zero trials is explicitly no-data.
import {IntentStream, toCommand} from '../src/intents.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function normalizeVoiceText(text) {
  return text.normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}
function parsed(text) {
  return new IntentStream().push({text, final:true}).map(toCommand);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
function intent(command) {
  // Recognition evidence and classifier confidence are not command semantics.
  return stable(Object.fromEntries(Object.entries(command).filter(([key])=>!['evidence','confidence'].includes(key))));
}
const actionable = command => !['reading','ask'].includes(command.type);
function summarize(rows) {
  return {
    trials:rows.length,
    recognitionErrors:rows.filter(r=>r.recognitionError).length,
    incompleteRecognitionTrials:rows.filter(r=>r.finalized===false).length,
    normalizedTextMatches:rows.filter(r=>r.normalizedTextMatch).length,
    commandTrials:rows.filter(r=>r.kind==='command').length,
    supportedCommandTrials:rows.filter(r=>r.commandExpectationSupported).length,
    commandIntentMatches:rows.filter(r=>r.commandIntentMatch===true).length,
    unsupportedCommandExpectations:rows.filter(r=>r.kind==='command'&&!r.commandExpectationSupported).length,
    noncommandTrials:rows.filter(r=>r.kind!=='command').length,
    falseCommandRiskTrials:rows.filter(r=>r.falseCommandRisk).length,
    ambiguousTrials:rows.filter(r=>r.ambiguous).length,
  };
}

/** Trials may carry condition/id/timing metadata. Transcript defaults to finalized
 * ASR text; interim-only output must explicitly set finalized:false.
 * Command matching is parser-only: no target, authorization or saved act proved.
 */
export function scoreVoiceTrials(trials) {
  if (!Array.isArray(trials)) throw new TypeError('Trials must be an array');
  const rows=trials.map((trial,index)=>{
    if (!trial || typeof trial.expectedText!=='string' || !['command','control','reading'].includes(trial.kind)
      || (trial.transcript!=null&&typeof trial.transcript!=='string')
      || (trial.finalized!==undefined&&typeof trial.finalized!=='boolean')
      || (trial.condition!=null&&typeof trial.condition!=='string')) throw new TypeError(`Invalid trial ${index}`);
    const transcript=trial.transcript??'', expected=parsed(trial.expectedText), observed=parsed(transcript);
    const expectedCommands=expected.filter(actionable).map(intent), recognizedCommands=observed.filter(actionable).map(intent);
    const ambiguous=observed.some(c=>c.type==='ask');
    const recognitionError=trial.error!=null&&trial.error!==false&&trial.error!=='';
    const completed=!recognitionError&&trial.finalized!==false;
    const commandExpectationSupported=trial.kind==='command'&&expectedCommands.length>0&&!expected.some(c=>c.type==='ask');
    return {...trial,transcript,trialIndex:index,condition:trial.condition??'unlabelled',
      recognitionError,normalizedTextMatch:completed&&normalizeVoiceText(transcript)===normalizeVoiceText(trial.expectedText),
      expectedCommands,recognizedCommands,ambiguous,commandExpectationSupported,
      commandIntentMatch:commandExpectationSupported
        ? completed&&!ambiguous&&JSON.stringify(recognizedCommands)===JSON.stringify(expectedCommands) : null,
      falseCommandRisk:trial.kind!=='command'&&recognizedCommands.length>0,
    };
  });
  const conditions=[...new Set(rows.map(r=>r.condition))];
  return {scope:'Parser-level recognition benchmark; no application target, mutation, or physical-microphone success is established.',
    summary:summarize(rows),byCondition:Object.fromEntries(conditions.map(condition=>[condition,summarize(rows.filter(r=>r.condition===condition))])),trials:rows};
}

export function scoreBenchmarkResults(payload) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload) || !Array.isArray(payload.trials))
    throw new TypeError('Result payload must contain a trials array');
  const metadata=payload.benchmark??{};
  if (typeof metadata!=='object'||Array.isArray(metadata)
    || (metadata.done!==undefined&&typeof metadata.done!=='boolean')
    || (metadata.availability!=null&&typeof metadata.availability!=='string')
    || (metadata.error!=null&&typeof metadata.error!=='string')) throw new TypeError('Invalid benchmark metadata');
  const scored=scoreVoiceTrials(payload.trials);
  return {...scored,
    dataStatus:payload.trials.length?'trials-recorded':'no-data',
    benchmark:{availability:metadata.availability??null,done:metadata.done??null,error:metadata.error??null},
    interpretation:payload.trials.length
      ? 'Counts describe recorded trials only; benchmark completion and availability are reported separately.'
      : 'No recognition trials recorded. Zero counts are not evidence of recognition success or safety.',
  };
}

// Imports never read files, print, or score process arguments.
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length!==3) throw new Error('Usage: node scripts/voice-benchmark-score.mjs results.json > score.json');
    const {readFile}=await import('node:fs/promises');
    const payload=JSON.parse(await readFile(process.argv[2],'utf8'));
    process.stdout.write(JSON.stringify(scoreBenchmarkResults(payload),null,2)+'\n');
  } catch (error) {
    process.stderr.write(`Voice benchmark scoring failed: ${error.message}\n`);
    process.exitCode=1;
  }
}
