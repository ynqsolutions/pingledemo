// Flashcards for the interview Q&A blog. The deck is built from the question
// cards already in the page, so every question and answer stays in the HTML
// for readers, search engines and AI tools. Nothing is stored or sent.
(function(){
  var items = Array.prototype.slice.call(document.querySelectorAll('.iq-item'));
  var openBtn = document.getElementById('iqOpen'), modal = document.getElementById('iqModal');
  if(!items.length || !openBtn || !modal) return;
  var $ = function(id){ return document.getElementById(id); };
  var card = $('iqCard'), front = $('iqFrontQ'), back = $('iqBackBody'), prog = $('iqProg'), bar = $('iqBar'),
      prev = $('iqPrev'), next = $('iqNext');
  var pos = 0, lastFocus = null;

  function plain(el){ var c = el.cloneNode(true); c.querySelectorAll('button').forEach(function(b){ b.replaceWith(document.createTextNode(b.textContent)); }); return c.innerHTML; }
  function show(){
    var it = items[pos];
    card.classList.remove('is-flipped');
    front.textContent = it.querySelector('h3').textContent;
    back.innerHTML = plain(it.querySelector('.iq-body'));
    prog.textContent = 'Card ' + (pos + 1) + ' of ' + items.length;
    bar.style.width = ((pos + 1) / items.length * 100) + '%';
    prev.disabled = pos === 0;
    next.disabled = pos === items.length - 1;
  }
  function go(d){ var n = pos + d; if(n < 0 || n >= items.length) return; pos = n; show(); }
  function open(){
    lastFocus = document.activeElement;
    modal.hidden = false; document.body.classList.add('iq-open');
    pos = 0; show(); card.focus();
  }
  function close(){
    modal.hidden = true; document.body.classList.remove('iq-open');
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  openBtn.addEventListener('click', open);
  $('iqClose').addEventListener('click', close);
  card.addEventListener('click', function(){ card.classList.toggle('is-flipped'); });
  next.addEventListener('click', function(){ go(1); });
  prev.addEventListener('click', function(){ go(-1); });
  document.addEventListener('keydown', function(e){
    if(modal.hidden) return;
    if(e.key === 'Escape') close();
    else if(e.key === 'ArrowRight') go(1);
    else if(e.key === 'ArrowLeft') go(-1);
    else if((e.key === ' ' || e.key === 'Enter') && document.activeElement === card){ e.preventDefault(); card.classList.toggle('is-flipped'); }
  });
  // The site swipes between blog posts on touch screens; keep swipes inside the deck.
  ['touchstart', 'touchend'].forEach(function(t){ modal.addEventListener(t, function(e){ e.stopPropagation(); }, { passive: true }); });
})();
