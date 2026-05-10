/* Shared site interactions: nav toggle, scroll reveal, active nav link, theme toggle */
(function () {
  // Theme toggle. Persists to localStorage; an inline script in <head>
  // applies the saved choice before first paint to avoid theme flash.
  const root = document.documentElement;
  function applyTheme(t) {
    if (t === 'light') root.classList.add('light');
    else root.classList.remove('light');
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  }
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = root.classList.contains('light') ? 'dark' : 'light';
      try { localStorage.setItem('theme', next); } catch (e) {}
      applyTheme(next);
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  document.querySelectorAll('.project-card').forEach((card, i) => {
    card.style.transitionDelay = (i * 0.05) + 's';
  });

  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Mark current page in nav
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
    if (a.getAttribute('data-page').toLowerCase() === path) a.classList.add('active');
  });

  // Expose observer so page scripts can re-observe newly inserted elements
  window.__siteRevealObserver = observer;
})();
