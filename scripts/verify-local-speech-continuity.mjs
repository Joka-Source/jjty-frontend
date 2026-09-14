// Opt-in native local recognition continuity proof. Generated audio only.
// Requires an already installed en-US pack in the existing isolated profile.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import {readFile, writeFile} from 'node:fs/promises';

const area = path.resolve('../runtime/local-speech-proof');
const wav = (await readFile(path.join(area, 'reading.wav'))).toString('base64');
assert.equal((await fetch('http://127.0.0.1:5174/')).status, 200);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, userDataDir: path.join(area, 'chrome-profile'),
  args: ['--no-first-run', '--disable-audio-input'],
});
const report = {browser: await browser.version(), syntheticAudioOnly: true,
  inputRoute: 'generated-owned-stream', events: [], limits: 'Deliberate recognizer stop; no physical microphone, natural interruption, OS-wide network isolation, or lossless speech during restart proved.'};
const log = (type, value) => { report.events.push({at: Date.now(), type, value}); console.log(JSON.stringify({type, value})); };
try {
  const page = await browser.newPage();
  await page.exposeFunction('continuityEvent', log);
  await page.evaluateOnNewDocument(() => {
    // A prior interrupted proof may have persisted mic=on. Block acquisition
    // before application boot, until the generated stream is installed below.
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Synthetic input is not prepared'); };
    const Native = window.SpeechRecognition || window.webkitSpeechRecognition;
    window.continuityRecognizers = [];
    if (Native) window.SpeechRecognition = class extends Native {
      constructor() {
        super(); this.proofId = window.continuityRecognizers.push(this);
        for (const name of ['start', 'audiostart', 'audioend', 'end', 'error', 'result']) {
          this.addEventListener(name, event => window.continuityEvent(name, {
            id: this.proofId, local: this.processLocally,
            ...(name === 'result' ? {results: Array.from(event.results, r => ({text: r[0].transcript, final: r.isFinal}))} : {}),
            ...(name === 'error' ? {error: event.error} : {}),
          }));
        }
      }
      start(track) {
        if (!window.continuityProof || track !== window.continuityProof.track) throw new Error('Only the prepared synthetic track is allowed');
        this.proofTrack = track;
        return super.start(track);
      }
    };
  });
  await page.goto('http://127.0.0.1:5174/');
  await page.waitForFunction(() => window.__jtApp?.booted);
  assert.equal(await page.evaluate(() => SpeechRecognition.available({langs: ['en-US'], processLocally: true})), 'available', 'Existing local pack required; this script never installs one');
  if (await page.$eval('#view-welcome', n => !n.hidden)) {
    await page.locator('#welcome-next').click(); await page.locator('#welcome-skip').click();
  }
  await page.evaluate(() => window.__jtApp.showView('settings'));
  await page.select('#set-lang', 'en-US'); await page.select('#set-voice-processing', 'local');
  await page.evaluate(async () => {
    await window.__jtApp.addDocument('The northern orchard produces crisp apples every autumn.', `Synthetic continuity ${Date.now()}`);
    window.__jtApp.showView('read');
  });
  await page.evaluate(async b64 => {
    const ctx = new AudioContext({sampleRate: 16000}); await ctx.resume();
    const buffer = await ctx.decodeAudioData(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
    const dest = ctx.createMediaStreamDestination();
    const p = window.continuityProof = {ctx, dest, buffer, sources: [], acquisitions: 0, ended: 0};
    p.track = dest.stream.getAudioTracks()[0]; p.track.addEventListener('ended', () => p.ended++);
    p.play = () => {
      const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(dest);
      p.sources.push(source); source.start(ctx.currentTime + 0.25);
    };
    // Replaces acquisition before the app starts; no getUserMedia call reaches a device.
    navigator.mediaDevices.getUserMedia = async () => { p.acquisitions++; p.play(); return dest.stream; };
  }, wav);
  await page.setOfflineMode(true);
  log('network', 'CDP page offline emulation only');
  await page.locator('#voice-toggle').click();
  await page.waitForFunction(() => window.__jtApp.entries().filter(e => e.kind === 'act').length >= 1, {timeout: 45000});
  const acts = () => page.evaluate(() => window.__jtApp.entries().filter(e => e.kind === 'act'));
  const first = await acts(); assert.equal(first.length, 1);
  await page.evaluate(() => window.continuityRecognizers[0].stop());
  await page.waitForFunction(() => window.continuityRecognizers.length === 2 && window.continuityRecognizers[1].proofTrack, {timeout: 10000});
  const between = await page.evaluate(() => ({acquisitions: window.continuityProof.acquisitions,
    sameTrack: window.continuityRecognizers.every(r => r.proofTrack === window.continuityProof.track),
    readyState: window.continuityProof.track.readyState, ended: window.continuityProof.ended}));
  assert.deepEqual(between, {acquisitions: 1, sameTrack: true, readyState: 'live', ended: 0});
  assert.equal((await acts()).length, 1, 'Restart alone must not create another act');
  log('betweenUtterances', between);
  await page.evaluate(() => window.continuityProof.play());
  await page.waitForFunction(() => window.__jtApp.entries().filter(e => e.kind === 'act').length >= 2, {timeout: 45000});
  await page.locator('#voice-toggle').click();
  const finalActs = await acts(); assert.equal(finalActs.length, 2);
  for (const entry of finalActs) {
    assert.equal(entry.act, 'highlight'); assert.equal(entry.modality, 'voice');
    assert.equal(entry.anchor.quotedText, 'The northern orchard produces crisp apples every autumn');
    assert.ok(entry.receipt);
  }
  const final = await page.evaluate(() => ({acquisitions: window.continuityProof.acquisitions,
    recognizers: window.continuityRecognizers.length, readyState: window.continuityProof.track.readyState,
    button: document.querySelector('#voice-toggle').textContent}));
  assert.equal(final.acquisitions, 1); assert.equal(final.recognizers, 2); assert.equal(final.readyState, 'ended');
  assert.equal(final.button, 'resume listening');
  for (const id of [1, 2]) assert.ok(report.events.some(e => e.type === 'result' && e.value.id === id && e.value.local && e.value.results.some(r => r.final && /highlight this/i.test(r.text))), `Real final command from recognizer ${id}`);
  log('verified', {...final, acts: finalActs.length, uniqueActIds: new Set(finalActs.map(e => e.id)).size});
  report.result = 'PASS_LOCAL_SYNTHETIC_CONTINUITY';
} catch (error) {
  report.result = 'INCOMPLETE'; report.error = error.stack; process.exitCode = 1; log('failure', error.message);
} finally {
  for (const page of await browser.pages()) await page.evaluate(() => {
    const p = window.continuityProof;
    window.continuityRecognizers?.forEach(r => { try { r.abort(); } catch {} });
    if (p) { p.sources.forEach(s => { try { s.stop(); } catch {} }); p.dest.stream.getTracks().forEach(t => t.stop()); void p.ctx.close(); }
  }).catch(() => {});
  await writeFile(path.join(area, 'continuity-result.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
