(() => {
  const log = (window.__tts = []); window.__overlap = [];
  const pending = new Set();
  const synth = window.speechSynthesis;
  const dur = (u) => (window.__ttsMs ?? 300) + (u.text || '').length * (window.__ttsPerChar ?? 25);
  synth.speak = (u) => {
    if (pending.size > 0) window.__overlap.push(u.text); // 再生中に別の発話＝ループ二重化の兆候
    log.push({text: u.text, rate: u.rate, pitch: u.pitch, lang: u.lang, t: Date.now()});
    const entry = {u, timer: setTimeout(() => { pending.delete(entry); u.dispatchEvent(new SpeechSynthesisEvent('end', {utterance: u})); }, dur(u))};
    pending.add(entry);
    setTimeout(() => u.dispatchEvent(new SpeechSynthesisEvent('start', {utterance: u})), 5);
  };
  synth.cancel = () => {
    for (const e of [...pending]) { clearTimeout(e.timer); pending.delete(e);
      e.u.dispatchEvent(new SpeechSynthesisErrorEvent('error', {utterance: e.u, error: 'interrupted'})); }
  };
})();
