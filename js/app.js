(() => {
  'use strict';

  const SITE = window.SITE || { contacts: {}, cases: [] };
  const CASES = SITE.cases;
  const N = CASES.length;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mod = (n, m) => ((n % m) + m) % m;
  const pad = (n) => String(n).padStart(2, '0');
  // номер кейса как в макете: «О1» (буква О вместо нуля)
  const caseNum = (n) => (n < 10 ? 'О' + n : String(n));

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMq = matchMedia('(max-width: 900px), (max-aspect-ratio: 1/1)');
  const isMobile = () => mobileMq.matches;

  // 1u — «пиксель макета», те же формулы, что и в CSS
  const unit = () => (isMobile() ? innerWidth / 390 : Math.min(innerWidth / 1440, innerHeight / 800));
  const curtainUnit = () => (isMobile() ? innerWidth / 640 : unit());

  const pages = {
    about: $('#page-about'),
    cases: $('#page-cases'),
    case: $('#page-case'),
  };

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ============================================================
     Ссылки: почта, телеграм, CV
     ============================================================ */

  function initLinks() {
    const c = SITE.contacts || {};
    $$('[data-link]').forEach((a) => {
      const key = a.dataset.link;
      let href = String(c[key] || '').trim();
      if (!href) {
        a.removeAttribute('href');
        a.classList.add('is-empty');
        a.setAttribute('aria-disabled', 'true');
        return;
      }
      // почта — самим адресом, телеграм — «тг: @ник»
      if (key === 'email') {
        a.textContent = href.replace(/^mailto:/i, '');
        if (!/^mailto:/i.test(href)) href = 'mailto:' + href;
      }
      if (key === 'telegram') {
        const nick = href.replace(/^https?:\/\/(t|telegram)\.me\//i, '').replace(/^@?/, '@');
        a.textContent = `тг: ${nick}`;
        href = `https://t.me/${nick.slice(1)}`;
      }
      a.href = href;
      if (key === 'cv' && !/^https?:/i.test(href)) {
        a.setAttribute('download', c.cvName || '');
      } else if (key !== 'email') {
        a.target = '_blank';
        a.rel = 'noopener';
      }
    });
  }

  /* ============================================================
     Типографика: предлоги и союзы не висят в конце строки
     ============================================================ */

  const NBSP = '\u00A0';
  const SHORT = 'а|в|во|и|к|ко|о|об|обо|с|со|у|на|не|ни|но|по|до|из|за|от|для|без|над|под|при|про|или|да';
  const reShort = new RegExp(`(?<=^|[\\s(«"„'])(${SHORT}) +`, 'giu');

  function typo(str) {
    if (!str) return '';
    return String(str)
      .replace(reShort, `$1${NBSP}`) // «в каждом», «и рисую» — короткое слово держится за следующее
      .replace(/ +(?=[—–·] )/g, NBSP) // тире и «·» не начинают строку
      .replace(/(\d) +(?=[a-zа-яё])/giu, `$1${NBSP}`); // «2025 финалист», «3,5 года»
  }

  // всё, что уже есть в разметке
  function typoPage(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement || n.parentElement.closest('script, style')) continue;
      const t = typo(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  }

  // чем нажали в последний раз: мышью, пальцем или пером (для тапов на телефоне)
  let lastPointer = 'mouse';
  document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);

  /* ============================================================
     Смена текста с анимацией (номер кейса, название, роль)
     ============================================================ */

  const swapTokens = new WeakMap();

  function swapText(el, text, dir, big) {
    text = typo(text);
    const token = {};
    swapTokens.set(el, token);
    el.getAnimations().forEach((a) => a.cancel());
    if (!dir || reduced.matches) {
      el.textContent = text;
      return;
    }
    // цифры не обрезаются: старая растворяется, сдвигаясь, новая проявляется с другой стороны
    const d = big ? 16 : 60;
    const out = el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translateY(${dir * d}%)`, opacity: 0 },
      ],
      { duration: big ? 170 : 150, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
    );
    out.finished
      .then(() => {
        if (swapTokens.get(el) !== token) return;
        el.textContent = text;
        out.cancel();
        el.animate(
          [
            { transform: `translateY(${-dir * d}%)`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: big ? 420 : 320, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
      })
      .catch(() => {});
  }

  /* ============================================================
     Бумажка-подсказка (одна на всю страницу): навыки в голове и карточки опыта
     ============================================================ */

  const Note = (() => {
    const el = $('.note');
    const kicker = $('.note__kicker', el);
    const title = $('.note__title', el);
    const role = $('.note__role', el);
    const text = $('.note__text', el);
    const list = $('.note__list', el);
    const extra = $('.note__extra', el);
    const extraLabel = $('.note__extra-label', el);
    const extraText = $('.note__extra-text', el);
    let owner = null;
    let onHide = null;

    function fill(d) {
      kicker.textContent = typo(d.kicker);
      kicker.hidden = !d.kicker;
      title.textContent = typo(d.title);
      role.textContent = typo(d.role);
      role.hidden = !d.role;
      text.textContent = typo(d.text);
      text.hidden = !d.text;
      list.innerHTML = '';
      (d.points || []).forEach((p) => {
        const li = document.createElement('li');
        li.textContent = typo(p);
        list.append(li);
      });
      list.hidden = !list.children.length;
      extraLabel.textContent = d.extra ? `${d.extra.label}:` : '';
      extraText.textContent = d.extra ? typo(d.extra.text) : '';
      extra.hidden = !d.extra;
    }

    // side — сбоку от предмета, наружу от центра around; above — над строкой
    function place(anchor, mode, around) {
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const gap = Math.max(10, 16 * unit());
      const m = 10;
      let x;
      let y;
      if (mode === 'side') {
        const ar = (around || anchor).getBoundingClientRect();
        const toLeft = r.left + r.width / 2 < ar.left + ar.width / 2;
        x = toLeft ? r.left - gap - w : r.right + gap;
        y = r.top + r.height / 2 - h / 2;
        // сбоку не помещается (телефон) — над предметом, а если и там нет места — под ним
        if (x < m || x + w > innerWidth - m) {
          x = r.left + r.width / 2 - w / 2;
          y = r.top - gap - h;
          if (y < m) y = r.bottom + gap;
        }
      } else {
        x = r.left - 8;
        y = r.top - gap - h;
        if (y < m) y = r.bottom + gap;
      }
      el.style.left = `${clamp(x, m, innerWidth - w - m)}px`;
      el.style.top = `${clamp(y, m, innerHeight - h - m)}px`;
    }

    function show(anchor, data, opts = {}) {
      if (owner && owner !== anchor && onHide) onHide();
      owner = anchor;
      onHide = opts.onHide || null;
      fill(data);
      el.classList.toggle('is-wide', !!opts.wide);
      el.style.setProperty('--rot', `${opts.tilt || 0}deg`);
      el.classList.remove('is-on');
      place(opts.at || anchor, opts.mode || 'above', opts.around);
      void el.offsetWidth; // перезапуск анимации, если переходим с одного на другое
      el.classList.add('is-on');
    }

    // без аргумента — спрятать любую; с anchor — только если показана для него
    function hide(anchor) {
      if (anchor && anchor !== owner) return;
      if (onHide) onHide();
      owner = null;
      onHide = null;
      el.classList.remove('is-on');
    }

    // крестик — ещё один способ закрыть бумажку
    $('.note__close', el).addEventListener('click', () => hide());

    window.addEventListener('scroll', () => hide(), { passive: true });
    window.addEventListener('resize', () => hide());

    return { show, hide, owns: (anchor) => owner === anchor };
  })();

  /* ============================================================
     Девушка: при наведении шапка взлетает, видно, что в голове
     ============================================================ */

  const Head = (() => {
    const head = $('.head');
    const hit = $('.head__hit');
    const DATA = SITE.head || {};
    const TILT = [-4, 3, -2, 4, -3, 2, -5, 3];

    let open = false;
    let pinned = false; // открыта кликом — не закрывается, когда мышь уходит
    let leaveTimer = 0;
    let readyTimer = 0;

    // предметы с подписью из content.js; у остальных подписи нет
    const items = $$('.head__item[data-note]').filter((el) => {
      const ok = !!DATA[el.dataset.note];
      if (!ok) el.removeAttribute('data-note');
      return ok;
    });

    function showNote(el) {
      const d = DATA[el.dataset.note];
      if (!d || !open) return;
      el.classList.add('is-active');
      Note.show(
        el,
        { title: d.title, text: d.text, extra: d.also ? { label: 'А ещё', text: d.also } : null },
        { mode: 'side', around: head, tilt: Number(el.dataset.tilt), onHide: () => el.classList.remove('is-active') }
      );
    }

    function set(v) {
      if (open === v) return;
      open = v;
      clearTimeout(readyTimer);
      if (v) {
        // предметы можно наводить, когда они почти долетели
        readyTimer = setTimeout(() => head.classList.add('is-ready'), 650);
      } else {
        pinned = false;
        head.classList.remove('is-ready');
        items.forEach((el) => Note.hide(el));
      }
      head.classList.toggle('is-open', v);
      pages.about.classList.toggle('is-open', v);
      hit.setAttribute('aria-pressed', String(v));
      items.forEach((el) => { el.tabIndex = v ? 0 : -1; });
    }

    items.forEach((el, k) => {
      const d = DATA[el.dataset.note];
      el.dataset.tilt = String(TILT[k % TILT.length]);
      el.setAttribute('aria-label', [d.title, d.text, d.also && `А ещё: ${d.also}`].filter(Boolean).join('. '));
      el.tabIndex = -1;
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showNote(el); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') Note.hide(el); });
      el.addEventListener('focus', () => showNote(el));
      el.addEventListener('blur', () => Note.hide(el));
      // на телефоне — по тапу
      el.addEventListener('click', () => {
        if (lastPointer === 'mouse') return;
        if (Note.owns(el)) Note.hide(el);
        else showNote(el);
      });
    });

    // мышь: навела на девушку — открылось, увела — закрылось
    head.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(leaveTimer);
      set(true);
    });
    head.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse' || pinned) return;
      if (e.relatedTarget && head.contains(e.relatedTarget)) return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => set(false), 180);
    });

    // клик по девушке: открыть и закрепить; повторный клик — закрыть
    hit.addEventListener('click', (e) => {
      if (e.detail === 0 || lastPointer !== 'mouse') {
        if (open) set(false);
        else {
          set(true);
          pinned = true;
        }
        return;
      }
      if (open && !pinned) pinned = true;
      else if (open) set(false);
      else {
        set(true);
        pinned = true;
      }
    });

    // клик/тап мимо девушки закрывает
    document.addEventListener('pointerdown', (e) => {
      if (open && !head.contains(e.target) && !e.target.closest('.note') && (pinned || e.pointerType !== 'mouse')) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) {
        set(false);
        hit.focus({ preventScroll: true });
      }
    });

    return { close: () => set(false) };
  })();

  /* ============================================================
     Логотип-призма (компьютер): грани плавно поворачиваются по скроллу
     ============================================================ */

  (() => {
    const prism = $('.logo3d__prism');
    if (!prism) return;
    const STEP = 120; // три грани
    let angle = 0;
    let target = 0;
    let raf = 0;
    let idle = 0;

    function tick() {
      angle += (target - angle) * 0.12;
      if (Math.abs(target - angle) < 0.05) angle = target;
      prism.style.setProperty('--ry', `${(-angle).toFixed(2)}deg`);
      raf = angle !== target ? requestAnimationFrame(tick) : 0;
    }
    const run = () => { if (!raf) raf = requestAnimationFrame(tick); };

    window.addEventListener('wheel', (e) => {
      if (isMobile() || reduced.matches) return;
      let d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (e.deltaMode === 1) d *= 32;
      turn(clamp(d, -120, 120) * 0.3);
    }, { passive: true });

    function turn(deg) {
      target += deg;
      // перестали крутить — доворачиваем до ближайшей грани
      clearTimeout(idle);
      idle = setTimeout(() => { target = Math.round(target / STEP) * STEP; run(); }, 160);
      run();
    }
  })();

  /* ============================================================
     Меню на телефоне: бургер открывает экран с разделами
     ============================================================ */

  const MobileMenu = (() => {
    const btn = $('.burger');
    const box = $('.mmenu');
    let open = false;

    function set(v) {
      if (open === v) return;
      open = v;
      root.classList.toggle('is-menu', v);
      btn.setAttribute('aria-expanded', String(v));
      btn.setAttribute('aria-label', v ? 'Закрыть меню' : 'Меню');
      box.setAttribute('aria-hidden', String(!v));
      if (!v) setTimeout(() => { if (!open) items.forEach((b) => b.classList.remove('is-picked')); }, 300);
    }

    const items = $$('.mmenu__item', box);
    btn.addEventListener('click', () => set(!open));
    // у выбранного пункта выезжает стрелка; меню закрывается, когда новый раздел уже под плашкой
    items.forEach((a) => a.addEventListener('click', (e) => {
      items.forEach((b) => b.classList.toggle('is-picked', b === a));
      if (a.getAttribute('href') === location.hash) {
        e.preventDefault();
        setTimeout(() => set(false), 380);
      }
    }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    mobileMq.addEventListener('change', () => set(false));

    return { close: () => set(false) };
  })();

  /* ============================================================
     Опыт: при наведении на компанию — карточка, что я там делала
     ============================================================ */

  const Experience = (() => {
    const DATA = SITE.experience || [];
    const buttons = [];

    function showCard(btn, d) {
      btn.classList.add('is-active');
      Note.show(
        btn,
        {
          kicker: [d.type, d.period].filter(Boolean).join(' · '),
          title: d.name,
          role: d.role,
          text: d.lead,
          points: d.points,
          extra: d.ai ? { label: 'ИИ', text: d.ai } : null,
        },
        {
          mode: 'above',
          at: btn.closest('.fact') || btn, // над всем блоком «Опыт», чтобы не закрывать список
          wide: true,
          tilt: Number(btn.dataset.tilt),
          onHide: () => btn.classList.remove('is-active'),
        }
      );
    }

    $$('.js-exp').forEach((ul) => {
      ul.innerHTML = '';
      DATA.forEach((d, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'exp';
        btn.textContent = [d.type, d.name].filter(Boolean).join(' ');
        btn.dataset.tilt = String(i % 2 ? 1.2 : -1.2);
        btn.setAttribute(
          'aria-label',
          [btn.textContent, d.role, d.period, d.lead, (d.points || []).join(', '), d.ai && `ИИ: ${d.ai}`]
            .filter(Boolean)
            .join('. ')
        );
        btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showCard(btn, d); });
        btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') Note.hide(btn); });
        btn.addEventListener('focus', () => showCard(btn, d));
        btn.addEventListener('blur', () => Note.hide(btn));
        btn.addEventListener('click', () => {
          if (lastPointer === 'mouse') return;
          if (Note.owns(btn)) Note.hide(btn);
          else showCard(btn, d);
        });
        li.append(btn);
        ul.append(li);
        buttons.push(btn);
      });
    });

    // тап мимо — спрятать карточку
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!buttons.some((b) => b.contains(e.target))) buttons.forEach((b) => Note.hide(b));
    });
  })();

  /* ============================================================
     Кейсы: лента. Новые появляются сверху, по скроллу уезжают вниз в стопку
     ============================================================ */

  const Carousel = (() => {
    const page = pages.cases;
    const wrap = $('.cases__cards', page);
    const numEl = $('[data-cases-num]', page);
    const titleEl = $('[data-cases-title]', page);
    const roleEl = $('[data-cases-role]', page);
    const doneEl = $('[data-cases-done]', page);
    const doneField = $('[data-cases-done-field]', page);
    // телефон: название и описание под обложкой
    const capTitleEl = $('[data-cases-captitle]', page);
    const capInfoEl = $('[data-cases-capinfo]', page);
    const capEl = $('.cases__cap', page);
    // описание у кейсов разной длины — обложка подстраивается под новую высоту подписи
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (active && !raf && isMobile()) layout(); }).observe(capEl);
    }

    // место карточки в ленте p: 1 — следующая (сверху справа), 0 — текущая, −1 и −2 — стопка внизу.
    // [центр X, центр Y, размер, поворот] — координаты макета 1440×800
    const DESK = {
      '-3': [455.0, 1112.0, 258.77, 2.98],
      '-2': [509.18, 853.48, 258.77, 2.98],
      '-1': [561.0, 814.48, 258.77, 2.98],
      0: [762.99, 445.03, 333.66, 2.98],
      1: [1019.34, -15.99, 258.77, 2.98],
      2: [1275.7, -477.0, 258.77, 2.98],
      3: [1532.0, -938.0, 258.77, 2.98],
    };
    // телефон: места считаются от экрана — текущая обложка встаёт между номером сверху и подписью снизу,
    // следующая выглядывает из правого верхнего угла, предыдущая — из левого нижнего
    function mobKeys(W, H) {
      const top = numEl.parentElement.getBoundingClientRect().bottom + 18;
      const bottom = capEl.getBoundingClientRect().top - 18;
      const size = clamp(Math.min(0.64 * W, (bottom - top) * 0.92), 0.36 * W, 0.64 * W);
      const cy = (top + bottom) / 2;
      const sm = 0.4 * W;
      return {
        '-3': [-0.7 * W, H + 0.7 * W, sm, 2.98],
        '-2': [-0.35 * W, H + 0.35 * W, sm, 2.98],
        '-1': [-0.07 * W, H + 0.07 * W, sm, -4],
        0: [0.5 * W, cy, size, 2.98],
        1: [0.97 * W, 0.04 * H + 0.06 * W, sm, 6],
        2: [1.35 * W, -0.35 * W, sm, 2.98],
        3: [1.75 * W, -0.75 * W, sm, 2.98],
      };
    }

    const STEP = 380; // px колеса на один кейс

    let cards = [];
    let t = 0;
    let target = 0;
    let tau = 120;
    let raf = 0;
    let last = 0;
    let active = false;
    let shown = -1;
    let gesture = null;
    let idle = 0;
    let touch = null;
    let intro = 0; // время старта вступительной анимации (0 — не идёт)
    const INTRO_MS = 2000;
    const ease = (x) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
    const easeIO = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

    function offset(i) {
      let p = mod(i - t, N);
      if (p > N - 3) p -= N;
      return p;
    }

    function key(K, p) {
      p = clamp(p, -3, 3);
      const lo = Math.max(-3, Math.min(2, Math.floor(p)));
      const f = p - lo;
      const a = K[lo];
      const b = K[lo + 1];
      return a.map((v, j) => v + (b[j] - v) * f);
    }

    function build() {
      wrap.innerHTML = '';
      cards = CASES.map((c, i) => {
        const a = document.createElement('a');
        a.className = 'card';
        a.href = `#/cases/${i + 1}`;
        a.setAttribute('aria-label', `Кейс ${pad(i + 1)}: ${c.title}`);
        const inner = document.createElement('span');
        inner.className = 'card__in';
        if (c.cover) {
          const img = new Image();
          img.src = c.cover;
          img.alt = '';
          img.decoding = 'async';
          inner.append(img);
        } else {
          inner.innerHTML = `<span class="ph-note">${caseNum(i + 1)} — обложка</span>`;
        }
        a.append(inner);
        a.addEventListener('click', (e) => {
          // не текущая карточка — подкручиваем ленту к ней
          if (Math.abs(offset(i)) > 0.5) {
            e.preventDefault();
            goTo(i);
          }
        });
        wrap.append(a);
        return a;
      });
      numEl.parentElement.dataset.total = '/' + pad(N);
    }

    function layout() {
      if (!N) return;
      const W = innerWidth;
      const H = innerHeight;
      const mob = isMobile();
      const u = unit();
      const base = mob ? 0.66 * W : 333.66 * u;
      const MOB = mob ? mobKeys(W, H) : null;

      const now = performance.now();
      const e = intro ? now - intro : 0;
      cards.forEach((el, i) => {
        let p = offset(i);
        // вступление: сначала все карточки плотной стопкой-каскадом вверху справа на диагонали,
        // потом каскад съезжает вниз по диагонали, замедляется и раздвигается — карточки встают по местам
        if (intro) {
          const k = ease((e - 80) / 1350);
          p = p * (0.3 + 0.7 * k) + 1.5 * (1 - k);
        }
        let cx, cy, size, rot;
        if (mob) {
          const k = key(MOB, p);
          cx = k[0]; cy = k[1]; size = k[2]; rot = k[3];
        } else {
          const k = key(DESK, p);
          cx = (k[0] / 1440) * W; cy = H / 2 + (k[1] - 400) * u; size = k[2] * u; rot = k[3];
        }
        rot += Math.sin(p * Math.PI) * 3.5; // лёгкий доворот в полёте
        const s = size / base;
        el.style.transform =
          `translate3d(${(cx - base / 2).toFixed(2)}px, ${(cy - base / 2).toFixed(2)}px, 0) ` +
          `rotate(${rot.toFixed(3)}deg) scale(${s.toFixed(4)})`;
        el.style.zIndex = String(Math.round(60 - p * 10));
        el.style.setProperty('--shade', (clamp(-p - 1, 0, 1) * 0.11).toFixed(3));
        const cur = Math.abs(p) < 0.5;
        el.classList.toggle('is-current', cur);
        el.tabIndex = cur ? 0 : -1;
        el._geo = { cx, cy, size, rot };
      });
      // блюр номера и текста: сильнее всего на середине перехода между кейсами, резко — когда лента встала
      let blur = clamp(Math.abs(t - Math.round(t)) * 2.4, 0, 1);
      let show = 1;
      if (intro) {
        // номер и текст появляются последними: бледные и размытые, потом резкие
        blur = Math.max(blur, 1 - ease((e - 1050) / 750));
        show = ease((e - 900) / 600);
      }
      page.style.setProperty('--mbk', blur.toFixed(3));
      page.style.setProperty('--mop', show.toFixed(3));
      updateInfo(false);
    }

    function updateInfo(force) {
      const idx = mod(Math.round(t), N);
      if (idx === shown && !force) return;
      const dir = force || shown < 0 ? 0 : mod(idx - shown, N) <= N / 2 ? 1 : -1;
      shown = idx;
      const c = CASES[idx];
      swapText(numEl, caseNum(idx + 1), dir, true);
      swapText(titleEl, c.title, dir);
      swapText(roleEl, c.roleShort || c.role, dir);
      doneField.classList.toggle('is-empty', !c.doneShort);
      swapText(doneEl, c.doneShort || '', dir);
      swapText(capTitleEl, c.title, dir);
      const capRole = c.roleShort || c.role;
      swapText(capInfoEl, [c.kind, capRole && `Роль: ${capRole}`].filter(Boolean).join('\n'), dir);
    }

    function run() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    function tick(now) {
      const dt = Math.min(64, now - last);
      last = now;
      t += (target - t) * (1 - Math.exp(-dt / tau));
      if (Math.abs(target - t) < 0.0005) {
        t = target;
        tau = 120;
      }
      if (intro && now - intro > INTRO_MS) intro = 0;
      layout();
      raf = t !== target || intro ? requestAnimationFrame(tick) : 0;
    }

    function step(d) {
      tau = 120;
      target = Math.round(target) + d;
      run();
    }

    function goTo(i) {
      tau = 120;
      const cur = Math.round(target);
      let d = mod(i - cur, N);
      if (d > N / 2) d -= N;
      target = cur + d;
      run();
    }

    function settle() {
      if (!gesture) return;
      const { from } = gesture;
      gesture = null;
      const delta = target - from;
      let to;
      if (Math.abs(delta) < 0.06) to = from;
      else if (delta > 0) to = Math.max(from + 1, Math.ceil(target - 0.3));
      else to = Math.min(from - 1, Math.floor(target + 0.3));
      target = to;
      run();
    }

    function onWheel(e) {
      if (!active || booting) return;
      e.preventDefault();
      if (Nav.busy) return;
      let d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (e.deltaMode === 1) d *= 32;
      else if (e.deltaMode === 2) d *= innerHeight;
      if (!gesture) gesture = { from: Math.round(target) };
      tau = 120;
      target = clamp(target + clamp(d, -240, 240) / STEP, gesture.from - 2, gesture.from + 2);
      clearTimeout(idle);
      idle = setTimeout(settle, 150);
      run();
    }

    function onTouchStart(e) {
      if (!active || e.touches.length > 1) return;
      const y = e.touches[0].clientY;
      touch = { y, t0: target, v: 0, ly: y, lt: performance.now(), moved: false };
    }

    function onTouchMove(e) {
      if (!touch) return;
      const y = e.touches[0].clientY;
      const dy = touch.y - y;
      if (!touch.moved && Math.abs(dy) < 6) return;
      touch.moved = true;
      e.preventDefault();
      const now = performance.now();
      touch.v = (touch.ly - y) / Math.max(1, now - touch.lt);
      touch.ly = y;
      touch.lt = now;
      tau = 90;
      target = touch.t0 + dy / (innerHeight * 0.45);
      run();
    }

    function onTouchEnd() {
      if (!touch) return;
      const { t0, v, moved } = touch;
      touch = null;
      if (!moved) return;
      const from = Math.round(t0);
      const delta = target - from;
      let to = from;
      if (Math.abs(v) > 0.3) to = from + Math.sign(v) * Math.max(1, Math.abs(Math.round(delta)));
      else if (Math.abs(delta) > 0.2) to = from + Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta)));
      tau = 140;
      target = to;
      run();
    }

    function onKey(e) {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || k === ' ') {
        e.preventDefault();
        step(1);
      } else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') {
        e.preventDefault();
        step(-1);
      } else if (k === 'Enter' && !(e.target instanceof HTMLAnchorElement)) {
        location.hash = `#/cases/${current() + 1}`;
      }
    }

    function current() {
      return mod(Math.round(target), N);
    }

    function activate(index) {
      active = true;
      if (typeof index === 'number') {
        t = target = index;
      }
      shown = -1;
      layout();
      updateInfo(true);
    }

    function deactivate() {
      active = false;
      gesture = null;
      touch = null;
      clearTimeout(idle);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      intro = 0;
      t = target = current();
      tau = 120;
    }

    // вступление при открытии ленты
    function playIntro() {
      if (!active || reduced.matches) return;
      intro = performance.now();
      gesture = null;
      t = target = Math.round(target);
      layout();
      run();
    }

    // карточки «падают» сверху на свои места
    function dropIn() {
      if (!active || reduced.matches) return;
      t = target - 0.45;
      tau = 260;
      layout();
      run();
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    page.addEventListener('touchstart', onTouchStart, { passive: true });
    page.addEventListener('touchmove', onTouchMove, { passive: false });
    page.addEventListener('touchend', onTouchEnd);
    page.addEventListener('touchcancel', onTouchEnd);

    return {
      build,
      layout,
      activate,
      deactivate,
      dropIn,
      playIntro,
      onKey,
      current,
      cardEl: (i) => cards[i],
      get active() { return active; },
    };
  })();

  /* ============================================================
     Кейс внутри
     ============================================================ */

  const CasePage = (() => {
    const page = pages.case;
    const el = {
      title: $('[data-case-title]', page),
      desc: $('[data-case-desc]', page),
      role: $('[data-case-role]', page),
      link: $('[data-case-link]', page),
      done: $('[data-case-done]', page),
      counter: $('[data-case-counter]', page),
      prev: $('[data-case-prev]', page),
      next: $('[data-case-next]', page),
      gallery: $('[data-case-gallery]', page),
    };
    let rendered = -1;

    function render(i) {
      if (rendered === i) return;
      rendered = i;
      const c = CASES[i];
      el.title.textContent = typo(c.title);
      el.desc.textContent = typo(c.description);
      el.role.textContent = typo(c.role);
      const done = Array.isArray(c.done) ? c.done.filter(Boolean) : [];
      el.done.innerHTML = '';
      done.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = typo(t);
        el.done.append(li);
      });
      el.done.closest('.case__text').classList.toggle('no-done', !done.length);

      if (c.link) {
        el.link.href = c.link;
        el.link.target = '_blank';
        el.link.rel = 'noopener';
        el.link.classList.remove('is-empty');
      } else {
        el.link.removeAttribute('href');
        el.link.classList.add('is-empty');
      }

      const prev = mod(i - 1, N);
      const next = mod(i + 1, N);
      el.counter.textContent = `Кейс ${pad(i + 1)} из ${pad(N)}:`;
      el.prev.href = `#/cases/${prev + 1}`;
      el.next.href = `#/cases/${next + 1}`;

      el.gallery.innerHTML = '';
      const images = Array.isArray(c.images) ? c.images.filter(Boolean) : [];
      if (images.length) {
        images.forEach((src, k) => {
          const fig = document.createElement('div');
          fig.className = 'case__shot';
          if (/\.(mp4|webm)$/i.test(src)) {
            // видео: играет без звука по кругу, как гифка
            const video = document.createElement('video');
            video.poster = src.replace(/\.\w+$/, '-poster.jpg');
            // на iPhone автозапуск работает, только если «без звука» и «в странице» стоят атрибутами
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.loop = true;
            video.autoplay = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.setAttribute('aria-label', `${c.title} — видео`);
            playVideo(video, src);
            fig.append(video);
            el.gallery.append(fig);
            return;
          }
          const img = new Image();
          if (c.radius) {
            // скругление в пикселях исходника → проценты, чтобы уменьшалось вместе с картинкой
            fig.classList.add('is-rounded');
            img.addEventListener('load', () => {
              fig.style.borderRadius =
                `${(c.radius / img.naturalWidth) * 100}% / ${(c.radius / img.naturalHeight) * 100}%`;
            }, { once: true });
          }
          img.src = src;
          img.alt = `${c.title} — изображение ${k + 1}`;
          img.decoding = 'async';
          if (k > 1) img.loading = 'lazy';
          fig.append(img);
          el.gallery.append(fig);
        });
      } else {
        for (let k = 0; k < 3; k++) {
          const ph = document.createElement('div');
          ph.className = 'case__shot case__shot--ph';
          ph.innerHTML = `<span class="ph-note">${caseNum(i + 1)} — картинка ${k + 1}</span>`;
          el.gallery.append(ph);
        }
      }
    }

    // Телефоны капризнее компьютера:
    // — если хостинг не отдаёт видео кусками, Safari его не играет — тогда скачиваем файл целиком и играем из памяти;
    // — если автозапуск запрещён (например, режим энергосбережения) — показываем кнопку «плей».
    function playVideo(video, src) {
      let local = false;
      const tryPlay = () => {
        const p = video.play();
        if (p) p.catch((err) => {
          if (err && err.name === 'NotAllowedError') video.controls = true;
          else if (!err || err.name !== 'AbortError') fromMemory();
        });
      };
      const fromMemory = () => {
        if (local) return;
        local = true;
        fetch(src)
          .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
          .then((blob) => {
            video.src = URL.createObjectURL(blob);
            tryPlay();
          })
          .catch(() => { video.controls = true; });
      };
      video.addEventListener('error', fromMemory);
      video.src = src;
      tryPlay();
    }

    // ждём первую картинку, чтобы знать её размер (не дольше timeout)
    function ready(timeout) {
      const img = $('img', el.gallery);
      if (!img || img.complete) return Promise.resolve();
      return Promise.race([
        new Promise((res) => { img.onload = img.onerror = res; }),
        sleep(timeout),
      ]);
    }

    return {
      render,
      ready,
      firstShot: () => el.gallery.firstElementChild,
    };
  })();

  /* ============================================================
     Переход между разделами: девушка двигает чёрную плашку
     ============================================================ */

  const Curtain = (() => {
    const box = $('.curtain');
    const move = $('.curtain__move', box);
    const title = $('.curtain__title', box);
    const girl = $('.curtain__girl', box);

    function slide(from, to, duration, easing) {
      const a = move.animate(
        [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
        { duration, easing, fill: 'forwards' }
      );
      return a.finished.then(() => a);
    }

    async function play(text, onCovered, onReveal) {
      title.textContent = text;
      const W = innerWidth;
      const u = curtainUnit();
      const mob = isMobile();
      const plateW = W + 200 * u;
      const anims = [];
      move.getAnimations().forEach((a) => a.cancel());
      box.classList.add('is-on');

      if (reduced.matches) {
        move.style.transform = 'translateX(0px)';
        await box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }).finished;
        onCovered();
        await sleep(380);
        if (onReveal) onReveal();
        await box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished;
        box.classList.remove('is-on');
        box.getAnimations().forEach((a) => a.cancel());
        move.style.transform = '';
        return;
      }

      // 1) плашка наезжает слева и закрывает страницу
      anims.push(await slide(-plateW, -200 * u, 520, 'cubic-bezier(.7,0,.25,1)'));
      onCovered();

      // 2) появляется девушка и толкает плашку
      const keyX = mob ? 0 : 360 * u;
      girl.classList.add('is-walking');
      anims.push(await slide(-200 * u, keyX, mob ? 380 : 660, 'cubic-bezier(.2,.75,.3,1)'));

      // 3) упирается — тяжело!
      girl.classList.replace('is-walking', 'is-straining');
      await sleep(mob ? 420 : 320);
      girl.classList.replace('is-straining', 'is-walking');

      // 4) выталкивает плашку за край — под ней новый раздел
      if (onReveal) onReveal();
      anims.push(await slide(keyX, W + 270.08 * u + 40 * u, mob ? 820 : 720, 'cubic-bezier(.55,0,.55,1)'));

      girl.classList.remove('is-walking');
      box.classList.remove('is-on');
      anims.forEach((a) => a.cancel());
    }

    return { play };
  })();

  /* ============================================================
     Превью загрузки: чёрный экран → девушка сдвигает его → логотип
     ============================================================ */

  let booting = true;

  function preload() {
    const srcs = [
      'assets/img/girl-push.svg',
      'assets/img/logo-lena.svg',
      'assets/img/logo-header.svg',
      ...$$('.head img').map((img) => img.getAttribute('src')),
    ];
    const images = srcs.map(
      (src) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = img.onerror = res;
          img.src = src;
        })
    );
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    return Promise.all([...images, fonts]);
  }

  async function playLoader(onReveal) {
    const box = $('.loader');
    if (!box) return;
    const move = $('.loader__move', box);
    const girl = $('.loader__girl', box);
    const logo = $('.loader__logo', box);

    await Promise.race([preload(), sleep(4000)]);
    await sleep(380);

    if (!reduced.matches) {
      const W = innerWidth;
      const u = curtainUnit();
      const keyX = isMobile() ? W * 0.55 : W / 2 - 71 * u;

      girl.classList.add('is-walking');
      const a1 = move.animate(
        [{ transform: 'translateX(0px)' }, { transform: `translateX(${keyX}px)` }],
        { duration: 1050, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'forwards' }
      );
      await a1.finished;

      girl.classList.replace('is-walking', 'is-straining');
      await sleep(340);
      girl.classList.replace('is-straining', 'is-walking');

      const a2 = move.animate(
        [{ transform: `translateX(${keyX}px)` }, { transform: `translateX(${W + 330 * u}px)` }],
        { duration: 780, easing: 'cubic-bezier(.55,0,.55,1)', fill: 'forwards' }
      );
      await a2.finished;
      girl.classList.remove('is-walking');
      await sleep(700);

      logo.animate(
        [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(.94)' }],
        { duration: 700, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
      );
    } else {
      move.style.opacity = '0';
      await sleep(600);
    }

    root.classList.add('is-intro');
    booting = false;
    // экран загрузки уезжает вниз, как шторка, — сайт открывается сверху, и одновременно стартует вступление
    if (onReveal) onReveal();
    const out = reduced.matches
      ? box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease', fill: 'forwards' })
      : box.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: 950, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' });
    await out.finished;
    box.remove();
    setTimeout(() => root.classList.remove('is-intro'), 1800);
  }

  /* ============================================================
     Навигация (адреса вида #/about, #/cases, #/cases/3, #/contacts)
     ============================================================ */

  const TITLES = { about: 'Обо мне', cases: 'Кейсы', contacts: 'Контакты' };
  const sectionOf = (r) => (r.page === 'case' ? 'cases' : r.page);

  const Nav = { busy: false, route: null };
  let queued = false;

  function parse() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'cases') {
      const n = parseInt(parts[1], 10);
      if (n >= 1 && n <= N) return { page: 'case', index: n - 1 };
      return { page: 'cases' };
    }
    if (parts[0] === 'contacts') return { page: 'contacts' };
    return { page: 'about' };
  }

  function show(r, listIndex) {
    const sec = sectionOf(r);
    const pageKey = r.page === 'contacts' ? 'about' : r.page;
    Object.entries(pages).forEach(([k, el]) => el.classList.toggle('is-active', k === pageKey));
    pages.about.classList.toggle('is-contacts', r.page === 'contacts');
    pages.about.classList.remove('is-revealed');
    root.dataset.route = r.page;
    root.dataset.section = sec;

    $$('.menu__item, .mmenu__item').forEach((a) => {
      const on = a.dataset.section === sec;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    Head.close();
    Note.hide();
    MobileMenu.close();
    if (r.page === 'case') CasePage.render(r.index);
    if (r.page === 'cases') {
      const prev = Nav.route;
      Carousel.activate(typeof listIndex === 'number' ? listIndex : prev && prev.page === 'case' ? prev.index : undefined);
    } else {
      Carousel.deactivate();
    }

    window.scrollTo(0, 0);
    document.title =
      r.page === 'case'
        ? `Кейс ${pad(r.index + 1)} — ${CASES[r.index].title} — Lena`
        : `${TITLES[r.page]} — Lena`;
    Nav.route = r;
  }

  // то, что оживает, когда раздел уже виден
  function reveal(r) {
    if (!r) return;
    if (r.page === 'contacts') {
      void pages.about.offsetWidth;
      pages.about.classList.add('is-revealed');
    }
    if (r.page === 'cases') Carousel.playIntro();
  }

  async function fade(el, from, to, duration) {
    const a = el.animate([{ opacity: from }, { opacity: to }], { duration, easing: 'ease', fill: 'forwards' });
    await a.finished;
    return a;
  }

  async function crossFade(r) {
    const main = $('main');
    const a = await fade(main, 1, 0, 220);
    show(r);
    a.cancel();
    await fade(main, 0, 1, 360).then((b) => b.cancel());
    reveal(r);
  }

  // из ленты в кейс: карточка перелетает на место первой картинки
  async function openFromList(i) {
    const card = Carousel.cardEl(i);
    const geo = card && card._geo;
    CasePage.render(i);
    await CasePage.ready(900);

    if (!geo || reduced.matches) {
      await crossFade({ page: 'case', index: i });
      return;
    }

    const clone = card.querySelector('.card__in').cloneNode(true);
    const from = {
      left: `${geo.cx - geo.size / 2}px`,
      top: `${geo.cy - geo.size / 2}px`,
      width: `${geo.size}px`,
      height: `${geo.size}px`,
      transform: `rotate(${geo.rot}deg)`,
    };
    Object.assign(clone.style, from, {
      position: 'fixed', right: 'auto', bottom: 'auto', margin: '0', zIndex: '60', transition: 'none',
    });
    document.body.append(clone);
    card.style.visibility = 'hidden';

    const listOut = await fade(pages.cases, 1, 0, 260);
    show({ page: 'case', index: i });
    listOut.cancel();
    card.style.visibility = '';

    const caseIn = pages.case.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
    const shot = CasePage.firstShot();
    const r = shot.getBoundingClientRect();
    // по пути обложка плавно превращается в первую картинку кейса
    const target = shot.matches('img') ? shot : shot.querySelector('img');
    if (target && target.src) {
      const next = new Image();
      next.src = target.src;
      next.alt = '';
      Object.assign(next.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', opacity: '0' });
      clone.append(next);
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 300, easing: 'ease', fill: 'forwards' });
    }
    await clone.animate(
      [
        from,
        { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, transform: 'rotate(0deg)' },
      ],
      { duration: 760, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }
    ).finished;

    caseIn.cancel();
    clone.remove();
  }

  // кейс → кейс (вперёд / назад)
  async function switchCase(from, to) {
    const dir = to === mod(from + 1, N) ? 1 : -1;
    const content = $('.case__content', pages.case);
    const info = $('.case__info', pages.case);
    if (reduced.matches) {
      await crossFade({ page: 'case', index: to });
      return;
    }
    const outs = [
      content.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 48}px)` }],
        { duration: 260, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
      ),
      info.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' }),
    ];
    await Promise.all(outs.map((a) => a.finished));
    show({ page: 'case', index: to });
    outs.forEach((a) => a.cancel());
    await Promise.all([
      content.animate(
        [{ opacity: 0, transform: `translateX(${dir * 48}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' }
      ).finished,
      info.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease' }).finished,
    ]);
  }

  // кейс → лента (на том же кейсе)
  async function backToList(i) {
    const out = await fade(pages.case, 1, 0, 240);
    show({ page: 'cases' }, i);
    out.cancel();
    Carousel.dropIn();
    await fade(pages.cases, 0, 1, 380).then((a) => a.cancel());
  }

  async function navigate() {
    if (Nav.busy) {
      queued = true;
      return;
    }
    const next = parse();
    const prev = Nav.route;
    if (prev && prev.page === next.page && prev.index === next.index) return;

    Nav.busy = true;
    try {
      if (!prev) {
        show(next);
      } else if (sectionOf(prev) !== sectionOf(next)) {
        await Curtain.play(TITLES[sectionOf(next)], () => show(next), () => reveal(next));
      } else if (prev.page === 'cases' && next.page === 'case') {
        await openFromList(next.index);
      } else if (prev.page === 'case' && next.page === 'case') {
        await switchCase(prev.index, next.index);
      } else if (prev.page === 'case' && next.page === 'cases') {
        await backToList(prev.index);
      } else {
        await crossFade(next);
      }
    } catch (err) {
      console.error(err);
      show(next);
    }
    Nav.busy = false;

    if (queued) {
      queued = false;
      navigate();
    }
  }

  /* ============================================================
     Клавиатура
     ============================================================ */

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || booting || Nav.busy) return;
    const r = Nav.route;
    if (!r) return;
    if (r.page === 'cases') {
      Carousel.onKey(e);
    } else if (r.page === 'case') {
      if (e.key === 'ArrowRight') location.hash = `#/cases/${mod(r.index + 1, N) + 1}`;
      else if (e.key === 'ArrowLeft') location.hash = `#/cases/${mod(r.index - 1, N) + 1}`;
      else if (e.key === 'Escape') location.hash = '#/cases';
    }
  });

  /* ============================================================
     Старт
     ============================================================ */

  initLinks();
  typoPage();
  Carousel.build();
  window.addEventListener('hashchange', navigate);
  window.addEventListener('resize', () => {
    if (Carousel.active) Carousel.layout();
  });
  navigate();
  playLoader(() => reveal(Nav.route));
})();
