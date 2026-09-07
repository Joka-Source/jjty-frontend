// Own one browser recognizer. Browser speech may use a remote service; this
// adapter does not claim local transcription or an uninterrupted audio stream.
export function createVoiceCapture({ Recognition, lang, onState, onInterim, onFinal,
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
  function launch(version) {
    if (!wanted || version !== generation) return;
    let rec;
    try {
      rec = new Recognition(); owner = rec;
      rec.continuous = true; rec.interimResults = true;
      rec.lang = typeof lang === 'function' ? lang() : lang;
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
      timer = schedule(() => { timer = null; launch(version); }, Math.min(500 * 2 ** (failures - 1), 4000));
    };
    try { rec.start(); } catch { terminal('error', 'start-failed'); }
  }
  return {
    start() {
      if (wanted) return;
      if (!Recognition) { emit('unavailable'); return; }
      wanted = true; failures = 0; const version = ++generation;
      emit('starting'); launch(version);
    },
    pause() { terminal('paused'); },
    dispose() { wanted = false; generation++; release(); },
  };
}
