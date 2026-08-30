// Category filtering, with the chosen filter and scroll position
// remembered in sessionStorage (same pattern as the blog grid on
// resources.html) so a visitor who opens a tool and then uses this
// page's own "Back to All Tools & Templates" link lands exactly back
// where they left off, not back at a reset "All" view.
(function(){
  const tabsWrap = document.getElementById('toolsCategoryTabs');
  const sections = Array.from(document.querySelectorAll('.tools-directory-section'));
  const emptyMsg = document.getElementById('toolsDirectoryEmpty');

  const FILTER_KEY = 'toolsDirectoryFilter';
  const SCROLL_KEY = 'toolsDirectoryScroll';
  const VISITED_KEY = 'toolsDirectoryVisited';

  let activeCategory = 'all';
  try { activeCategory = sessionStorage.getItem(FILTER_KEY) || 'all'; } catch(e){}

  function applyFilters(){
    let anyVisible = false;

    sections.forEach(section => {
      let sectionHasVisible = false;
      section.querySelectorAll('.tool-tile').forEach(tile => {
        const visible = activeCategory === 'all' || tile.dataset.category === activeCategory;
        tile.style.display = visible ? '' : 'none';
        if(visible) sectionHasVisible = true;
      });
      section.hidden = !sectionHasVisible;
      if(sectionHasVisible) anyVisible = true;
    });

    emptyMsg.style.display = anyVisible ? 'none' : 'block';
  }

  const savedTab = tabsWrap.querySelector(`button[data-cat="${activeCategory}"]`);
  if(savedTab){
    tabsWrap.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
    savedTab.classList.add('is-active');
  }
  applyFilters();

  try {
    const savedScroll = sessionStorage.getItem(SCROLL_KEY);
    if(savedScroll !== null){
      sessionStorage.removeItem(SCROLL_KEY);
      requestAnimationFrame(() => window.scrollTo(0, parseInt(savedScroll, 10) || 0));
    }
  } catch(e){}

  tabsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    tabsWrap.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeCategory = btn.dataset.cat;
    try { sessionStorage.setItem(FILTER_KEY, activeCategory); } catch(e){}
    applyFilters();
  });

  // Record scroll position and a "came from the directory" flag right
  // before a tile navigates away, so the calculator/template page's
  // back link can point here (worded accordingly) and this page can
  // restore the visitor's exact spot when they use it.
  document.querySelectorAll('.tool-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        sessionStorage.setItem(VISITED_KEY, '1');
      } catch(e){}
    });
  });
})();
