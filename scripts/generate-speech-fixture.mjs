// Generates a known spoken passage locally; does not record any microphone.
import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const area=path.resolve('../runtime/local-speech-proof');
await mkdir(area,{recursive:true});
execFileSync('/usr/bin/say',['-v','Samantha','-r','140','-o',path.join(area,'reading.aiff'),'The northern orchard produces crisp apples every autumn. Highlight this.']);
execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-i',path.join(area,'reading.aiff'),'-af','adelay=3000|3000,apad=pad_dur=5','-ar','16000','-ac','1',path.join(area,'reading.wav')]);
console.log('Generated synthetic local-speech fixture. No microphone was opened.');
