// Shared logic for every letter-template page (resignation, retirement
// notice, PTO request, etc.) — purely client-side, nothing typed here is
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

    // Clear the placeholder text outright as soon as the field is clicked,
    // rather than making the visitor select and delete it first.
    field.addEventListener('focus', () => {
      if(field.textContent === field.dataset.placeholder){
        field.textContent = '';
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
    // Built directly from each <p>, not letter.innerText: innerText leaves
    // a stray non-breaking space behind for every blank "&nbsp;" spacer
    // paragraph, which breaks any attempt to control exactly how many
    // blank lines appear between two lines (needed since some gaps in
    // this letter intentionally have more than others).
    const lines = [...letter.children].map(p => p.textContent.replace(/ /g, '').trim());
    return lines.join('\n').replace(/^\n+|\n+$/g, '');
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Prints from a hidden iframe holding only the letter, with its own
  // fixed page styles, so the result never depends on the site's layout,
  // window width, banners or widgets (printing the live page let Chrome
  // shrink everything to fit whatever was overflowing). Same look as the
  // .doc download: Times New Roman 12pt, 1.5 line-height, 1in margins plus
  // 0.75in extra at the top for letterhead. The page margin is 0 (the 1in
  // comes from a repeating table header/footer + cell padding) because
  // browsers only print their URL/date/page-number lines inside a page
  // margin, so a zero @page margin keeps those off the paper.
  function doPrint(){
    const lines = getLetterText().split('\n').map(line => escapeHtml(line) || '&nbsp;');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title>
<style>
@page{ size:letter; margin:0; }
html,body{ margin:0; padding:0; background:#fff; }
body{ font-family:"Times New Roman",Times,serif; font-size:12pt; line-height:1.5; color:#000; }
table{ width:100%; border-collapse:collapse; }
td{ padding:0 1in; }
thead td, tfoot td{ height:1in; padding:0; }
p{ margin:0; white-space:pre-wrap; }
p:first-child{ padding-top:0.75in; }
</style></head><body><table><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>${lines.map(l => '<p>' + l + '</p>').join('')}</td></tr></tbody></table></body></html>`;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const cleanup = () => setTimeout(() => frame.remove(), 500);
    frame.contentWindow.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (e) { frame.remove(); window.print(); }
    }, 100);
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
    // Same page setup as Print: Word ignores <body> margins in HTML, so the
    // 1in margins go in a named @page section, with 0.75in extra at the top
    // (letterhead) on the first paragraph.
    const lines = getLetterText().split('\n').map(line => escapeHtml(line) || '&nbsp;');
    const para = (l, i) => '<p style="margin:0;font-family:\'Times New Roman\',Times,serif;font-size:12pt;line-height:150%;' + (i === 0 ? 'margin-top:0.75in;' : '') + '">' + l + '</p>';
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1{ size:8.5in 11in; margin:1in 1in 1in 1in; mso-header-margin:0.5in; mso-footer-margin:0.5in; }
div.WordSection1{ page:WordSection1; }
body{ margin:0; font-family:'Times New Roman',Times,serif; font-size:12pt; }
</style></head><body><div class="WordSection1">${lines.map(para).join('')}</div></body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = letter.dataset.filename || 'Letter.doc';
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
