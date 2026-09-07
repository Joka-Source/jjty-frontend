// Own one browser recognizer. Browser mode may use a remote service. Explicit
// local mode requires an installed language and processLocally support, with no
// remote fallback. Neither mode guarantees uninterrupted browser audio capture.
export function createVoiceCapture({ Recognition, lang, processingMode = 'browser', onState, onInterim, onFinal,
  schedule = setTimeout, cancel = clearTimeout, retryLimit = 3 }) {
  let wanted = false, owner = null, generation = 0, timer = null, failures = 0;
  const emit = (state, reason) => onState(state, reason);
  function release() {
    if (timer !== null) cancel(timer);
    timer = null;
    const old = owner; owner = null;
    try { old?.abort(); } catch { /* Already closed. */ }
  }
  function terminal(state, reason) {
    wanted = false; generation++; release(); emit(state, reason);
  }
  function launch(version, session) {
    if (!wanted || version !== generation) return;
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
    let finalized = 0, error = null;
    const current = () => wanted && version === generation && owner === rec;
    rec.onstart = () => { if (current()) emit('listening'); };
    rec.onresult = event => {
      if (!current()) return;
      // Useful results, rather than an onstart/onend loop, prove recovery.
      failures = 0;
      const results = event.results;
      let full = '';
      for (const result of results) full += `${result[0].transcript} `;
      onInterim(full, results[results.length - 1]?.[0]?.transcript ?? '');
      for (let i = finalized; i < results.length; i++) {
        if (!current()) return;
        if (results[i].isFinal) { finalized = i + 1; onFinal(results[i][0].transcript); }
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
      timer = schedule(() => { timer = null; launch(version, session); }, Math.min(500 * 2 ** (failures - 1), 4000));
    };
    try { rec.start(); } catch { terminal('error', 'start-failed'); }
  }
  return {
    start() {
      if (wanted) return;
      if (!Recognition) { emit('unavailable'); return; }
      wanted = true; failures = 0; const version = ++generation;
      emit('starting');
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
        launch(version, session);
      })();
    },
    pause() { terminal('paused'); },
    dispose() { wanted = false; generation++; release(); },
  };
}
