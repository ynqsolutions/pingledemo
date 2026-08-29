// Accessibility widget: always shown as the small minimized edge tab
// (draggable vertically along the left edge), which opens a full-height
// drawer sliding in from the left edge of the browser with real page-wide
// accessibility controls. The tab hides itself while the drawer is open
// and reappears only once the drawer is closed. Settings persist within
// the browser session (sessionStorage), but reset on a new session.
(function(){
  const STORE_KEY = 'a11yWidgetState';

  // ---- Language: the widget mirrors whatever language the current page
  // is in (set by <html lang="...">), and its own EN/ES toggle navigates
  // to that same page's other-language URL, matching the header's toggle.
  const LANG = document.documentElement.lang === 'es' ? 'es' : 'en';
  function otherLangHref(){
    const file = (window.location.pathname.split('/').pop() || 'index.html') + window.location.search + window.location.hash;
    if(/-es\.html/i.test(file)) return file.replace(/-es(\.html)/i, '$1');
    return file.replace(/(\.html)/i, '-es$1');
  }
  const STR = {
    en: {
      accessibilityOptions: 'Accessibility options',
      accessibility: 'Accessibility',
      closePanel: 'Close accessibility panel',
      intro: "These controls only change how this site displays for you. They don't translate or edit page content.",
      profiles: 'Profiles',
      seizureSafe: 'Seizure Safe',
      visionImpaired: 'Vision Impaired',
      adhdFriendly: 'ADHD Friendly',
      motorImpaired: 'Motor Impaired',
      language: 'Language',
      langToggleLabel: 'Language toggle',
      textSize: 'Text Size',
      decreaseTextSize: 'Decrease text size',
      reset: 'Reset',
      increaseTextSize: 'Increase text size',
      display: 'Display',
      highContrast: 'High Contrast',
      grayscale: 'Grayscale',
      underlineLinks: 'Underline Links',
      highlightLinks: 'Highlight Links',
      highlightHeadings: 'Highlight Headings',
      reduceMotion: 'Reduce Motion',
      reading: 'Reading',
      dyslexiaFont: 'Dyslexia-Friendly Font',
      lineSpacing: 'Line & Letter Spacing',
      pointer: 'Pointer',
      largeCursor: 'Large Cursor',
      resetAll: 'Reset All'
    },
    es: {
      accessibilityOptions: 'Opciones de accesibilidad',
      accessibility: 'Accesibilidad',
      closePanel: 'Cerrar panel de accesibilidad',
      intro: 'Estos controles solo cambian cómo se muestra este sitio para usted. No traducen ni editan el contenido de la página.',
      profiles: 'Perfiles',
      seizureSafe: 'Seguro para Convulsiones',
      visionImpaired: 'Discapacidad Visual',
      adhdFriendly: 'Amigable con TDAH',
      motorImpaired: 'Discapacidad Motriz',
      language: 'Idioma',
      langToggleLabel: 'Selector de idioma',
      textSize: 'Tamaño del Texto',
      decreaseTextSize: 'Disminuir tamaño del texto',
      reset: 'Restablecer',
      increaseTextSize: 'Aumentar tamaño del texto',
      display: 'Pantalla',
      highContrast: 'Alto Contraste',
      grayscale: 'Escala de Grises',
      underlineLinks: 'Subrayar Enlaces',
      highlightLinks: 'Resaltar Enlaces',
      highlightHeadings: 'Resaltar Títulos',
      reduceMotion: 'Reducir Movimiento',
      reading: 'Lectura',
      dyslexiaFont: 'Fuente para Dislexia',
      lineSpacing: 'Espaciado de Línea y Letra',
      pointer: 'Cursor',
      largeCursor: 'Cursor Grande',
      resetAll: 'Restablecer Todo'
    }
  };
  const t = (key) => STR[LANG][key];

  function loadState(){
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY)) || {};
    } catch(e){
      return {};
    }
  }
  function saveState(state){
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(e){ /* ignore */ }
  }
  let state = Object.assign({
    top: null,             // vertical drag position in px; null = default (centered)
    textScale: 100,        // percent
    highContrast: false,
    underlineLinks: false,
    reduceMotion: false,
    dyslexiaFont: false,
    lineSpacing: false,
    grayscale: false,
    bigCursor: false,
    highlightLinks: false,
    highlightHeadings: false
  }, loadState());

  const PROFILE_ICONS = {
    seizure: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
    vision: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    adhd: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2a4.5 4.5 0 0 0-4.4 5.5A4 4 0 0 0 4 15a4 4 0 0 0 3 6.5c1.4 0 2.6-.7 3.3-1.8"/><path d="M14.5 2a4.5 4.5 0 0 1 4.4 5.5A4 4 0 0 1 20 15a4 4 0 0 1-3 6.5c-1.4 0-2.6-.7-3.3-1.8"/><path d="M9.5 2v18"/></svg>',
    motor: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M6 14v-2a2 2 0 0 0-4 0v3a8 8 0 0 0 8 8h1a8 8 0 0 0 8-8v-3"/></svg>'
  };

  const CONTROL_ICONS = {
    contrast: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/></svg>',
    grayscale: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z"/></svg>',
    underline: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 20h16"/></svg>',
    highlightLinks: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 3 6 6-9.5 9.5L4 20l1.5-7.5Z"/><path d="m13 5 6 6"/></svg>',
    highlightHeadings: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16"/><path d="M14 4v16"/><path d="M4 12h10"/><path d="M18 16v-4a2 2 0 0 1 4 0v4"/><path d="M18 16h4"/></svg>',
    motion: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 9v6"/><path d="M14 9v6"/></svg>',
    dyslexia: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18 8 6l5 12"/><path d="M4.5 14h7"/><circle cx="17" cy="15" r="3"/><path d="M20 9v9"/></svg>',
    spacing: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><path d="M20 3v3"/><path d="M20 15v3"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l7.07 17.5 2.51-6.92L20.5 11.5Z"/></svg>'
  };

  // ---- Build markup ----
  // The minimized tab is the only always-visible control, draggable along
  // the left edge. The drawer is appended to <body> as its own top-level
  // element (not nested inside the tab) since a `transform` on an ancestor
  // turns `position:fixed` descendants into being positioned relative to
  // that ancestor instead of the viewport, which broke the drawer's layout
  // when it was nested this way.
  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.id = 'a11yTab';
  tabBtn.setAttribute('aria-haspopup', 'dialog');
  tabBtn.setAttribute('aria-expanded', 'false');
  tabBtn.setAttribute('aria-controls', 'a11yPanel');
  tabBtn.setAttribute('aria-label', t('accessibilityOptions'));
  tabBtn.innerHTML = '<img src="assets/icons8-accessibility-48.png" alt="" aria-hidden="true">';
  document.body.appendChild(tabBtn);

  const backdrop = document.createElement('div');
  backdrop.id = 'a11yBackdrop';

  const panelEl = document.createElement('div');
  panelEl.className = 'a11y-panel';
  panelEl.id = 'a11yPanel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-modal', 'false');
  panelEl.setAttribute('aria-labelledby', 'a11yPanelTitle');
  panelEl.hidden = true;
  panelEl.innerHTML = `
      <button type="button" class="a11y-close" id="a11yClose" aria-label="${t('closePanel')}">&times;</button>
      <h2 id="a11yPanelTitle">${t('accessibility')}</h2>
      <p class="a11y-sub">${t('intro')}</p>

      <div class="a11y-group">
        <button type="button" class="a11y-group-toggle" id="a11yProfilesToggle" aria-expanded="false" aria-controls="a11yProfiles">
          ${t('profiles')} <span class="a11y-group-toggle-chevron" aria-hidden="true">&#9662;</span>
        </button>
        <div class="a11y-profiles" id="a11yProfiles" hidden>
          <button type="button" class="a11y-profile-btn" id="a11yProfileSeizure">
            <span class="a11y-profile-icon" aria-hidden="true">${PROFILE_ICONS.seizure}</span>${t('seizureSafe')}
          </button>
          <button type="button" class="a11y-profile-btn" id="a11yProfileVision">
            <span class="a11y-profile-icon" aria-hidden="true">${PROFILE_ICONS.vision}</span>${t('visionImpaired')}
          </button>
          <button type="button" class="a11y-profile-btn" id="a11yProfileAdhd">
            <span class="a11y-profile-icon" aria-hidden="true">${PROFILE_ICONS.adhd}</span>${t('adhdFriendly')}
          </button>
          <button type="button" class="a11y-profile-btn" id="a11yProfileMotor">
            <span class="a11y-profile-icon" aria-hidden="true">${PROFILE_ICONS.motor}</span>${t('motorImpaired')}
          </button>
        </div>
      </div>

      <div class="a11y-group">
        <span class="a11y-group-label">${t('language')}</span>
        <div class="a11y-lang-toggle" id="a11yLangToggle" role="group" aria-label="${t('langToggleLabel')}">
          ${LANG === 'es'
            ? `<a href="${otherLangHref()}" data-lang="en">EN</a><span class="active" data-lang="es">ES</span>`
            : `<span class="active" data-lang="en">EN</span><a href="${otherLangHref()}" data-lang="es">ES</a>`}
        </div>
      </div>

      <div class="a11y-group">
        <span class="a11y-group-label">${t('textSize')}</span>
        <div class="a11y-row">
          <button type="button" class="a11y-btn" id="a11yTextDown" aria-label="${t('decreaseTextSize')}">A&minus;</button>
          <button type="button" class="a11y-btn" id="a11yTextReset" aria-label="${t('reset')}">${t('reset')}</button>
          <button type="button" class="a11y-btn" id="a11yTextUp" aria-label="${t('increaseTextSize')}">A+</button>
        </div>
      </div>

      <div class="a11y-group">
        <span class="a11y-group-label">${t('display')}</span>
        <div class="a11y-icon-grid">
          <button type="button" class="a11y-icon-toggle" id="a11yContrast" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.contrast}</span>${t('highContrast')}
          </button>
          <button type="button" class="a11y-icon-toggle" id="a11yGrayscale" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.grayscale}</span>${t('grayscale')}
          </button>
          <button type="button" class="a11y-icon-toggle" id="a11yUnderline" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.underline}</span>${t('underlineLinks')}
          </button>
          <button type="button" class="a11y-icon-toggle" id="a11yHighlightLinks" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.highlightLinks}</span>${t('highlightLinks')}
          </button>
          <button type="button" class="a11y-icon-toggle" id="a11yHighlightHeadings" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.highlightHeadings}</span>${t('highlightHeadings')}
          </button>
          <button type="button" class="a11y-icon-toggle" id="a11yMotion" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.motion}</span>${t('reduceMotion')}
          </button>
        </div>
      </div>

      <div class="a11y-group">
        <span class="a11y-group-label">${t('reading')}</span>
        <div class="a11y-icon-grid">
          <button type="button" class="a11y-icon-toggle" id="a11yDyslexia" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.dyslexia}</span>${t('dyslexiaFont')}
          </button>
          <button type="button" class="a11y-icon-toggle" id="a11ySpacing" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.spacing}</span>${t('lineSpacing')}
          </button>
        </div>
      </div>

      <div class="a11y-group">
        <span class="a11y-group-label">${t('pointer')}</span>
        <div class="a11y-icon-grid">
          <button type="button" class="a11y-icon-toggle" id="a11yCursor" aria-pressed="false">
            <span class="a11y-icon-toggle-icon" aria-hidden="true">${CONTROL_ICONS.cursor}</span>${t('largeCursor')}
          </button>
        </div>
      </div>

      <button type="button" class="a11y-reset" id="a11yResetAll">${t('resetAll')}</button>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(panelEl);

  const panel = document.getElementById('a11yPanel');
  const closeBtn = document.getElementById('a11yClose');
  const profilesToggle = document.getElementById('a11yProfilesToggle');
  const profilesBody = document.getElementById('a11yProfiles');

  const BOOL_CONTROLS = [
    ['highContrast', 'a11yContrast', 'a11y-high-contrast'],
    ['grayscale', 'a11yGrayscale', 'a11y-grayscale'],
    ['underlineLinks', 'a11yUnderline', 'a11y-underline-links'],
    ['highlightLinks', 'a11yHighlightLinks', 'a11y-highlight-links'],
    ['highlightHeadings', 'a11yHighlightHeadings', 'a11y-highlight-headings'],
    ['reduceMotion', 'a11yMotion', 'a11y-reduce-motion'],
    ['dyslexiaFont', 'a11yDyslexia', 'a11y-dyslexia-font'],
    ['lineSpacing', 'a11ySpacing', 'a11y-line-spacing'],
    ['bigCursor', 'a11yCursor', 'a11y-big-cursor']
  ];

  // ---- Apply current state to the page ----
  function applyState(){
    // The site's typography is set in px, not rem, so scaling the root
    // font-size has no visible effect. `zoom` scales the whole page the
    // same way the browser's own zoom does, which does move text size.
    document.documentElement.style.zoom = state.textScale + '%';
    BOOL_CONTROLS.forEach(([key, btnId, cls]) => {
      document.documentElement.classList.toggle(cls, !!state[key]);
      document.getElementById(btnId).setAttribute('aria-pressed', String(!!state[key]));
    });
    if(state.top !== null){
      tabBtn.style.top = state.top + 'px';
      tabBtn.style.transform = 'none';
    }
  }
  applyState();

  // ---- Drag range for the tab (only used while the drawer is closed) ----
  function dragRange(){
    const margin = 12;
    const tabHeight = tabBtn.offsetHeight;
    const minTop = margin;
    const maxTop = Math.max(minTop, window.innerHeight - tabHeight - margin);
    return { minTop, maxTop };
  }

  // ---- Drawer open/close with focus management. The drawer slides in
  // from the left and fills with real space, so the tab itself is hidden
  // while it's open and only reappears once it's closed again. ----
  let lastFocused = null;
  function openPanel(){
    lastFocused = document.activeElement;
    panel.hidden = false;
    backdrop.hidden = false;
    // Force a reflow so the slide-in transition always plays, even if the
    // drawer was just re-shown from `hidden`.
    void panel.offsetWidth;
    panel.classList.add('open');
    backdrop.classList.add('open');
    tabBtn.classList.add('a11y-tab-tucked');
    tabBtn.setAttribute('aria-expanded', 'true');
    const firstFocusable = panel.querySelector('button');
    if(firstFocusable) firstFocusable.focus();
    document.addEventListener('keydown', onPanelKeydown);
    backdrop.addEventListener('click', closePanel);
  }
  function closePanel(){
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    tabBtn.classList.remove('a11y-tab-tucked');
    tabBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onPanelKeydown);
    backdrop.removeEventListener('click', closePanel);
    window.setTimeout(() => {
      if(!panel.classList.contains('open')){
        panel.hidden = true;
        backdrop.hidden = true;
      }
    }, 350);
    if(lastFocused) lastFocused.focus();
    else tabBtn.focus();
  }
  function onPanelKeydown(e){
    if(e.key === 'Escape'){
      e.preventDefault();
      closePanel();
      return;
    }
    if(e.key === 'Tab'){
      const focusables = Array.from(panel.querySelectorAll('button:not([hidden])'));
      if(focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if(e.shiftKey && document.activeElement === first){
        e.preventDefault();
        last.focus();
      } else if(!e.shiftKey && document.activeElement === last){
        e.preventDefault();
        first.focus();
      }
    }
  }

  // ---- Drag (vertical only, left edge fixed) vs. click-to-open.
  // Dragging only applies while the drawer is closed, since the tab is
  // hidden entirely once it's open. ----
  let dragging = false;
  let dragMoved = false;
  let startY = 0;
  let startTop = 0;
  let range = { minTop: 12, maxTop: 12 };

  tabBtn.addEventListener('pointerdown', (e) => {
    if(!panel.hidden) return;
    dragging = true;
    dragMoved = false;
    startY = e.clientY;
    startTop = tabBtn.getBoundingClientRect().top;
    range = dragRange();
    tabBtn.setPointerCapture(e.pointerId);
  });
  tabBtn.addEventListener('pointermove', (e) => {
    if(!dragging) return;
    const delta = e.clientY - startY;
    if(Math.abs(delta) > 4) dragMoved = true;
    let newTop = startTop + delta;
    newTop = Math.max(range.minTop, Math.min(range.maxTop, newTop));
    tabBtn.style.top = newTop + 'px';
    tabBtn.style.transform = 'none';
  });
  function endDrag(){
    if(!dragging) return;
    dragging = false;
    if(dragMoved){
      state.top = tabBtn.getBoundingClientRect().top;
      saveState(state);
    } else {
      openPanel();
    }
  }
  tabBtn.addEventListener('pointerup', endDrag);
  tabBtn.addEventListener('pointercancel', endDrag);

  // Keyboard users never fire pointer drag events, so Enter/Space must still open the panel.
  tabBtn.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      openPanel();
    }
  });

  closeBtn.addEventListener('click', closePanel);

  // ---- Profiles dropdown: collapsed until the header is clicked ----
  profilesToggle.addEventListener('click', () => {
    const isOpen = profilesToggle.getAttribute('aria-expanded') === 'true';
    profilesToggle.setAttribute('aria-expanded', String(!isOpen));
    profilesToggle.classList.toggle('is-open', !isOpen);
    profilesBody.hidden = isOpen;
  });

  // ---- Language toggle inside the panel: the active side is a plain
  // span (you're already there), the other side is a real link to this
  // page's other-language URL, wired up directly in the template above. ----

  // ---- Controls ----
  document.getElementById('a11yTextUp').addEventListener('click', () => {
    state.textScale = Math.min(160, state.textScale + 10);
    saveState(state);
    applyState();
  });
  document.getElementById('a11yTextDown').addEventListener('click', () => {
    state.textScale = Math.max(80, state.textScale - 10);
    saveState(state);
    applyState();
  });
  document.getElementById('a11yTextReset').addEventListener('click', () => {
    state.textScale = 100;
    saveState(state);
    applyState();
  });
  BOOL_CONTROLS.forEach(([key, btnId]) => {
    document.getElementById(btnId).addEventListener('click', () => {
      state[key] = !state[key];
      saveState(state);
      applyState();
    });
  });
  document.getElementById('a11yResetAll').addEventListener('click', () => {
    state.textScale = 100;
    BOOL_CONTROLS.forEach(([key]) => { state[key] = false; });
    saveState(state);
    applyState();
  });

  // ---- Profiles: one click applies a preset combination of the controls
  // above. Each profile is a simple, well-known preset rather than a new
  // effect of its own. ----
  const PROFILES = {
    a11yProfileSeizure: { reduceMotion:true, grayscale:true },
    a11yProfileVision: { highContrast:true, underlineLinks:true, textScale:140 },
    a11yProfileAdhd: { dyslexiaFont:true, lineSpacing:true, reduceMotion:true, highlightHeadings:true },
    a11yProfileMotor: { bigCursor:true, underlineLinks:true, highlightLinks:true }
  };
  Object.keys(PROFILES).forEach(id => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.addEventListener('click', () => {
      const preset = PROFILES[id];
      const isActive = btn.classList.contains('active');
      if(isActive){
        // Toggling the same profile off just resets everything.
        state.textScale = 100;
        BOOL_CONTROLS.forEach(([key]) => { state[key] = false; });
      } else {
        BOOL_CONTROLS.forEach(([key]) => { state[key] = false; });
        Object.keys(preset).forEach(key => { state[key] = preset[key]; });
        if(!('textScale' in preset)) state.textScale = 100;
      }
      Object.keys(PROFILES).forEach(otherId => {
        document.getElementById(otherId)?.classList.toggle('active', otherId === id && !isActive);
      });
      saveState(state);
      applyState();
    });
  });

  window.addEventListener('resize', () => {
    if(state.top === null) return;
    const { minTop, maxTop } = dragRange();
    if(state.top < minTop || state.top > maxTop){
      state.top = Math.max(minTop, Math.min(state.top, maxTop));
      saveState(state);
      applyState();
    }
  });
})();
