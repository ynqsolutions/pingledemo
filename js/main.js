// Mobile nav toggle
const burgerBtn = document.getElementById('burgerBtn');
const mobileNav = document.getElementById('mobileNav');
const siteHeader = document.querySelector('.site-header');

// The mobile nav panel drops down from below the header rather than
// covering it, so its offset needs to track the header's real rendered
// height (fonts/line-height can shift it slightly) instead of a guess.
// A single measurement at script-parse time isn't reliable on iOS
// Safari: the header can still be a touch shorter than its final size
// (web fonts not yet swapped in) at that point, and Safari's own
// collapsing/expanding address bar changes the visible viewport
// without always firing a plain 'resize' - both left the mobile nav
// (and the burger icon's transform, painted at that same moment)
// looking subtly misaligned until something forced a fresh layout,
// like closing and reopening the tab. Re-measuring after full load,
// once web fonts are ready, on orientation change, and on
// visualViewport's own resize event (the iOS-specific one that fires
// when the address bar shows/hides) covers all of those triggers.
function setHeaderHeightVar(){
  if(siteHeader) document.documentElement.style.setProperty('--header-h', siteHeader.offsetHeight + 'px');
}
setHeaderHeightVar();
window.addEventListener('resize', setHeaderHeightVar);
window.addEventListener('orientationchange', setHeaderHeightVar);
window.addEventListener('load', setHeaderHeightVar);
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(setHeaderHeightVar);
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', setHeaderHeightVar);
}

// overflow:hidden alone doesn't reliably lock background scroll on iOS
// Safari — it can still rubber-band/scroll behind a position:fixed
// overlay via touch, which is what made the mobile nav look
// "positioned incorrectly" (the page underneath had silently scrolled
// while the nav was open, so closing it left everything offset).
// Freezing the body at its current scroll position with position:fixed
// is the standard fix: the page truly can't move while the nav is
// open, and closeNav restores the exact scroll position afterward.
function openNav(){
  mobileNav.classList.add('open');
  burgerBtn.setAttribute('aria-expanded','true');
  const scrollY = window.scrollY;
  document.body.dataset.scrollLockY = String(scrollY);
  document.body.style.position = 'fixed';
  document.body.style.top = -scrollY + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
}
function closeNav(){
  mobileNav.classList.remove('open');
  burgerBtn.setAttribute('aria-expanded','false');
  const scrollY = parseInt(document.body.dataset.scrollLockY || '0', 10);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  delete document.body.dataset.scrollLockY;
  window.scrollTo(0, scrollY);
}
function toggleNav(){
  if(burgerBtn.getAttribute('aria-expanded') === 'true') closeNav();
  else openNav();
}
if (burgerBtn && mobileNav) {
  burgerBtn.addEventListener('click', toggleNav);
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
}

// Team polaroids: clicking the photo opens the bio on the back, like turning
// a polaroid over. It only flips back via the "x" on the back or by clicking
// "Attorney Bio" again — not by clicking the photo a second time.
// The cards themselves are static HTML generated from content/team.json by
// generate_cms_sections.py at build time (not fetched client-side — fetch()
// can't read local files when the page is opened directly, e.g. by
// double-clicking it, rather than served over http/https).
document.querySelectorAll('.polaroid-flip[data-flippable]').forEach(card => {
  const open = () => card.classList.add('flipped');
  const close = () => card.classList.remove('flipped');
  const toggle = () => card.classList.toggle('flipped');

  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      open();
    }
  });

  const trigger = card.closest('.team-card')?.querySelector('[data-flip-trigger]');
  if(trigger){
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
  }

  const closeBtn = card.querySelector('[data-flip-close]');
  if(closeBtn){
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
  }
});

// Results page review grid: show the first 6 cards, hide the rest behind
// a "View More Reviews" button. Also gives each card a "Read more" toggle
// when its review text is long enough to get clamped.
(function(){
  const grid = document.getElementById('reviewGrid');
  const moreWrap = document.getElementById('reviewMoreWrap');
  const moreBtn = document.getElementById('reviewMoreBtn');
  if(!grid || !moreBtn) return;

  const INITIAL_COUNT = 6;
  const STEP = 6;
  const cards = [...grid.querySelectorAll('.rr-card')];
  let shown = INITIAL_COUNT;

  function render(){
    cards.forEach((card, i) => card.classList.toggle('rr-hidden', i >= shown));
    if(cards.length <= INITIAL_COUNT){
      moreWrap.classList.add('hidden');
      return;
    }
    moreWrap.classList.remove('hidden');
    moreBtn.textContent = shown >= cards.length ? 'Hide Reviews' : 'View More Reviews';
  }
  render();

  moreBtn.addEventListener('click', () => {
    if(shown >= cards.length){
      shown = INITIAL_COUNT;
      grid.scrollIntoView({ behavior:'smooth', block:'nearest' });
    } else {
      shown = Math.min(shown + STEP, cards.length);
    }
    render();
  });

  cards.forEach(card => {
    const textWrap = card.querySelector('.rr-text-wrap');
    const text = card.querySelector('.rr-text');
    const btn = card.querySelector('.rr-readmore');
    if(!textWrap || !text || !btn) return;
    if(text.scrollHeight > text.clientHeight + 2){
      btn.classList.add('rr-show');
      btn.addEventListener('click', () => {
        const expanded = textWrap.classList.toggle('expanded');
        btn.textContent = expanded ? 'Show less' : 'Read more';
      });
    }
  });
})();

// Client Stories video carousel: drag-to-scroll with arrow buttons and
// fade gradients that appear only when there's more content to reveal.
(function(){
  const track = document.getElementById('csTrack');
  const prevBtn = document.getElementById('csPrev');
  const nextBtn = document.getElementById('csNext');
  const fadeLeft = document.querySelector('.cs-fade-left');
  const fadeRight = document.querySelector('.cs-fade-right');
  if(!track || !prevBtn || !nextBtn) return;

  function cardStep(){
    const card = track.querySelector('.cs-card');
    if(!card) return 300;
    const style = getComputedStyle(track);
    return card.getBoundingClientRect().width + parseFloat(style.gap || 20);
  }

  function updateEdges(){
    const atStart = track.scrollLeft <= 4;
    const atEnd = Math.ceil(track.scrollLeft + track.clientWidth) >= track.scrollWidth - 4;
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
    if(fadeLeft) fadeLeft.classList.toggle('cs-visible', !atStart);
    if(fadeRight) fadeRight.classList.toggle('cs-visible', !atEnd);
  }

  prevBtn.addEventListener('click', () => track.scrollBy({ left: -cardStep(), behavior:'smooth' }));
  nextBtn.addEventListener('click', () => track.scrollBy({ left: cardStep(), behavior:'smooth' }));
  track.addEventListener('scroll', updateEdges, { passive:true });
  window.addEventListener('resize', updateEdges);
  updateEdges();

  // Mouse drag-to-scroll, and press-and-hold near the edges to keep scrolling
  let isDown = false;
  let dragged = false;
  let startX = 0;
  let startScroll = 0;

  track.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'touch') return;
    isDown = true;
    dragged = false;
    track.classList.add('dragging');
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener('pointermove', (e) => {
    if(!isDown) return;
    const delta = e.clientX - startX;
    if(Math.abs(delta) > 4) dragged = true;
    track.scrollLeft = startScroll - delta;
  });
  function endDrag(){
    if(!isDown) return;
    isDown = false;
    track.classList.remove('dragging');
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointerleave', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('click', (e) => { if(dragged) e.preventDefault(); }, true);
})();

// Settlement tiles: static HTML generated from content/settlements.json by
// generate_cms_sections.py at build time (not fetched client-side — see
// the note above the team-polaroid code for why). View-more shows the
// first 6 tiles, reveals 3 more per click, and collapses back down once
// everything is shown.
function initSettlementViewMore(grid){
  const moreWrap = document.getElementById('settlementMoreWrap');
  const moreBtn = document.getElementById('settlementMoreBtn');
  if(!grid || !moreBtn) return;

  const INITIAL_COUNT = 6;
  const STEP = 3;
  const tiles = [...grid.querySelectorAll('.settlement-tile')];
  let shown = INITIAL_COUNT;

  function render(){
    tiles.forEach((tile, i) => tile.classList.toggle('settlement-hidden', i >= shown));
    if(tiles.length <= INITIAL_COUNT){
      moreWrap.classList.add('hidden');
      return;
    }
    moreWrap.classList.remove('hidden');
    moreBtn.textContent = shown >= tiles.length ? 'Hide Settlements' : 'View More Settlements';
  }
  render();

  moreBtn.addEventListener('click', () => {
    if(shown >= tiles.length){
      shown = INITIAL_COUNT;
      grid.scrollIntoView({ behavior:'smooth', block:'nearest' });
    } else {
      shown = Math.min(shown + STEP, tiles.length);
    }
    render();
  });
}

// Settlement tiles on the Results page: click to flip, like the team
// polaroids, revealing case details on the back. Height is pinned to an
// explicit pixel value (rather than trusting aspect-ratio alone) so the
// box cannot grow when flipped, which some browsers get wrong when a
// 3D-transformed, absolutely-positioned back face is involved. Also called
// after the tiles are rendered from JSON.
function initSettlementFlip(grid){
  const tiles = grid.querySelectorAll('.settlement-tile');
  if(!tiles.length) return;

  function pinHeights(){
    tiles.forEach(tile => {
      const px = tile.offsetWidth + 'px';
      tile.style.height = px;
      const inner = tile.querySelector('.settlement-tile-inner');
      if(inner) inner.style.height = px;
      tile.querySelectorAll('.settlement-face').forEach(face => {
        face.style.height = px;
      });
    });
  }
  // If the settlement amount text runs wide enough to overlap the subject's
  // face, shrink the cutout photo (via .settlement-tight-fit) so the number
  // stays readable and the face stays clear.
  function fitAmountAgainstPhoto(){
    tiles.forEach(tile => {
      const amount = tile.querySelector('.settlement-amount');
      const photo = tile.querySelector('.settlement-photo');
      if(!amount || !photo) return;
      tile.classList.remove('settlement-tight-fit');
      const amountRect = amount.getBoundingClientRect();
      const photoRect = photo.getBoundingClientRect();
      const overlaps = amountRect.right > photoRect.left && amountRect.bottom > photoRect.top;
      if(overlaps) tile.classList.add('settlement-tight-fit');
    });
  }

  function remeasure(){
    pinHeights();
    fitAmountAgainstPhoto();
  }

  remeasure();

  // A window 'resize' listener alone left tiles at a stale height once a
  // drag finished, so the page had to be reloaded to square them up again:
  // pinHeights() reads offsetWidth and then writes height, and doing both
  // inside a resize handler can read a box from before the final layout,
  // leaving the last event of the drag one step behind with nothing after
  // it to correct the result. ResizeObserver instead reports the element's
  // real box after layout, so it can't lag, and it also catches the tiles
  // changing width with no window resize at all (a scrollbar appearing,
  // fonts swapping in, the View More button adding a row).
  //
  // It watches the grid rather than the tiles, and only reacts when the
  // grid's WIDTH changes, because pinHeights() writes tile heights: that
  // grows the grid's own height, which would otherwise notify this same
  // observer and set up a feedback loop.
  if(window.ResizeObserver){
    let lastGridWidth = Math.round(grid.getBoundingClientRect().width);
    new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if(width === lastGridWidth) return;
      lastGridWidth = width;
      remeasure();
    }).observe(grid);
  }
  // Kept as a fallback for browsers without ResizeObserver, and because it
  // still covers full-page zoom, which doesn't always change the grid's
  // measured width.
  window.addEventListener('resize', remeasure);

  // Re-check once newly revealed tiles (via the "View More Results" button)
  // actually have real layout, since a hidden tile measures as zero-size —
  // pinHeights() ran once at init while these tiles were still
  // display:none, leaving their height pinned at 0px forever unless
  // re-measured now that they're actually visible. Only react to the
  // "settlement-hidden" class toggle itself, since this same observer
  // would otherwise also catch (and loop on) the settlement-tight-fit /
  // flipped classes it and the click handler set.
  if(grid && window.MutationObserver){
    const observer = new MutationObserver((mutations) => {
      const revealChanged = mutations.some(m => {
        const was = (m.oldValue || '').includes('settlement-hidden');
        const isNow = m.target.classList.contains('settlement-hidden');
        return was !== isNow;
      });
      if(revealChanged){
        // Called directly rather than via requestAnimationFrame: by the
        // time this callback runs the class/display change has already
        // been applied, so offsetWidth is already accurate — and rAF
        // callbacks can be throttled or skipped entirely in a
        // backgrounded tab, which would leave the tile stuck at 0px.
        remeasure();
      }
    });
    observer.observe(grid, { attributes:true, attributeFilter:['class'], attributeOldValue:true, subtree:true });
  }

  tiles.forEach(tile => {
    const open = () => tile.classList.add('flipped');
    const close = () => tile.classList.remove('flipped');

    tile.addEventListener('click', (e) => {
      if(e.target.closest('.settlement-tile-close')){
        e.stopPropagation();
        close();
        return;
      }
      tile.classList.toggle('flipped');
    });
    tile.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        open();
      }
      if(e.key === 'Escape') close();
    });
  });
}

(function(){
  const grid = document.getElementById('settlementGrid');
  if(!grid) return;
  initSettlementViewMore(grid);
  initSettlementFlip(grid);
})();

// Auto-format any phone-type input as XXX-XXX-XXXX while typing.
document.querySelectorAll('input[type="tel"]').forEach(input => {
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 10);
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 10);
    let formatted = part1;
    if(part2) formatted += '-' + part2;
    if(part3) formatted += '-' + part3;
    const atEnd = input.selectionStart === input.value.length;
    input.value = formatted;
    if(atEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
});

// Language toggle (EN/ES): purely visual — animates which side is "active"
// but does not translate any content.
document.querySelectorAll('.lang-toggle').forEach(toggle => {
  const spans = toggle.querySelectorAll('span');
  spans.forEach(span => {
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-pressed', span.classList.contains('active') ? 'true' : 'false');
    function activate(){
      if(span.classList.contains('active')) return;
      spans.forEach(s => {
        s.classList.toggle('active', s === span);
        s.setAttribute('aria-pressed', s === span ? 'true' : 'false');
      });
      span.classList.remove('liquify');
      // Force a reflow so the animation restarts even if it's re-triggered quickly.
      void span.offsetWidth;
      span.classList.add('liquify');
      span.addEventListener('animationend', () => span.classList.remove('liquify'), { once:true });
    }
    span.addEventListener('click', activate);
    span.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        activate();
      }
    });
  });
});

// Highlight the current page in the desktop and mobile nav
(function(){
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-desktop a, .mobile-nav ul a').forEach(a => {
    const href = a.getAttribute('href');
    if(href === path || (path === 'index.html' && href === 'index.html')){
      a.classList.add('current');
    }
  });
})();

// Reviews carousel: prev/next arrows, native swipe (scroll-snap), and
// autoplay that pauses on hover or manual interaction.
(function(){
  const track = document.getElementById('reviewsTrack');
  const prevBtn = document.getElementById('reviewsPrev');
  const nextBtn = document.getElementById('reviewsNext');
  if(!track || !prevBtn || !nextBtn) return;

  function cardStep(){
    const card = track.querySelector('.review-card');
    if(!card) return 360;
    const style = getComputedStyle(track);
    return card.getBoundingClientRect().width + parseFloat(style.gap || 28);
  }

  function atEnd(){
    return Math.ceil(track.scrollLeft + track.clientWidth) >= track.scrollWidth;
  }

  function next(){
    if(atEnd()){
      track.scrollTo({ left:0, behavior:'smooth' });
    } else {
      track.scrollBy({ left: cardStep(), behavior:'smooth' });
    }
  }
  function prev(){
    if(track.scrollLeft <= 0){
      track.scrollTo({ left: track.scrollWidth, behavior:'smooth' });
    } else {
      track.scrollBy({ left: -cardStep(), behavior:'smooth' });
    }
  }

  nextBtn.addEventListener('click', () => { next(); resumeLater(); });
  prevBtn.addEventListener('click', () => { prev(); resumeLater(); });

  let autoplayId = null;
  let resumeTimeout = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function startAutoplay(){
    if(prefersReducedMotion || autoplayId) return;
    autoplayId = setInterval(next, 4500);
  }
  function stopAutoplay(){
    clearInterval(autoplayId);
    autoplayId = null;
  }
  function resumeLater(){
    stopAutoplay();
    clearTimeout(resumeTimeout);
    resumeTimeout = setTimeout(startAutoplay, 6000);
  }

  track.addEventListener('mouseenter', stopAutoplay);
  track.addEventListener('mouseleave', startAutoplay);
  track.addEventListener('touchstart', stopAutoplay, { passive:true });
  track.addEventListener('touchend', resumeLater, { passive:true });

  // Mouse drag-to-scroll (touch already scrolls natively via overflow-x)
  let isDown = false;
  let dragged = false;
  let startX = 0;
  let startScroll = 0;

  track.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'touch') return;
    isDown = true;
    dragged = false;
    track.classList.add('dragging');
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
    stopAutoplay();
  });
  track.addEventListener('pointermove', (e) => {
    if(!isDown) return;
    const delta = e.clientX - startX;
    if(Math.abs(delta) > 4) dragged = true;
    track.scrollLeft = startScroll - delta;
  });
  function endDrag(){
    if(!isDown) return;
    isDown = false;
    track.classList.remove('dragging');
    resumeLater();
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointerleave', endDrag);
  track.addEventListener('pointercancel', endDrag);
  // Prevent the drag from being interpreted as a click/navigation
  track.addEventListener('click', (e) => { if(dragged) e.preventDefault(); }, true);

  startAutoplay();
})();

// Trust badges slider now animates via pure CSS (@keyframes badge-marquee
// in style.css) instead of a JS rAF loop driving scrollLeft — the JS
// version was unreliable on real mobile browsers.

// FAQ accordion (used on faq.html)
document.querySelectorAll('.faq-item').forEach(item => {
  const btn = item.querySelector('.faq-q');
  const answer = item.querySelector('.faq-a');
  if(!btn || !answer) return;
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(openItem => {
      if(openItem !== item){
        openItem.classList.remove('open');
        openItem.querySelector('.faq-a').style.maxHeight = null;
      }
    });
    item.classList.toggle('open', !isOpen);
    answer.style.maxHeight = !isOpen ? answer.scrollHeight + 'px' : null;
  });
});

// FAQ "Browse All Questions" dropdown: close on outside click
document.querySelectorAll('.faq-browse details').forEach(details => {
  document.addEventListener('click', (e) => {
    if(details.open && !details.contains(e.target)){
      details.open = false;
    }
  });
});

// Back-to-top button: fades in after scrolling down, scrolls to top on click
const backToTop = document.getElementById('backToTop');
if(backToTop){
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('visible', window.scrollY > 500);
  });
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Practice Areas city selector: each city has its own dedicated page
// (e.g. beverly-hills-practice-areas.html) reordered and relinked for that
// city, so switching cities here just navigates to that page.
(function(){
  const citySelect = document.getElementById('cityHeadingSelect');
  if(!citySelect) return;

  const citySlugs = {
    'Fountain Valley': 'fountain-valley',
    'Beverly Hills': 'beverly-hills',
    'San Bernardino': 'san-bernardino',
    'San Diego': 'san-diego',
    'San Francisco': 'san-francisco',
    'Sacramento': 'sacramento',
  };

  citySelect.addEventListener('change', () => {
    const city = citySelect.value;
    const slug = citySlugs[city];
    window.location.href = slug ? `${slug}-practice-areas.html` : 'practice-areas.html';
  });
})();

// Glossary popup: click a defined term to see a short plain-English
// definition in a small popup positioned near the term.
(function(){
  const terms = document.querySelectorAll('.glossary-term');
  if(!terms.length) return;

  const popup = document.createElement('div');
  popup.className = 'glossary-popup';
  popup.innerHTML = '<button type="button" class="glossary-close" aria-label="Close definition">&times;</button><div class="glossary-popup-head"><img src="assets/Pingle_HS_Thinking.png" alt="" class="glossary-popup-photo"><span class="glossary-popup-tag">Did You Know?</span></div><strong></strong><span class="glossary-popup-text"></span>';
  document.body.appendChild(popup);

  const titleEl = popup.querySelector('strong');
  const textEl = popup.querySelector('.glossary-popup-text');
  let openTerm = null;

  function closePopup(){
    popup.classList.remove('visible');
    openTerm = null;
  }

  function openFor(term){
    titleEl.textContent = term.dataset.term;
    textEl.textContent = term.dataset.def;
    popup.classList.add('visible');
    const rect = term.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 300;
    let left = rect.left;
    if(left + popupWidth > window.innerWidth - 16) left = window.innerWidth - popupWidth - 16;
    left = Math.max(16, left);
    let top = rect.bottom + 8;
    if(top + popup.offsetHeight > window.innerHeight - 16) top = rect.top - popup.offsetHeight - 8;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    openTerm = term;
  }

  terms.forEach(term => {
    term.addEventListener('click', (e) => {
      e.stopPropagation();
      if(openTerm === term){ closePopup(); }
      else { openFor(term); }
    });
  });

  popup.querySelector('.glossary-close').addEventListener('click', closePopup);

  document.addEventListener('click', (e) => {
    if(popup.classList.contains('visible') && !popup.contains(e.target) && !e.target.classList.contains('glossary-term')){
      closePopup();
    }
  });
  window.addEventListener('scroll', closePopup, { passive: true });
  window.addEventListener('resize', closePopup);
})();

// Glossary term search: type-ahead that jumps straight to the matching entry.
(function(){
  const input = document.getElementById('glossarySearchInput');
  const results = document.getElementById('glossarySearchResults');
  const form = document.getElementById('glossarySearch');
  if(!input || !results || !form) return;

  // Moved from an inline onsubmit="return false" attribute so the CSP
  // script-src can drop 'unsafe-inline'; this is a type-ahead search, so
  // pressing Enter should never actually submit/reload the page.
  form.addEventListener('submit', (e) => e.preventDefault());

  const entries = [...document.querySelectorAll('.glossary-entry')].map(el => ({
    id: el.id,
    name: el.querySelector('h3') ? el.querySelector('h3').textContent.trim() : ''
  })).filter(e => e.name);

  function jumpTo(id){
    results.hidden = true;
    input.value = '';
    window.location.hash = id;
    const target = document.getElementById(id);
    if(target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render(matches){
    if(!matches.length){
      results.innerHTML = '<div class="glossary-search-empty">No matching terms.</div>';
      results.hidden = false;
      return;
    }
    results.innerHTML = matches.slice(0, 8).map(m => `<a href="#${m.id}" data-id="${m.id}">${m.name}</a>`).join('');
    results.hidden = false;
    results.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        jumpTo(a.dataset.id);
      });
    });
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if(!q){ results.hidden = true; return; }
    render(entries.filter(e => e.name.toLowerCase().includes(q)));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim().toLowerCase();
    if(!q) return;
    const exact = entries.find(e => e.name.toLowerCase() === q);
    if(exact){ jumpTo(exact.id); return; }
    const partial = entries.filter(e => e.name.toLowerCase().includes(q));
    if(partial.length) jumpTo(partial[0].id);
  });

  document.addEventListener('click', (e) => {
    if(!form.contains(e.target)) results.hidden = true;
  });
})();

// Resources page: paginate blog cards eight at a time (Back / page numbers / Next),
// and filter by category and industry. The chosen filter and page are remembered
// in sessionStorage so they're restored when a visitor opens a blog post and then
// hits the browser's back button.
(function(){
  const grid = document.getElementById('resourceArticleGrid');
  const pagination = document.getElementById('resourcePagination');
  const prevBtn = document.getElementById('paginationPrev');
  const nextBtn = document.getElementById('paginationNext');
  const numbersWrap = document.getElementById('paginationNumbers');
  const filterNav = document.getElementById('blogCategoryFilter');
  const industryFilter = document.getElementById('industryFilter');
  const industryFilterList = document.getElementById('industryFilterList');
  const industrySummary = industryFilter ? industryFilter.querySelector('summary') : null;
  if(!grid || !pagination || !prevBtn || !nextBtn || !numbersWrap) return;

  const STORAGE_KEY = 'blogCategoryFilter';
  const INDUSTRY_STORAGE_KEY = 'blogIndustryFilter';
  const PAGE_STORAGE_KEY = 'blogArticlesPage';
  const PAGE_SIZE = 8;
  const cards = [...grid.querySelectorAll('.resource-article-card')];

  let currentPage = 1;
  try {
    const savedPage = parseInt(sessionStorage.getItem(PAGE_STORAGE_KEY), 10);
    if(!isNaN(savedPage) && savedPage > 1) currentPage = savedPage;
  } catch(e){}

  let activeFilter = 'all';
  try {
    activeFilter = sessionStorage.getItem(STORAGE_KEY) || 'all';
  } catch(e){}

  let activeIndustry = 'all';
  try {
    activeIndustry = sessionStorage.getItem(INDUSTRY_STORAGE_KEY) || 'all';
  } catch(e){}

  function visibleCards(){
    return cards.filter(card =>
      (activeFilter === 'all' || card.dataset.category === activeFilter) &&
      (activeIndustry === 'all' || card.dataset.industry === activeIndustry)
    );
  }

  function setPage(page){
    currentPage = page;
    try { sessionStorage.setItem(PAGE_STORAGE_KEY, String(currentPage)); } catch(e){}
  }

  function pageNumberList(current, total){
    // Always show first, last, current, and one neighbor on each side; collapse the rest into ellipses.
    const pages = new Set([1, total, current, current - 1, current + 1]);
    const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    const out = [];
    let prev = null;
    sorted.forEach(p => {
      if(prev !== null && p - prev > 1) out.push('...');
      out.push(p);
      prev = p;
    });
    return out;
  }

  function renderPaginationControls(totalPages){
    if(totalPages <= 1){
      pagination.classList.add('hidden');
      numbersWrap.innerHTML = '';
      return;
    }
    pagination.classList.remove('hidden');
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    numbersWrap.innerHTML = '';
    pageNumberList(currentPage, totalPages).forEach(p => {
      if(p === '...'){
        const span = document.createElement('span');
        span.className = 'pagination-ellipsis';
        span.textContent = '...';
        numbersWrap.appendChild(span);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pagination-num' + (p === currentPage ? ' is-active' : '');
      btn.textContent = String(p);
      btn.setAttribute('aria-label', `Page ${p}`);
      if(p === currentPage) btn.setAttribute('aria-current', 'page');
      btn.addEventListener('click', () => {
        if(p === currentPage) return;
        setPage(p);
        render(true);
      });
      numbersWrap.appendChild(btn);
    });
  }

  function render(animate){
    const visible = visibleCards();
    const visibleSet = new Set(visible);
    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    if(currentPage > totalPages) currentPage = totalPages;
    if(currentPage < 1) currentPage = 1;

    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageEnd = pageStart + PAGE_SIZE;

    cards.forEach(card => {
      const wasFilteredOut = card.classList.contains('resource-article-filtered-out');
      const isMatch = visibleSet.has(card);
      card.classList.toggle('resource-article-filtered-out', !isMatch);
      if(animate && isMatch && wasFilteredOut){
        card.classList.remove('resource-article-entering');
        void card.offsetWidth;
        card.classList.add('resource-article-entering');
      }
    });
    visible.forEach((card, i) => {
      const onPage = i >= pageStart && i < pageEnd;
      const wasHidden = card.classList.contains('resource-article-hidden');
      card.classList.toggle('resource-article-hidden', !onPage);
      if(animate && onPage && wasHidden){
        card.classList.remove('resource-article-entering');
        void card.offsetWidth;
        card.classList.add('resource-article-entering');
      }
    });

    renderPaginationControls(totalPages);
  }

  if(filterNav){
    const btn = filterNav.querySelector(`button[data-filter="${activeFilter}"]`);
    if(btn){
      filterNav.querySelectorAll('button[data-filter]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    }
  }
  if(industryFilterList){
    const ibtn = industryFilterList.querySelector(`button[data-industry="${activeIndustry}"]`);
    if(ibtn){
      industryFilterList.querySelectorAll('button[data-industry]').forEach(b => b.classList.remove('is-active'));
      ibtn.classList.add('is-active');
    }
    if(industrySummary && activeIndustry !== 'all'){
      industrySummary.textContent = `Industry: ${activeIndustry}`;
    }
  }
  render(false);

  prevBtn.addEventListener('click', () => {
    if(currentPage <= 1) return;
    setPage(currentPage - 1);
    render(true);
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(visibleCards().length / PAGE_SIZE));
    if(currentPage >= totalPages) return;
    setPage(currentPage + 1);
    render(true);
  });

  // Mobile-only: swipe left/right across the article grid to move between pages.
  const isTouchDevice = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if(isTouchDevice){
    let touchStartX = null;
    let touchStartY = null;
    grid.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    }, { passive:true });
    grid.addEventListener('touchend', (e) => {
      if(touchStartX === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      touchStartX = null;
      touchStartY = null;
      if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5){
        if(dx < 0) nextBtn.click();
        else prevBtn.click();
      }
    }, { passive:true });
  }

  if(filterNav){
    filterNav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if(!btn) return;
      filterNav.querySelectorAll('button[data-filter]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeFilter = btn.dataset.filter;
      try { sessionStorage.setItem(STORAGE_KEY, activeFilter); } catch(e){}
      setPage(1);
      render(true);
    });
  }

  if(industryFilterList){
    industryFilterList.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-industry]');
      if(!btn) return;
      industryFilterList.querySelectorAll('button[data-industry]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeIndustry = btn.dataset.industry;
      try { sessionStorage.setItem(INDUSTRY_STORAGE_KEY, activeIndustry); } catch(e){}
      if(industrySummary){
        industrySummary.textContent = activeIndustry === 'all' ? 'Find Your Industry' : `Industry: ${activeIndustry}`;
      }
      if(industryFilter) industryFilter.open = false;
      setPage(1);
      render(true);
    });
  }
})();

// Learn & Play mascot: loops the lasso-spin sway sheet continuously. The
// carousel below repeats the same game screen in several slides, so this
// animates every .retro-dancer instance on the page, not just the first.
(function(){
  const dancers = document.querySelectorAll('.retro-dancer');
  if(!dancers.length) return;

  const SCALE = 0.5;
  const FRAME = { w: Math.round(384 * SCALE), h: Math.round(256 * SCALE) };
  const frames = [0, 1, 2, 3].map(c => ({ x: -c * FRAME.w, y: 0 }));

  dancers.forEach(dancer => {
    dancer.style.backgroundImage = "url('assets/Animations/character_lasso_sway.png')";
    dancer.style.backgroundSize = '768px 512px';
    dancer.style.width = FRAME.w + 'px';
    dancer.style.height = FRAME.h + 'px';
  });

  let step = 0;
  setInterval(() => {
    const f = frames[step % frames.length];
    dancers.forEach(dancer => {
      dancer.style.backgroundPosition = f.x + 'px ' + f.y + 'px';
    });
    step++;
  }, 220);
})();

// Learn & Play carousel: center slide large and in focus, neighboring slides
// smaller and faded off to each side. Navigable by arrow buttons or a swipe
// gesture on touch devices. Positions are computed as the shortest signed
// distance around the circular slide order, so stepping past the last slide
// wraps smoothly back to the first with no jump, an endless loop either way.
(function(){
  const track = document.getElementById('lpCarouselTrack');
  const prevBtn = document.getElementById('lpCarouselPrev');
  const nextBtn = document.getElementById('lpCarouselNext');
  if(!track || !prevBtn || !nextBtn) return;

  const slides = [...track.querySelectorAll('.lp-carousel-slide')];
  if(!slides.length) return;

  let active = 0;
  const n = slides.length;

  function circularOffset(i){
    let offset = (i - active) % n;
    if(offset > n / 2) offset -= n;
    if(offset < -n / 2) offset += n;
    return offset;
  }

  function render(){
    slides.forEach((slide, i) => {
      const offset = circularOffset(i);
      const abs = Math.abs(offset);
      if(abs > 2){
        slide.style.display = 'none';
        return;
      }
      slide.style.display = '';
      const scale = 1 - abs * 0.36;
      const opacity = 1 - abs * 0.5;
      slide.style.transform = `translate(-50%, -50%) translateX(${offset * 78}%) scale(${scale})`;
      slide.style.opacity = String(opacity);
      slide.style.zIndex = String(10 - abs);
      slide.style.pointerEvents = offset === 0 ? 'auto' : 'none';
    });
  }
  render();

  function go(delta){
    active = (active + delta + n) % n;
    render();
  }
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));

  let touchStartX = null;
  track.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive:true });
  track.addEventListener('touchend', (e) => {
    if(touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if(Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  }, { passive:true });
})();

// Blog posts: mobile-only swipe left/right to move to the next/previous article.
(function(){
  const prevHref = document.body.dataset.prevPost;
  const nextHref = document.body.dataset.nextPost;
  if(!prevHref && !nextHref) return;

  const isTouchDevice = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if(!isTouchDevice) return;

  let touchStartX = null;
  let touchStartY = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive:true });
  document.addEventListener('touchend', (e) => {
    if(touchStartX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if(Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5){
      if(dx < 0 && nextHref) window.location.href = nextHref;
      else if(dx > 0 && prevHref) window.location.href = prevHref;
    }
  }, { passive:true });
})();

// Results page: clicking any star opens a modal offering Google/Yelp/Avvo
// review links for the selected office location, plus a contact-us fallback.
// Every rating opens the same modal (no gating by star count).
(function(){
  const modal = document.getElementById('reviewModal');
  const triggers = document.querySelectorAll('.rr-star, .rr-platform-trigger');
  if(!modal || !triggers.length) return;

  const citySelect = document.getElementById('reviewCitySelect');
  const googleLink = document.getElementById('reviewGoogleLink');
  const yelpLink = document.getElementById('reviewYelpLink');

  const REVIEW_LINKS = {
    'fountain-valley': {
      google: 'https://g.page/r/CfsedGB7JjfsEAI/review',
      yelp: 'https://www.yelp.com/biz/law-office-of-corey-a-pingle-fountain-valley-7'
    },
    'beverly-hills': {
      google: 'https://g.page/r/CbSbcWXLg-9UEAI/review',
      yelp: 'https://www.yelp.com/biz/law-office-of-corey-a-pingle-beverly-hills-2'
    },
    'san-bernardino': {
      google: null,
      yelp: 'https://www.yelp.com/biz/law-office-of-corey-a-pingle-san-bernardino'
    },
    'san-diego': {
      google: 'https://www.google.com/search?q=san+diego+law+offices+of+corey+pingle&oq=san+diego+law+offices+of+corey+pingle&gs_lcrp=EgZjaHJvbWUyBggAEEUYOTIHCAEQIRigATIHCAIQIRiPAjIHCAMQIRiPAjIHCAQQIRiPAtIBCDQxOTJqMGo3qAIAsAIA&sourceid=chrome&source=chrome.ob&ie=UTF-8#lrd=0x80d955fffd89aca9:0xdb91edd75f40fb36,3,,,,',
      yelp: 'https://www.yelp.com/biz/law-office-of-corey-a-pingle-san-diego'
    },
    'san-francisco': {
      google: null,
      yelp: null
    },
    'sacramento': {
      google: 'https://g.page/r/CZP-pv5CbUnIEAI/review',
      yelp: 'https://www.yelp.com/biz/law-office-of-corey-a-pingle-sacramento-3'
    }
  };

  function updateLinks(){
    const links = REVIEW_LINKS[citySelect.value] || {};
    if(links.google){ googleLink.href = links.google; googleLink.style.display = ''; }
    else { googleLink.style.display = 'none'; }
    if(links.yelp){ yelpLink.href = links.yelp; yelpLink.style.display = ''; }
    else { yelpLink.style.display = 'none'; }
  }

  function openModal(){
    updateLinks();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  triggers.forEach(trigger => trigger.addEventListener('click', openModal));
  citySelect.addEventListener('change', updateLinks);
  modal.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
})();

// Footer newsletter form: submits to Netlify Forms via fetch() (so we can
// swap in a friendly inline status line instead of a full page reload)
// rather than letting the browser do a native POST/reload. Moved here from
// an inline onsubmit="" attribute so the CSP script-src can drop
// 'unsafe-inline'.
function encodeFormData(data){
  return Object.keys(data)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
    .join('&');
}
document.querySelectorAll('.footer-newsletter').forEach(form => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const status = form.querySelector('.newsletter-status');
    const data = Object.fromEntries(new FormData(form).entries());
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData(data)
    })
      .then(() => {
        if(status) status.textContent = 'Thanks for subscribing.';
        form.reset();
      })
      .catch(() => {
        if(status) status.textContent = 'Something went wrong. Please try again.';
      });
  });
});

// Contact page form: same pattern as the newsletter form above.
(function(){
  const form = document.querySelector('form[name="contact"]');
  if(!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const status = form.querySelector('.contact-form-status');
    const submitBtn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    if(submitBtn) submitBtn.setAttribute('disabled', 'true');
    if(status) status.textContent = 'Sending...';
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData(data)
    })
      .then(() => {
        if(status) status.textContent = 'Thanks, your message has been sent.';
        form.reset();
      })
      .catch(() => {
        if(status) status.textContent = 'Something went wrong. Please try again or call us directly.';
      })
      .finally(() => {
        if(submitBtn) submitBtn.removeAttribute('disabled');
      });
  });
})();

// Calculator/template hero "Back to Tools & Templates" link: if the
// visitor arrived from the full all-tools-and-templates.html directory
// rather than the resources.html teaser grid, point the link (and its
// label) back at that directory instead so "back" actually goes back.
// The directory page sets a sessionStorage flag right before a tile
// navigates away (more reliable than document.referrer, which some
// browsers/extensions strip even for same-origin navigation); referrer
// is kept only as a fallback for that edge case.
(function(){
  const backLink = document.querySelector('.calc-hero-back-link');
  if(!backLink) return;
  let cameFromDirectory = false;
  try {
    if(sessionStorage.getItem('toolsDirectoryVisited') === '1'){
      cameFromDirectory = true;
      sessionStorage.removeItem('toolsDirectoryVisited');
    }
  } catch(e){}
  if(!cameFromDirectory && document.referrer && document.referrer.indexOf('all-tools-and-templates.html') !== -1){
    cameFromDirectory = true;
  }
  if(cameFromDirectory){
    backLink.href = 'all-tools-and-templates.html';
    backLink.textContent = '← Back to All Tools & Templates';
  }
})();

// Hero video controls: play/pause + mute/unmute toggles. State always
// resets to the default (playing, muted) on each page load/visit.
(function(){
  const frame = document.getElementById('heroVideoFrame');
  if(!frame) return;
  const video = frame.querySelector('.hero-video');
  const playBtn = frame.querySelector('.hero-video-play');
  const muteBtn = frame.querySelector('.hero-video-mute');
  if(!video || !playBtn || !muteBtn) return;

  playBtn.addEventListener('click', function(){
    if(video.paused){
      video.play();
    } else {
      video.pause();
    }
  });
  video.addEventListener('play', function(){
    playBtn.querySelector('.icon-pause').style.display = '';
    playBtn.querySelector('.icon-play').style.display = 'none';
    playBtn.setAttribute('aria-label', 'Pause video');
    playBtn.setAttribute('aria-pressed', 'false');
  });
  video.addEventListener('pause', function(){
    playBtn.querySelector('.icon-pause').style.display = 'none';
    playBtn.querySelector('.icon-play').style.display = '';
    playBtn.setAttribute('aria-label', 'Play video');
    playBtn.setAttribute('aria-pressed', 'true');
  });

  muteBtn.addEventListener('click', function(){
    video.muted = !video.muted;
    muteBtn.querySelector('.icon-muted').style.display = video.muted ? '' : 'none';
    muteBtn.querySelector('.icon-unmuted').style.display = video.muted ? 'none' : '';
    muteBtn.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
    muteBtn.setAttribute('aria-pressed', String(video.muted));
  });
})();

