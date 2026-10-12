// Practice mode for the interview Q&A blog. It is built from the question list
// already in the page, so every question and answer stays in the HTML for
// readers, search engines and AI tools. Nothing typed or chosen is stored or sent.
(function(){
  var items = Array.prototype.slice.call(document.querySelectorAll('.iq-item'));
  var box = document.getElementById('iqPractice');
  if(!items.length || !box) return;
  var order = [], pos = -1;
  function shuffle(){
    order = items.map(function(_, i){ return i; });
    for(var i = order.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    pos = -1;
  }
  var q = box.querySelector('.iq-q'), ans = box.querySelector('.iq-ans'), count = box.querySelector('.iq-count');
  var showBtn = box.querySelector('[data-iq="show"]'), nextBtn = box.querySelector('[data-iq="next"]');
  function next(){
    pos++; if(pos >= order.length) shuffle(), pos = 0;
    var it = items[order[pos]];
    q.textContent = it.querySelector('h3').textContent;
    ans.innerHTML = it.querySelector('.iq-body').innerHTML;
    ans.hidden = true; showBtn.textContent = 'Show sample answer';
    count.textContent = 'Question ' + (pos + 1) + ' of ' + order.length;
  }
  showBtn.addEventListener('click', function(){
    ans.hidden = !ans.hidden;
    showBtn.textContent = ans.hidden ? 'Show sample answer' : 'Hide sample answer';
  });
  nextBtn.addEventListener('click', next);
  shuffle(); next(); box.hidden = false;
})();
