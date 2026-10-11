(() => {
  'use strict';

  const head = document.querySelector('.head');
  if (!head) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layers = [];
  let pointer = null;
  let frame = 0;
  let lastTime = 0;
  let gazeX = 0;
  let gazeY = 0;

  // Eye interiors in the original PNG coordinates. The eyelashes and lower
  // eyelids remain outside these masks, so only the pupils move.
  const artwork = [
    {
      selector: '.head__closed',
      eyes: [
        { x: 205, y: 262, rx: 12, ry: 14,
          aperture: 'M175 267 C178 257 194 249 205 252 C215 251 223 259 226 265 L220 272 Q200 276 179 272 Z' },
        { x: 320, y: 251, rx: 12, ry: 15,
          aperture: 'M290 257 C296 244 310 239 322 240 C334 240 341 244 344 249 L334 261 Q319 267 304 262 Z' }
      ]
    },
    {
      selector: '.head__open',
      eyes: [
        { x: 189, y: 153, rx: 11, ry: 14,
          aperture: 'M160 157 C167 146 181 139 191 142 C200 142 205 148 208 154 L202 162 Q185 168 169 162 Z' },
        { x: 286, y: 140, rx: 11, ry: 14,
          aperture: 'M258 146 C266 132 279 128 290 129 C299 129 305 134 307 138 L299 150 Q283 157 273 152 Z' }
      ]
    }
  ];

  function install(spec) {
    const image = head.querySelector(spec.selector);
    if (!image || !image.naturalWidth) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.setAttribute('aria-hidden', 'true');
    const wrapper = document.createElement('span');
    wrapper.className = image.className + ' head__gaze';
    wrapper.style.cssText = image.style.cssText;
    image.before(wrapper);
    wrapper.append(image, canvas);
    image.className = 'head__gaze-original';
    image.removeAttribute('style');

    const patch = document.createElement('canvas');
    patch.width = 70;
    patch.height = 50;
    const patchCtx = patch.getContext('2d');
    const eyes = spec.eyes.map((eye) => ({ ...eye, mask: new Path2D(eye.aperture) }));
    layers.push({ image, canvas, ctx, wrapper, eyes, patch, patchCtx });
    render();
  }

  function render() {
    layers.forEach(({ image, canvas, ctx, eyes, patch, patchCtx }) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      // At rest show the exact original artwork, including its hand-drawn pupils.
      if (Math.abs(gazeX) + Math.abs(gazeY) < 0.01) return;
      eyes.forEach((eye) => {
        // Compose the patch first, then clip once to avoid seams at the lids.
        patchCtx.fillStyle = '#ededed';
        patchCtx.fillRect(0, 0, 70, 50);
        patchCtx.fillStyle = '#000';
        patchCtx.beginPath();
        patchCtx.ellipse(35 + gazeX * 7, 25 + gazeY * 3,
          eye.rx, eye.ry, 0, 0, Math.PI * 2);
        patchCtx.fill();
        ctx.save();
        ctx.clip(eye.mask);
        ctx.drawImage(patch, eye.x - 35, eye.y - 25);
        ctx.restore();
      });
    });
  }

  function target() {
    if (!pointer || reduced.matches || document.hidden) return { x: 0, y: 0 };
    const layer = layers.find(({ wrapper }) =>
      wrapper.classList.contains(head.classList.contains('is-open') ? 'head__open' : 'head__closed'));
    if (!layer) return { x: 0, y: 0 };
    const rect = layer.wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const [left, right] = layer.eyes;
    const cx = rect.left + (left.x + right.x) / 2 / layer.canvas.width * rect.width;
    const cy = rect.top + (left.y + right.y) / 2 / layer.canvas.height * rect.height;
    const dx = (pointer.x - cx) / (rect.width * 0.8);
    const dy = (pointer.y - cy) / (rect.width * 0.8);
    const length = Math.max(1, Math.hypot(dx, dy));
    return { x: dx / length, y: dy / length };
  }

  function animate(time) {
    frame = 0;
    const next = target();
    const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
    lastTime = time;
    const ease = 1 - Math.exp(-dt / 65);
    gazeX += (next.x - gazeX) * ease;
    gazeY += (next.y - gazeY) * ease;
    const settled = Math.abs(next.x - gazeX) + Math.abs(next.y - gazeY) < 0.002;
    if (settled) { gazeX = next.x; gazeY = next.y; }
    render();
    if (!settled) frame = requestAnimationFrame(animate);
    else lastTime = 0;
  }

  function update() {
    if (!frame && layers.length) frame = requestAnimationFrame(animate);
  }
  function reset() { pointer = null; update(); }

  artwork.forEach((spec) => {
    const image = head.querySelector(spec.selector);
    if (!image) return;
    if (image.complete) install(spec);
    else image.addEventListener('load', () => install(spec), { once: true });
  });
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || reduced.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    update();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('scroll', update, { passive: true });
  head.addEventListener('transitionend', update);
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      pointer = null;
      gazeX = gazeY = 0;
      render();
    }
    update();
  });
})();
