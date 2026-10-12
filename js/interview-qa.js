// Flashcards for the interview Q&A blog. The deck is built from the question
// cards already in the page, so every question and answer stays in the HTML
// for readers, search engines and AI tools. Nothing is stored or sent.
(function(){
  var items = Array.prototype.slice.call(document.querySelectorAll('.iq-item'));
  var openBtn = document.getElementById('iqOpen'), modal = document.getElementById('iqModal');
  if(!items.length || !openBtn || !modal) return;
  var $ = function(id){ return document.getElementById(id); };
  var card = $('iqCard'), front = $('iqFrontQ'), back = $('iqBackBody'), prog = $('iqProg'), bar = $('iqBar'),
      done = $('iqDone'), summary = $('iqSummary');
  var deck = [], pos = 0, review = {}, got = {}, lastFocus = null;

  function plain(el){ var c = el.cloneNode(true); c.querySelectorAll('button').forEach(function(b){ b.replaceWith(document.createTextNode(b.textContent)); }); return c.innerHTML; }
  function all(){ return items.map(function(_, i){ return i; }); }
  function shuffle(a){ for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function show(){
    modal.classList.remove('is-done'); done.hidden = true;
    var it = items[deck[pos]];
    card.classList.remove('is-flipped');
    front.textContent = it.querySelector('h3').textContent;
    back.innerHTML = plain(it.querySelector('.iq-body'));
    prog.textContent = 'Card ' + (pos + 1) + ' of ' + deck.length;
    bar.style.width = ((pos) / deck.length * 100) + '%';
  }
  function finish(){
    modal.classList.add('is-done'); done.hidden = false; bar.style.width = '100%';
    var r = Object.keys(review).filter(function(k){ return review[k]; }).length;
    summary.textContent = (deck.length - r) + ' of ' + deck.length + ' marked "Got it"' + (r ? ', ' + r + ' to review.' : '. Nice work.');
    $('iqAgainDeck').style.display = r ? '' : 'none';
    prog.textContent = 'Done';
  }
  function advance(){ pos++; if(pos >= deck.length) finish(); else show(); }
  function start(d){ deck = d; pos = 0; review = {}; got = {}; show(); }
  function open(){
    lastFocus = document.activeElement;
    modal.hidden = false; document.body.classList.add('iq-open');
    start(all()); card.focus();
  }
  function close(){
    modal.hidden = true; document.body.classList.remove('iq-open');
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  openBtn.addEventListener('click', open);
  $('iqClose').addEventListener('click', close);
  card.addEventListener('click', function(){ card.classList.toggle('is-flipped'); });
  $('iqGot').addEventListener('click', function(){ review[deck[pos]] = false; advance(); });
  $('iqReview').addEventListener('click', function(){ review[deck[pos]] = true; advance(); });
  $('iqPrev').addEventListener('click', function(){ if(pos > 0){ pos--; show(); } });
  $('iqShuffle').addEventListener('click', function(){ start(shuffle(all())); });
  $('iqRestart').addEventListener('click', function(){ start(all()); });
  $('iqAgainDeck').addEventListener('click', function(){
    var d = deck.filter(function(i){ return review[i]; });
    start(d.length ? d : all());
  });
  document.addEventListener('keydown', function(e){
    if(modal.hidden) return;
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'ArrowRight'){ if(!modal.classList.contains('is-done')) advance(); }
    else if(e.key === 'ArrowLeft'){ if(pos > 0 && !modal.classList.contains('is-done')){ pos--; show(); } }
    else if((e.key === ' ' || e.key === 'Enter') && document.activeElement === card){ e.preventDefault(); card.classList.toggle('is-flipped'); }
  });
  // The site swipes between blog posts on touch screens; keep swipes inside the deck.
  ['touchstart', 'touchend'].forEach(function(t){ modal.addEventListener(t, function(e){ e.stopPropagation(); }, { passive: true }); });
})();
