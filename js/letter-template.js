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
  // ---- Phones: build a real PDF instead of printing the page. iOS/Android
  // browsers stamp their own URL, date and "Page 1 of 2" lines onto anything
  // they print and no CSS can switch that off, but a PDF opened in the
  // viewer prints clean. Standard Times-Roman (no font embedding), letter
  // size, 12pt / 18pt leading, 1in margins (+0.75in on top of page 1). ----
  const TIMES_W = {32:250,33:333,34:408,35:500,36:500,37:833,38:778,39:180,40:333,41:333,42:500,43:564,44:250,45:333,46:250,47:278,58:278,59:278,60:564,61:564,62:564,63:444,64:921,65:722,66:667,67:667,68:722,69:611,70:556,71:722,72:722,73:333,74:389,75:722,76:611,77:889,78:722,79:722,80:556,81:722,82:667,83:556,84:611,85:722,86:722,87:944,88:722,89:722,90:611,91:333,92:278,93:333,94:469,95:500,96:333,97:444,98:500,99:444,100:500,101:444,102:333,103:500,104:500,105:278,106:278,107:500,108:278,109:778,110:500,111:500,112:500,113:500,114:333,115:389,116:278,117:500,118:500,119:722,120:500,121:500,122:444,123:480,124:200,125:480,126:541};
  for(let c = 48; c <= 57; c++) TIMES_W[c] = 500;
  const CP1252 = { '‘':0x91, '’':0x92, '“':0x93, '”':0x94, '•':0x95, '–':0x96, '—':0x97, '…':0x85 };
  const EXTRA_W = { 0x91:333, 0x92:333, 0x93:444, 0x94:444, 0x95:350, 0x96:500, 0x97:1000, 0x85:1000, 0xBF:444, 0xA1:333 };
  function toWin(ch){
    if(CP1252[ch] !== undefined) return CP1252[ch];
    const c = ch.charCodeAt(0);
    return c < 256 ? c : 63;
  }
  function charW(code){
    if(TIMES_W[code]) return TIMES_W[code];
    if(EXTRA_W[code]) return EXTRA_W[code];
    const base = String.fromCharCode(code).normalize('NFD').charCodeAt(0);
    return TIMES_W[base] || 500;
  }
  function textW(str){
    let w = 0;
    for(const ch of str) w += charW(toWin(ch));
    return w * 12 / 1000;
  }
  function wrapLine(line, maxW){
    if(line === '') return [''];
    const out = []; let cur = '';
    line.split(' ').forEach(word => {
      const t = cur ? cur + ' ' + word : word;
      if(cur && textW(t) > maxW){ out.push(cur); cur = word; } else cur = t;
    });
    out.push(cur);
    return out;
  }
  function pdfEsc(str){
    let o = '';
    for(const ch of str){
      const c = toWin(ch);
      if(c === 40 || c === 41 || c === 92) o += '\\' + ch;
      else if(c >= 32 && c < 127) o += ch;
      else o += '\\' + c.toString(8).padStart(3, '0');
    }
    return o;
  }
  function buildPdfBlob(text){
    const LEAD = 18, LEFT = 72, MAXW = 468;
    const rows = [];
    text.split('\n').forEach(l => wrapLine(l, MAXW).forEach(r => rows.push(r)));
    const pages = [[]]; let y = 792 - 72 - 54;
    rows.forEach(r => {
      if(y - LEAD < 72){ pages.push([]); y = 792 - 72; }
      if(r !== '') pages[pages.length - 1].push('BT /F1 12 Tf ' + LEFT + ' ' + (y - 13) + ' Td (' + pdfEsc(r) + ') Tj ET');
      y -= LEAD;
    });
    const objs = [];
    const n = pages.length;
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [' + pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
    pages.forEach((ops, i) => {
      const body = ops.join('\n');
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>');
      objs.push('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
    });
    let pdf = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const bytes = new Uint8Array(pdf.length);
    for(let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  }
  const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia('(pointer:coarse) and (max-width:900px)').matches);

  function doPrint(){
    if(isPhone()){
      const url = URL.createObjectURL(buildPdfBlob(getLetterText()));
      const w = window.open(url, '_blank');
      if(!w) location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
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
