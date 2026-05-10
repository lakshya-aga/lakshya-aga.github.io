/* Fourier "Lakshya" hero animation.
 * Loads precomputed coefficients (100 vectors) and renders rotating epicycles
 * that trace the word over time. Drops back to a static text fallback if
 * the JSON can't load or canvas is unavailable. */
(function () {
  const mount = document.getElementById('fourier-hero');
  if (!mount) return;

  // Respect user's reduced-motion preference: render a static path instead.
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  fetch('assets/fourier-agarwal.json')
    .then((r) => r.json())
    .then((data) => init(data))
    .catch(() => {
      mount.classList.add('fallback');
    });

  function init(data) {
    const coefs = data.coefs.slice().sort((a, b) => b.amp - a.amp);
    const bb = data.bbox;
    const dataW = bb.maxX - bb.minX;
    const dataH = bb.maxY - bb.minY;

    const colors = {};
    function refreshColors() {
      const cs = getComputedStyle(document.documentElement);
      colors.trail = cs.getPropertyValue('--fourier-trail').trim() || '#c8a96e';
      colors.arm = cs.getPropertyValue('--fourier-arm').trim() || 'rgba(78,168,222,0.30)';
      colors.circle = cs.getPropertyValue('--fourier-circle').trim() || 'rgba(200,169,110,0.18)';
      colors.glow = cs.getPropertyValue('--fourier-glow').trim() || 'rgba(200,169,110,0.55)';
    }
    refreshColors();
    document.addEventListener('themechange', refreshColors);

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Fourier series animation tracing the name Lakshya');
    canvas.setAttribute('role', 'img');
    mount.appendChild(canvas);
    mount.classList.add('ready');

    const ctx = canvas.getContext('2d');
    let dpr = 1;
    let viewW = 0;
    let viewH = 0;
    let scale = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = mount.getBoundingClientRect();
      viewW = Math.max(rect.width, 320);
      // keep aspect ratio close to the data, but cap height
      const ratio = dataH / dataW;
      viewH = Math.max(120, Math.min(rect.height || (viewW * ratio * 1.4), viewW * 0.5));
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
      canvas.style.width = viewW + 'px';
      canvas.style.height = viewH + 'px';
      // scale to fit data bounding box with padding
      const padX = viewW * 0.04;
      const padY = viewH * 0.10;
      scale = Math.min((viewW - 2 * padX) / dataW, (viewH - 2 * padY) / dataH);
    }
    resize();
    window.addEventListener('resize', resize);

    // Trail (the traced curve). We accumulate points across one full cycle,
    // then fade out as a new cycle begins.
    let trail = [];
    const TRAIL_MAX = 4000;

    // Animation timing — one full sweep over CYCLE seconds.
    const CYCLE = 10;
    let startTs = null;
    let lastTs = null;
    let pauseAfterCycles = 1;
    let cyclesDone = 0;
    let phase = 'drawing'; // 'drawing' | 'paused' | 'erasing' | 'redraw'
    let pauseStart = 0;

    // Pre-compute parts that don't change per frame.
    const aFreqs = new Float32Array(coefs.length);
    const aRe = new Float32Array(coefs.length);
    const aIm = new Float32Array(coefs.length);
    for (let i = 0; i < coefs.length; i++) {
      aFreqs[i] = coefs[i].freq;
      aRe[i] = coefs[i].re;
      aIm[i] = coefs[i].im;
    }

    // Compute pen position at parameter t in [0, 2π).
    // Sum of all coefficients: z(t) = Σ (re + i·im) · e^(i·freq·t)
    // dataToScreen handles the y flip; do not flip here.
    function penAt(t) {
      let x = 0, y = 0;
      for (let i = 0; i < coefs.length; i++) {
        const angle = aFreqs[i] * t;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        x += aRe[i] * cos - aIm[i] * sin;
        y += aRe[i] * sin + aIm[i] * cos;
      }
      return [x, y];
    }

    // Build rotating epicycle chain at parameter t. Returns array of joints,
    // ordered by descending amplitude (largest first so chain is stable).
    function chainAt(t) {
      const joints = new Array(coefs.length + 1);
      let x = 0, y = 0;
      joints[0] = [x, y];
      for (let i = 0; i < coefs.length; i++) {
        const angle = aFreqs[i] * t;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = aRe[i] * cos - aIm[i] * sin;
        const dy = aRe[i] * sin + aIm[i] * cos;
        x += dx;
        y += dy;
        joints[i + 1] = [x, y];
      }
      return joints;
    }

    function dataToScreen(p) {
      return [
        viewW / 2 + p[0] * scale,
        viewH / 2 - p[1] * scale,
      ];
    }

    function drawEpicycles(joints) {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Faint connecting arms
      ctx.strokeStyle = colors.arm;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const first = dataToScreen(joints[0]);
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < joints.length; i++) {
        const p = dataToScreen(joints[i]);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();

      // Faint circles for each epicycle (only for the ~20 biggest, to reduce noise)
      ctx.strokeStyle = colors.circle;
      ctx.lineWidth = 0.7;
      const N = Math.min(joints.length - 1, 28);
      for (let i = 0; i < N; i++) {
        const center = dataToScreen(joints[i]);
        const tip = dataToScreen(joints[i + 1]);
        const r = Math.hypot(tip[0] - center[0], tip[1] - center[1]);
        if (r < 0.6) continue;
        ctx.beginPath();
        ctx.arc(center[0], center[1], r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Pen tip
      const tip = dataToScreen(joints[joints.length - 1]);
      ctx.fillStyle = colors.trail;
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    function drawTrail() {
      if (trail.length < 2) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = colors.trail;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const p0 = dataToScreen(trail[0]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < trail.length; i++) {
        const p = dataToScreen(trail[i]);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.restore();
    }

    function frame(now) {
      if (startTs === null) {
        if (firstFrame) {
          // Start halfway through the first cycle so the trail looks
          // already underway on initial paint. Pre-populate the trail
          // with samples covering t=0..π so the first half of the word
          // is visible immediately.
          startTs = now - (CYCLE * 1000) / 2;
          const HALF = 800;
          for (let i = 0; i < HALF; i++) {
            const tt = (i / (HALF * 2)) * Math.PI * 2;
            trail.push(penAt(tt));
          }
          firstFrame = false;
        } else {
          startTs = now;
        }
      }
      lastTs = now;
      const elapsed = (now - startTs) / 1000;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine the parameter t and trail accumulation
      let t = 0;
      if (phase === 'drawing') {
        const u = (elapsed % CYCLE) / CYCLE;
        t = u * Math.PI * 2;
        const cycleIndex = Math.floor(elapsed / CYCLE);
        if (cycleIndex !== cyclesDone) {
          cyclesDone = cycleIndex;
          phase = 'paused';
          pauseStart = elapsed;
          trail = []; // reset trail; freeze final outline
          frozenAt = elapsed;
        }
      } else if (phase === 'paused') {
        // Hold the final reconstruction for a moment, then start over
        t = Math.PI * 2 - 0.0001;
        if (elapsed - pauseStart > 2.5) {
          phase = 'drawing';
          startTs = now - (now - now); // reset clock for next cycle
          startTs = now;
          cyclesDone = 0;
          trail = [];
        }
      }

      const joints = chainAt(t);
      const pen = joints[joints.length - 1];

      // Append to trail unless we're paused
      if (phase === 'drawing') {
        trail.push(pen);
        if (trail.length > TRAIL_MAX) trail.shift();
      }

      drawTrail();
      if (phase === 'drawing') {
        drawEpicycles(joints);
      } else if (phase === 'paused') {
        // Draw the reconstructed full curve only (no arms)
        drawFullReconstruction();
      }

      raf = requestAnimationFrame(frame);
    }

    // Pre-render the entire reconstruction as a static path (used during pause).
    let fullPathCache = null;
    function drawFullReconstruction() {
      if (!fullPathCache) {
        const M = 1600;
        const pts = new Array(M);
        for (let i = 0; i < M; i++) {
          const t = (i / M) * Math.PI * 2;
          pts[i] = penAt(t);
        }
        fullPathCache = pts;
      }
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = colors.trail;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const p0 = dataToScreen(fullPathCache[0]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < fullPathCache.length; i++) {
        const p = dataToScreen(fullPathCache[i]);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    let frozenAt = 0;
    let raf = null;
    let firstFrame = true;

    if (reduceMotion) {
      // Static render: draw the full reconstruction once and stop.
      requestAnimationFrame(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawFullReconstruction();
      });
    } else {
      raf = requestAnimationFrame(frame);
    }

    // Pause animation when offscreen to save CPU.
    let visible = true;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target !== mount) continue;
        visible = e.isIntersecting;
        if (visible && raf == null && !reduceMotion) {
          startTs = null;
          raf = requestAnimationFrame(frame);
        }
        if (!visible && raf != null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      }
    }, { threshold: 0.05 });
    io.observe(mount);
  }
})();
