// Own one browser recognizer. Browser mode may use a remote service. Explicit
// local mode requires an installed language and processLocally support, with no
// remote fallback. Neither mode guarantees uninterrupted browser audio capture.
const LOCAL_ENGLISH_HINTS = Object.freeze(['highlight this', 'start highlighting', 'end highlighting', 'stop highlighting']);

export function createVoiceCapture({ Recognition, SpeechRecognitionPhrase = globalThis.SpeechRecognitionPhrase, lang, processingMode = 'browser', acquireAudio, onState, onInterim, onFinal,
  schedule = setTimeout, cancel = clearTimeout, retryLimit = 3 }) {
  let wanted = false, owner = null, generation = 0, timer = null, failures = 0;
  let inputStream = null, acquisition = null, removeEnded = null;
  let speechDeadline = null;
  const hintedRecognizers = new WeakSet();
  function clearSpeechDeadline() {
    if (speechDeadline !== null) cancel(speechDeadline);
    speechDeadline = null;
  }
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
    clearSpeechDeadline();
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
    if (session.mode === 'local' && typeof session.lang === 'string' && /^en(?:-|$)/i.test(session.lang)
      && !session.hintsDisabled && typeof SpeechRecognitionPhrase === 'function' && 'phrases' in rec) {
      try {
        rec.phrases = LOCAL_ENGLISH_HINTS.map(phrase => new SpeechRecognitionPhrase(phrase, 2));
        hintedRecognizers.add(rec);
      } catch {
        // Hints are optional. Replace even a partially configured recognizer,
        // preserving the session and any owned input track without reopening it.
        session.hintsDisabled = true;
        owner = null;
        try { rec.abort(); } catch { /* No capture has started on this instance. */ }
        return prepare(session);
      }
    }
    return rec;
  }
  function launch(version, session, prepared) {
    if (!wanted || version !== generation) return;
    const rec = prepared ?? prepare(session);
    if (!rec) return;
    let finalized = 0, error = null;
    const current = () => wanted && version === generation && owner === rec;
    rec.onstart = () => { if (current()) emit('listening'); };
    rec.onspeechstart = () => {
      if (!current() || speechDeadline !== null) return;
      // Audio activity is not proof that the recognizer is producing words.
      // Do not leave a live microphone behind a permanently optimistic label.
      const deadline = schedule(() => {
        if (!current() || speechDeadline !== deadline) return;
        speechDeadline = null;
        terminal('error', 'recognition-no-results');
      }, 20000);
      speechDeadline = deadline;
    };
    rec.onresult = event => {
      if (!current()) return;
      const results = event.results;
      let full = '';
      for (let i = 0; i < results.length; i++) {
        if (!current()) return;
        const text = results[i][0].transcript;
        full += `${text} `;
        if (results[i].isFinal && i >= finalized) {
          finalized = i + 1;
          if (text.trim()) {
            clearSpeechDeadline();
            // Match each new final against its own evidence before dispatching
            // it. A later command in the same browser event must not hide the
            // preceding reading segment from the application's target checks.
            onInterim(full, text);
            if (!current()) return;
            // Only new final speech replenishes the bounded recovery budget.
            failures = 0;
            onFinal(text);
          }
        }
      }
      if (!current()) return;
      const latest = results[results.length - 1];
      if (latest && !latest.isFinal && latest[0].transcript.trim()) {
        clearSpeechDeadline();
        onInterim(full, latest[0].transcript);
      }
    };
    rec.onerror = event => {
      if (!current()) return;
      error = event.error;
      if (error === 'phrases-not-supported' && session.mode === 'local'
        && hintedRecognizers.has(rec) && !session.hintsDisabled) {
        // The normal bounded onend recovery owns this single retry. Subsequent
        // recognizers get no hints; a repeated rejection becomes terminal.
        session.hintsDisabled = true;
        return;
      }
      if (['not-allowed', 'service-not-allowed'].includes(error)) terminal('denied', error);
      else if (!['no-speech', 'network'].includes(error)) terminal('error', error);
    };
    rec.onend = () => {
      if (!current()) return;
      clearSpeechDeadline();
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
