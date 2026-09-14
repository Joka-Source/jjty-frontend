// Local speech assets are checked or downloaded only through explicit controls.
export function initVoiceSettings({settings, pause, Recognition}) {
  const $=id=>document.getElementById(id);
  const mode=$('set-voice-processing'), detail=$('set-voice-processing-detail');
  const check=$('set-local-voice-check'), install=$('set-local-voice-install'), status=$('set-local-voice-status');
  let generation=0, busy=false, availability=null;
  const supported=()=>!!Recognition && typeof Recognition.available==='function' && 'processLocally' in Recognition.prototype;
  function render() {
    mode.value=settings.voiceProcessing;
    const local=settings.voiceProcessing==='local';
    detail.textContent=local ? 'Audio must be processed on this device. If this language is unavailable, voice stays off; it will not switch to a remote service.' : 'Your browser may send audio to its speech service. JETT does not save recordings. Choose on-device only to require local processing.';
    check.hidden=!local; check.disabled=busy;
    install.hidden=!local || availability!=='downloadable' || typeof Recognition?.install!=='function';
    install.disabled=busy;
  }
  function invalidate() { generation++;busy=false;availability=null;status.textContent='';render(); }
  mode.addEventListener('change',()=>{pause();settings.set('voiceProcessing',mode.value);invalidate();});
  const messages={available:'This language is ready for on-device voice.',downloadable:'This language needs a download before on-device voice can start.',downloading:'The browser is downloading this language. Check again when it finishes.',unavailable:'This language is not available for on-device voice in this browser.'};
  async function probe(version) {
    const state=await Recognition.available({langs:[settings.lang],processLocally:true});
    if(version!==generation)return;
    availability=state;status.textContent=messages[state] || 'The browser did not report a usable on-device language.';
  }
  check.addEventListener('click',async()=>{
    if(busy)return;
    if(!supported()){availability=null;status.textContent='This browser does not expose on-device speech. Voice stays off in on-device mode.';render();return;}
    const version=generation;busy=true;status.textContent='Checking this language on your device…';render();
    try { await probe(version); }
    catch { if(version===generation){availability=null;status.textContent='The browser could not check this language. No audio was captured.';} }
    finally { if(version===generation){busy=false;render();} }
  });
  install.addEventListener('click',async()=>{
    if(busy || availability!=='downloadable' || settings.voiceProcessing!=='local')return;
    const version=generation, lang=settings.lang;busy=true;status.textContent='Downloading the browser’s speech language pack. The microphone remains off.';pause();render();
    try {
      // Keep install directly in the click handler's activation, before awaits.
      const installed=await Recognition.install({langs:[lang],processLocally:true});
      if(version!==generation)return;
      if(installed)await probe(version);
      else status.textContent='The language download did not finish. You can try again.';
    } catch { if(version===generation)status.textContent='The browser could not download this language. Voice remains off.'; }
    finally { if(version===generation){busy=false;render();} }
  });
  render();
  return {render, languageChanged(){pause();invalidate();}};
}
