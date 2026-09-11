/** Portable companion behavior. Host actions own document mutations and permission. */
export function installCompanion(host) {
  const button = document.createElement('button');
  button.className = 'jjty-companion';
  button.id = 'jjty-helper';
  button.setAttribute('aria-label', 'JJTY workspace helper');
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = '<span class="jjty-water" aria-hidden="true"></span><span>JJTY</span>';
  document.body.append(button);
  const lessons = [
    ['A place for your thinking', 'Create a notebook or import a PDF. Documents stay in this browser; export a backup to keep an independent copy.'],
    ['Write, then make it yours', 'Open a notebook. Choose Pen to write, Text to add words, or Read to scroll without marking. Undo reverses your last edit.'],
    ['Let your voice find the place', 'Open Voice cursor and choose Try words for a microphone-free practice. Read a phrase already in your notebook. Multiple matches let you choose; nothing is guessed.'],
    ['Keep the result', 'Highlight a matched text item, or keep writing. Export creates a copy; the editable notebook stays here. Check the saved message before closing.'],
  ];
  function teach(index = 0) {
    host.panel('Getting started', `<div class="jjty-lesson"><div class="lesson-water" aria-hidden="true">${index + 1}</div><p class="lesson-progress">${index + 1} of ${lessons.length}</p><h3>${lessons[index][0]}</h3><p>${lessons[index][1]}</p><div class="lesson-navigation"><button data-back ${index === 0 ? 'disabled' : ''}>Back</button><button data-next>${index === lessons.length - 1 ? 'Done' : 'Next'}</button></div></div>`);
    host.dialog.querySelector('[data-back]').onclick = () => { host.dialog.close(); teach(index - 1); };
    host.dialog.querySelector('[data-next]').onclick = () => { host.dialog.close(); if (index < lessons.length - 1) teach(index + 1); else button.focus(); };
  }
  button.onclick = () => {
    const editor = host.inEditor();
    host.panel('Your workspace', `<p class="dialog-intro">${editor ? 'Keep your place. Choose what comes next.' : 'Start something or learn your way around.'}</p><div class="menu-actions"><button data-helper="create">Create or import<small>Start with paper or a PDF</small></button><button data-helper="guide">Getting started<small>A four-step guide you can replay</small></button>${editor ? '<button data-helper="voice">Voice cursor<small>Find a phrase, then highlight it</small></button><button data-helper="export">Export notebook<small>Keep an independent copy</small></button>' : ''}<button data-helper="settings">Workspace settings<small>Paper, spacing and reduced motion</small></button></div>`);
    host.dialog.querySelectorAll('[data-helper]').forEach(control => {
      control.onclick = () => {
        host.dialog.close();
        if (control.dataset.helper === 'guide') teach();
        else host[control.dataset.helper]();
      };
    });
  };
  // One bounded ripple per press. Never animate the writing surface or persist coordinates.
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest('button');
    if (!target || target.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce') return;
    const ripple = document.createElement('span');
    ripple.className = 'jjty-ripple';
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    document.body.append(ripple);
    setTimeout(() => ripple.remove(), 550);
  }, { passive: true });
}
