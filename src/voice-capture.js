// Own one browser recognizer. Browser mode may use a remote service. Explicit
// local mode requires an installed language and processLocally support, with no
// remote fallback. Neither mode guarantees uninterrupted browser audio capture.
export function createVoiceCapture({ Recognition, lang, processingMode = 'browser', acquireAudio, onState, onInterim, onFinal,
  schedule = setTimeout, cancel = clearTimeout, retryLimit = 3 }) {
  let wanted = false, owner = null, generation = 0, timer = null, failures = 0;
  let inputStream = null, acquisition = null, removeEnded = null;
  const stoppedTracks = new WeakSet();
  function stopStream(stream) {
    for (const track of stream?.getTracks?.() ?? []) {
      if (stoppedTracks.has(track)) continue;
      stoppedTracks.add(track);
      try { track.stop(); } catch { /* Continue releasing remaining tracks. */ }
    }
  }
  function audioHeld() {
    try { return !!inputStream?.getAudioTracks?.().some(track => track.kind === 'audio' && track.readyState === 'live'); }
    catch { return false; }
  }
  const emit = (state, reason) => onState(state, reason, { audioHeld: audioHeld() });
  function release() {
    if (timer !== null) cancel(timer);
    timer = null;
    const old = owner; owner = null;
    try { old?.abort(); } catch { /* Already closed. */ }
    acquisition?.abort(); acquisition = null;
    removeEnded?.(); removeEnded = null;
    const stream = inputStream; inputStream = null; stopStream(stream);
  }
  function terminal(state, reason) {
    wanted = false; generation++; release(); emit(state, reason);
  }
  function prepare(session) {
    let rec;
    try {
      rec = new Recognition(); owner = rec;
      rec.continuous = true; rec.interimResults = true;
      rec.lang = session.lang;
      if (session.mode === 'local') {
        if (!('processLocally' in rec)) { terminal('error', 'local-unsupported'); return; }
        rec.processLocally = true;
        if (rec.processLocally !== true) { terminal('error', 'local-unsupported'); return; }
      }
    } catch { terminal('error', 'setup-failed'); return; }
    return rec;
  }
  function launch(version, session, prepared) {
    if (!wanted || version !== generation) return;
    const rec = prepared ?? prepare(session);
    if (!rec) return;
    let finalized = 0, error = null;
    const current = () => wanted && version === generation && owner === rec;
    rec.onstart = () => { if (current()) emit('listening'); };
    rec.onresult = event => {
      if (!current()) return;
      const results = event.results;
      let full = '';
      for (const result of results) full += `${result[0].transcript} `;
      if (full.trim()) onInterim(full, results[results.length - 1]?.[0]?.transcript ?? '');
      for (let i = finalized; i < results.length; i++) {
        if (!current()) return;
        if (results[i].isFinal) {
          finalized = i + 1;
          const text = results[i][0].transcript;
          // Only newly finalized speech proves recovery. Empty events or endless
          // interim hypotheses must not replenish a failing session's retry budget.
          if (text.trim()) { failures = 0; onFinal(text); }
        }
      }
    };
    rec.onerror = event => {
      if (!current()) return;
      error = event.error;
      if (['not-allowed', 'service-not-allowed'].includes(error)) terminal('denied', error);
      else if (!['no-speech', 'network'].includes(error)) terminal('error', error);
    };
    rec.onend = () => {
      if (!current()) return;
      owner = null;
      if (++failures > retryLimit) { terminal('error', error ?? 'repeated-end'); return; }
      emit('reconnecting', error);
      if (!wanted || version !== generation) return;
      timer = schedule(() => { timer = null; launch(version, session); }, Math.min(500 * 2 ** (failures - 1), 4000));
    };
    try {
      if (session.mode === 'local') {
        if (session.track?.kind !== 'audio' || session.track.readyState !== 'live') {
          terminal('error', 'audio-capture'); return;
        }
        rec.start(session.track);
      } else rec.start();
    } catch { terminal('error', session.mode === 'local' ? 'local-track-start-failed' : 'start-failed'); }
  }
  return {
    start() {
      if (wanted) return;
      if (!Recognition) { emit('unavailable'); return; }
      wanted = true; failures = 0; const version = ++generation;
      emit('starting');
      if (!wanted || version !== generation) return;
      let session;
      try {
        session = { lang: typeof lang === 'function' ? lang() : lang,
          mode: typeof processingMode === 'function' ? processingMode() : processingMode };
      } catch { terminal('error', 'setup-failed'); return; }
      if (session.mode === 'browser') { launch(version, session); return; }
      if (session.mode !== 'local') { terminal('error', 'invalid-processing-mode'); return; }
      if (typeof Recognition.available !== 'function') { terminal('error', 'local-unsupported'); return; }
      // Availability checks never install a language pack or permit fallback.
      return (async () => {
        let availability;
        try { availability = await Recognition.available({ langs: [session.lang], processLocally: true }); }
        catch { if (wanted && version === generation) terminal('error', 'local-probe-failed'); return; }
        if (!wanted || version !== generation) return;
        if (availability !== 'available') {
          terminal('error', availability === 'downloadable' || availability === 'downloading'
            ? 'local-download-required' : 'local-unavailable');
          return;
        }
        if (typeof acquireAudio !== 'function') { terminal('error', 'local-audio-unsupported'); return; }
        const prepared = prepare(session);
        if (!prepared) return;
        const controller = new AbortController(); acquisition = controller;
        let stream;
        try { stream = await acquireAudio({ signal: controller.signal }); }
        catch (error) {
          if (wanted && version === generation) terminal(error?.name === 'NotAllowedError' ? 'denied' : 'error', 'audio-capture');
          return;
        }
        if (!wanted || version !== generation) { stopStream(stream); return; }
        acquisition = null; inputStream = stream;
        try {
          session.track = stream?.getAudioTracks?.().find(track => track.kind === 'audio' && track.readyState === 'live');
          if (!session.track || typeof session.track.addEventListener !== 'function') {
            terminal('error', 'audio-capture'); return;
          }
          const ended = () => { if (wanted && version === generation) terminal('error', 'audio-capture'); };
          session.track.addEventListener('ended', ended);
          removeEnded = () => session.track.removeEventListener('ended', ended);
        } catch { terminal('error', 'audio-capture'); return; }
        emit('starting');
        launch(version, session, prepared);
      })();
    },
    pause() { terminal('paused'); },
    dispose() { wanted = false; generation++; release(); },
  };
}
