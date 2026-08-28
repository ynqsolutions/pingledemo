// Resignation letter template: purely client-side, nothing typed here is
// ever sent anywhere or persisted (no localStorage/sessionStorage) — a
// refresh or navigating away clears it completely, by design.
(function(){
  const letter = document.getElementById('tplLetter');
  if(!letter) return;

  const fields = letter.querySelectorAll('.letter-field');

  function syncFilledState(field){
    const text = field.textContent.trim();
    field.classList.toggle('is-filled', text !== '' && text !== field.dataset.placeholder);
  }

  fields.forEach(field => {
    syncFilledState(field);

    // Selecting all placeholder text on focus means the first keystroke
    // replaces it outright, rather than the visitor having to select it.
    field.addEventListener('focus', () => {
      if(field.textContent === field.dataset.placeholder){
        const range = document.createRange();
        range.selectNodeContents(field);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    field.addEventListener('input', () => syncFilledState(field));

    field.addEventListener('blur', () => {
      if(field.textContent.trim() === ''){
        field.textContent = field.dataset.placeholder;
      }
      syncFilledState(field);
    });

    // Force plain-text paste so a visitor pasting from Word/Google Docs
    // can't drag in rich formatting that would break the paper's layout
    // or print/copy output.
    field.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  });

  function getLetterText(){
    return letter.innerText.replace(/\n{3,}/g, '\n\n').trim();
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function doPrint(){
    window.print();
  }

  const copyBtn = document.getElementById('tplCopyBtn');
  function doCopy(){
    const text = getLetterText();
    navigator.clipboard.writeText(text).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = original; }, 1800);
    }).catch(() => {
      alert('Could not copy automatically. Select the letter text on the page and copy it manually instead.');
    });
  }

  function doDownload(){
    const lines = getLetterText().split('\n').map(line => escapeHtml(line) || '&nbsp;');
    const html = `<html><head><meta charset="utf-8"></head><body style="font-family:'Courier New',Courier,monospace; font-size:12.5pt; line-height:1.8;">${lines.join('<br>')}</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Resignation-Letter.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- Disclaimer gate: Print, Copy, and Download all route through the
  // same confirmation modal so a visitor can't miss the "not legal advice"
  // notice on the way out the door. ----
  const modal = document.getElementById('tplModal');
  const modalContinue = document.getElementById('tplModalContinue');
  const modalCancel = document.getElementById('tplModalCancel');
  let pendingAction = null;

  function openModal(action){
    pendingAction = action;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    pendingAction = null;
  }

  modalCancel.addEventListener('click', closeModal);
  modal.querySelector('.tpl-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  modalContinue.addEventListener('click', () => {
    const action = pendingAction;
    closeModal();
    if(action === 'print') doPrint();
    else if(action === 'copy') doCopy();
    else if(action === 'download') doDownload();
  });

  document.getElementById('tplPrintBtn').addEventListener('click', () => openModal('print'));
  copyBtn.addEventListener('click', () => openModal('copy'));
  document.getElementById('tplDownloadBtn').addEventListener('click', () => openModal('download'));
})();
