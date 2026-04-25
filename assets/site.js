/* Shared site interactions: nav toggle, scroll reveal, active nav link */
(function () {
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
