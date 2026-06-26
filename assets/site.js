/* Shared site interactions: theme toggle, active nav, sticky-bar shadow, soft reveal. */
(function () {
  const root = document.documentElement;

  function applyTheme(t) {
    if (t === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  }

  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = root.classList.contains('dark') ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (e) {}
      applyTheme(next);
    });
  });

  // Sticky top bar gets a thin border once the page has scrolled.
  const topbar = document.getElementById('topbar');
  if (topbar) {
    const onScroll = () => {
      if (window.scrollY > 2) topbar.classList.add('scrolled');
      else topbar.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mark current page in topbar.
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.topbar a').forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href === path) a.classList.add('active');
  });

  // Lightweight reveal: any .reveal element fades in once 10% visible.
  // Kept as a no-op fallback so old pages keep animating tastefully.
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('fade-in');
        reveal.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));
  window.__siteRevealObserver = reveal;
})();
