/* MWP visual editor (Edit Mode).
   Opened with ?edit on index.html or he.html by a signed-in admin.
   Everything inside <div id="site"> can be selected, edited, styled, moved, added or deleted.
   Save publishes the page to Supabase (public.publish_page) and keeps every version. */
(async () => {
  'use strict';
  const M = window.MWP, root = M.root, PAGE = M.page, DOC = document.documentElement;
  const sb = window.supabase.createClient(M.cfg.url, M.cfg.key);
  const BUCKET = 'site-media';
  const HE = PAGE === 'he';
  const OTHER = HE ? {label: 'English', url: './?edit'} : {label: 'עברית', url: 'he.html?edit'};
  const VIEW_URL = location.pathname;

  // ---------- who is this? only admins may edit ----------
  const gate = msg => { document.body.innerHTML = `<div style="font:16px system-ui;padding:40px;color:#fff;background:#0A0908;min-height:100vh">${msg}</div>`; };
  const {data: {session}} = await sb.auth.getSession();
  if (!session) { location.href = 'admin.html?next=' + encodeURIComponent(location.pathname + '?edit'); return; }
  const {data: isAdmin, error: adminErr} = await sb.rpc('is_admin');
  if (adminErr || !isAdmin) { gate(`This account can’t edit the site. <a style="color:#F4AF56" href="admin.html">Go to the admin page</a>`); return; }

  // ---------- page styles while editing (affect the site itself) ----------
  const css = document.createElement('style');
  css.id = 'mwe-page-css';
  css.textContent = `
html.mwe-editing body{padding-top:52px}
html.mwe-editing.mwe-panel body{padding-right:340px}
html.mwe-editing body::after{display:none}
.mwe-editing #site{user-select:none;-webkit-user-select:none}
.mwe-editing #site,.mwe-editing #site *{cursor:default}
.mwe-editing #site [contenteditable]{user-select:text;-webkit-user-select:text;cursor:text;outline:none;caret-color:#2F80FF}
.mwe-editing #site [contenteditable] *{cursor:text}
.mwe-editing .intro{height:auto}
.mwe-editing .stage{position:relative;height:100vh}
.mwe-editing .stage canvas,.mwe-editing .veil,.mwe-editing .cue{display:none}
.mwe-editing .stage::after{opacity:1}
.mwe-editing .stage .photo{transform:none}
.mwe-editing .mark,.mwe-editing .corner{position:absolute;top:68px}
.mwe-editing .reel{height:auto}
.mwe-editing .reel-stage{position:relative;height:auto;display:block;overflow:visible;padding-block:clamp(96px,14vh,140px) 64px}
.mwe-editing .track{flex-wrap:wrap;align-items:flex-start;row-gap:40px;transform:none!important}
.mwe-editing .track .frame{width:min(460px,84vw)}
.mwe-editing .bar{display:none}
.mwe-editing .col{transform:none!important}
.mwe-editing .band img,.mwe-editing .tell .bg{transform:none!important}
.mwe-editing .mq{animation:none;flex-wrap:wrap;width:auto;row-gap:10px}
.mwe-editing .marquee{-webkit-mask:none;mask:none}
.mwe-editing .end>p{animation:none}
.mwe-editing [data-odo]::before{content:attr(data-odo)}
.mwe-editing #site :is(p,h1,h2,h3,h4,h5,h6,li,a,button,figcaption,label,b,strong):empty:not([aria-live]):not([data-odo]):not([data-sheet-credit])::before{content:"Empty text";opacity:.35}
.mwe-editing dialog.sheet,.mwe-editing dialog.doc{display:block;position:relative;inset:auto;width:auto;height:auto;max-width:none;max-height:none;margin:56px var(--gutter);overflow:visible;outline:2px dashed rgba(47,128,255,.55);outline-offset:6px;transform:none;animation:none}
.mwe-editing dialog.sheet::before,.mwe-editing dialog.doc::before{display:block;padding:12px clamp(20px,4vw,48px);font:600 12px/1.4 system-ui,sans-serif;letter-spacing:.04em;color:#9cc1ff;border-bottom:1px solid rgba(255,255,255,.1)}
.mwe-editing dialog.sheet::before{content:"POP-UP · Offer details (opens when a visitor clicks an offer in the Partner list)"}
.mwe-editing dialog.doc::before{content:"POP-UP · Terms, privacy and accessibility (opens from the footer links)"}
.mwe-editing .sheet-img,.mwe-editing .sheet-x{display:none}
.mwe-editing .sheet-body,.mwe-editing .doc-body{max-height:none;overflow:visible}
.mwe-editing [data-panel][hidden],.mwe-editing [data-doc-panel][hidden],.mwe-editing [data-credit][hidden]{display:block!important}
.mwe-editing [data-panel]+[data-panel],.mwe-editing [data-doc-panel]+[data-doc-panel]{margin-top:48px;padding-top:48px;border-top:1px dashed rgba(47,128,255,.45)}
.mwe-editing dialog.lb{display:none!important}
.mwe-editing [data-hide]{outline:1px dashed rgba(244,175,86,.7);outline-offset:3px}
.mwe-editing .blk-space{outline:1px dashed rgba(255,255,255,.25)}
`;
  document.head.appendChild(css);

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fmtTime = iso => new Date(iso).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
  const mainEl = () => $('main', root) || root;

  // ---------- icons used in the editor's own interface ----------
  const I = {
    up: '<path d="M7 17V7h10"/><path d="M7 7l10 10"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    text: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M3.5 17l5-5.5 4 4 2.5-2.5 5.5 5"/><circle cx="16" cy="9" r="1.4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7"/><path d="M4 4l16 16"/>',
    gear: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    page: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    eraser: '<path d="M4 20h16M7 16l-3-3 9-9 7 7-6 6H8z"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
  };
  const ico = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;

  // ---------- icons an admin can place on the page (same line style as the site) ----------
  const LIB = {
    camera: '<path d="M8.6 7.2l1.3-2.4h4.2l1.3 2.4"/><rect x="2.8" y="7.2" width="18.4" height="12.4" rx="2"/><circle cx="12" cy="13.3" r="3.7"/>',
    partners: '<circle cx="8.7" cy="12" r="6.3"/><circle cx="15.3" cy="12" r="6.3"/>',
    licence: '<circle cx="12" cy="12" r="9"/><path d="M14.9 9.4a4 4 0 1 0 0 5.2"/>',
    expedition: '<path d="M2.5 20l7-11.5 3.6 5.9 2.4-3.4L21.5 20z"/><path d="M9.5 8.5V3.6l3.4 1.3-3.4 1.3"/>',
    mountain: '<path d="M2.5 20l7-11.5 3.6 5.9 2.4-3.4L21.5 20z"/>',
    mic: '<rect x="9" y="2.8" width="6" height="11" rx="3"/><path d="M5.6 11.2a6.4 6.4 0 0 0 12.8 0M12 17.6v3.6M8.6 21.2h6.8"/>',
    print: '<path d="M8.6 8.4L12 4.4l3.4 4"/><rect x="3.4" y="8.4" width="17.2" height="12.4" rx=".6"/><path d="M5.8 18.4l4-4.6 2.8 3 1.9-2 3.7 3.6"/><circle cx="15.6" cy="11.9" r=".9"/>',
    image: I.image, video: I.video,
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    phone: '<path d="M5 3.5h3.5l1.8 4.5-2.3 1.5a11 11 0 0 0 6.5 6.5l1.5-2.3 4.5 1.8V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>',
    chat: '<path d="M4 5.5h16v10H9.5L4 19.5z"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.2 5.4-5.4 2.2 2.2-5.4z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5 19z"/><path d="M5 19l8-8"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3"/><circle cx="16.8" cy="9.3" r="2.6"/><path d="M16.5 14.3c2.4.2 4 1.8 4.5 4.6"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.4L7 21l5-2.7 5 2.7-1.6-7.6"/>',
    star: I.star,
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16.2 9.5"/>',
    arrow: '<path d="M4 12h15M13.5 6.5L19 12l-5.5 5.5"/>',
    send: '<path d="M21 4L3 11l7 2.5L12.5 21z"/><path d="M10 13.5L21 4"/>',
  };

  // ---------- media already in the website files ----------
  const BUILT_IN = {
    image: ['puma', 'towers', 'penguins', 'air-veins', 'fox', 'pair', 'air-braided', 'walker', 'serrated', 'kili', 'air-arbor', 'air-molten', 'craig', 'king', 'tree', 'peaks', 'zebras-xl', 'bluehour', 'lastlight', 'hall', 'chicks', 'field-gear', 'field-guide', 'field-team', 'reveal-gear', 'reveal-molten', 'reveal-team', 'reveal-guide', 'reveal-chicks', 'og']
      .map(n => `img/${n}.jpg`).concat(['ag', 'fox12', 'fstop', 'israelhayom', 'kan11-600', 'keshet12-600', 'news12', 'now14', 'polarpro', 'reshet13', 'rrs', 'sigma', 'smallrig', 'sony-600', 'ynet', 'zeneli'].map(n => `logos/${n}.webp`), ['video/ladakh-poster.jpg']),
    video: ['video/ladakh.mp4'],
  };

  // ---------- placeholder words for new blocks ----------
  const W = HE ? {
    label: 'תווית', heading: 'כותרת חדשה', bold: 'בהדגשה.', text: 'כתבו כאן פסקה קצרה. לחיצה כפולה על הטקסט כדי לערוך.', button: 'בואו נדבר', link: 'לקריאה נוספת',
    item: 'נקודה', caption: 'כיתוב לתמונה', section: 'מקטע חדש', col: 'עמודה',
  } : {
    label: 'Label', heading: 'A new headline', bold: 'in bold.', text: 'Write a short paragraph here. Double-click any text to edit it.', button: 'Get in touch', link: 'Read more',
    item: 'A point', caption: 'Photo caption', section: 'New section', col: 'Column',
  };
  const BLOCKS = {
    elements: [
      {key: 'heading', name: 'Big heading', html: `<h2 class="say">${W.heading} <b>${W.bold}</b></h2>`},
      {key: 'subheading', name: 'Heading', html: `<h3 class="blk-h3">${W.heading}</h3>`},
      {key: 'label', name: 'Small label', html: `<p class="kick">${W.label}</p>`},
      {key: 'intro', name: 'Intro text', html: `<p class="line">${W.text}</p>`},
      {key: 'para', name: 'Paragraph', html: `<p class="blk-text">${W.text}</p>`},
      {key: 'button', name: 'Button', html: `<a class="send blk-btn" href="#reach">${W.button}</a>`},
      {key: 'link', name: 'Text link', html: `<a class="go" href="#reach">${W.link}</a>`},
      {key: 'image', name: 'Image', html: `<figure class="blk-img"><img src="img/peaks.jpg" alt=""><figcaption>${W.caption}</figcaption></figure>`, pick: 'image'},
      {key: 'video', name: 'Video', html: `<figure class="blk-img"><video src="video/ladakh.mp4" poster="video/ladakh-poster.jpg" controls playsinline preload="metadata"></video></figure>`, pick: 'video'},
      {key: 'icon', name: 'Icon', html: `<svg class="blk-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${LIB.camera}</svg>`, pick: 'icon'},
      {key: 'list', name: 'List', html: `<ul class="ticks"><li>${W.item} 1</li><li>${W.item} 2</li><li>${W.item} 3</li></ul>`},
      {key: 'columns', name: 'Three columns', html: `<div class="blk-cols">${[1, 2, 3].map(n => `<div><p class="kick">${W.col} ${n}</p><p class="blk-text">${W.text}</p></div>`).join('')}</div>`},
      {key: 'divider', name: 'Divider line', html: `<hr class="blk-hr">`},
      {key: 'space', name: 'Empty space', html: `<div class="blk-space"></div>`},
    ],
    sections: [
      {key: 's-text', name: 'Text section', html: `<section class="blk wrap" data-sec><p class="kick fade">${W.section}</p><h2 class="say" data-split>${W.heading} <b>${W.bold}</b></h2><p class="line fade">${W.text}</p></section>`},
      {key: 's-two', name: 'Text + photo', html: `<section class="blk wrap" data-sec><div class="blk-two"><div class="fade"><p class="kick">${W.section}</p><h3 class="blk-h3">${W.heading}</h3><p class="blk-text">${W.text}</p><a class="send blk-btn" href="#reach">${W.button}</a></div><figure class="blk-img fade"><img src="img/peaks.jpg" alt=""></figure></div></section>`},
      {key: 's-gallery', name: 'Photo gallery', html: `<section class="blk wrap" data-sec><p class="kick fade">${W.section}</p><h2 class="say" data-split>${W.heading}</h2><div class="blk-gallery fade"><figure><img src="img/kili.jpg" alt=""></figure><figure><img src="img/king.jpg" alt=""></figure><figure><img src="img/tree.jpg" alt=""></figure></div></section>`},
      {key: 's-cover', name: 'Full photo with text', html: `<section class="create" data-sec><img src="img/zebras-xl.jpg" alt="" loading="lazy"><div class="wrap"><p class="kick fade">${W.section}</p><h2 class="say" data-split>${W.heading} <b>${W.bold}</b></h2><p class="line fade">${W.text}</p></div></section>`},
      {key: 's-band', name: 'Panorama', html: `<figure class="band" data-sec style="--ar:2.5"><img src="img/peaks.jpg" alt="" loading="lazy"><figcaption>${W.caption}</figcaption></figure>`},
      {key: 's-video', name: 'Video', html: `<section class="blk-video" data-sec><video src="video/ladakh.mp4" poster="video/ladakh-poster.jpg" muted loop autoplay playsinline preload="metadata"></video></section>`},
    ],
  };

  // =====================================================================
  // Editor interface (in a shadow root, so the site's styles don't touch it)
  // =====================================================================
  const host = h('div', {id: 'mwe-host'});
  document.body.appendChild(host);
  const ui = host.attachShadow({mode: 'open'});
  ui.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box}
.ui{font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d1d1f;direction:ltr}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
.top{position:fixed;z-index:2147483600;inset:0 0 auto 0;height:52px;display:flex;align-items:center;gap:6px;padding:0 12px;background:#fff;border-bottom:1px solid #e3e3e6;box-shadow:0 1px 8px rgba(0,0,0,.12)}
.brand{font-weight:700;margin-right:6px;white-space:nowrap}
.brand small{font-weight:500;color:#7a7a80;margin-left:6px}
.sep{width:1px;height:26px;background:#e3e3e6;margin:0 4px}
.tb{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:none;white-space:nowrap}
.tb:hover:not(:disabled){background:#f1f1f3}
.tb:disabled{opacity:.35;cursor:default}
.tb.on{background:#e8f0ff;color:#1a5fd6}
.tb.primary{background:#2F80FF;color:#fff;font-weight:600;padding:0 16px}
.tb.primary:hover:not(:disabled){background:#1e6ef0}
.grow{flex:1}
.status{color:#7a7a80;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.status.dirty{color:#b26b00}
.box{position:fixed;z-index:2147483400;pointer-events:none;border:1.5px solid #2F80FF;border-radius:2px;display:none}
.box.hov{border:1px dashed rgba(47,128,255,.85)}
.box.drop{border:0;background:#2F80FF;border-radius:2px;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.tag{position:absolute;left:-1.5px;top:-21px;padding:2px 7px;border-radius:4px 4px 0 0;background:#2F80FF;color:#fff;font-size:11px;font-weight:600;white-space:nowrap}
.box.hov .tag{background:rgba(47,128,255,.85)}
.bar{position:fixed;z-index:2147483500;display:none;align-items:center;gap:2px;padding:4px;border-radius:10px;background:#1d1d1f;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35)}
.bar button{display:inline-grid;place-items:center;min-width:32px;height:32px;padding:0 6px;border:0;border-radius:7px;background:none;color:#fff}
.bar button:hover{background:rgba(255,255,255,.14)}
.bar button.txt{padding:0 10px;font-weight:600}
.bar .grip{cursor:grab}
.bar .name{padding:0 8px 0 6px;font-weight:600;font-size:12px;color:#9cc1ff;white-space:nowrap}
.bar .vs{width:1px;height:20px;background:rgba(255,255,255,.18);margin:0 3px}
.panel{position:fixed;z-index:2147483550;top:52px;right:0;bottom:0;width:340px;display:none;flex-direction:column;background:#fff;border-left:1px solid #e3e3e6;box-shadow:-4px 0 18px rgba(0,0,0,.12)}
.panel.open{display:flex}
.ph{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eee}
.ph b{flex:1;font-size:14px}
.pb{flex:1;overflow:auto;padding:4px 14px 30px}
.crumbs{display:flex;flex-wrap:wrap;gap:4px;padding:10px 0 4px}
.crumbs button{border:1px solid #e3e3e6;background:#fafafa;border-radius:6px;padding:2px 7px;font-size:11px}
.crumbs button:last-child{background:#e8f0ff;border-color:#bcd3ff;color:#1a5fd6}
details{border-top:1px solid #eee;padding:2px 0}
details:first-of-type{border-top:0}
summary{cursor:pointer;padding:12px 0 8px;font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#55555a;list-style:none}
summary::-webkit-details-marker{display:none}
summary::after{content:"▸";float:right;color:#aaa}
details[open] summary::after{content:"▾"}
.f{display:grid;gap:5px;margin:0 0 12px}
.f>span{font-size:12px;font-weight:600;color:#3a3a3f}
.f>em{font-style:normal;font-size:11px;color:#86868b}
.row{display:flex;gap:6px;align-items:center}
.row>*{min-width:0}
input[type=text],input[type=url],input[type=number],select,textarea{width:100%;height:32px;padding:5px 8px;border:1px solid #d6d6db;border-radius:7px;background:#fff}
textarea{height:auto;min-height:80px;resize:vertical;line-height:1.45}
input[type=color]{width:38px;height:32px;padding:2px;border:1px solid #d6d6db;border-radius:7px;background:#fff;flex:none}
input[type=range]{flex:1}
input:focus,select:focus,textarea:focus{outline:2px solid #2F80FF;outline-offset:-1px;border-color:transparent}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid #d6d6db;border-radius:7px;background:#fff;font-weight:600;white-space:nowrap}
.btn:hover{background:#f4f4f6}
.btn.primary{background:#2F80FF;border-color:#2F80FF;color:#fff}
.btn.primary:hover{background:#1e6ef0}
.btn.danger{color:#c62828}
.btn.small{height:26px;padding:0 8px;font-size:12px}
.seg{display:flex;border:1px solid #d6d6db;border-radius:7px;overflow:hidden}
.seg button{flex:1;height:30px;border:0;border-right:1px solid #e3e3e6;background:#fff;font-size:12px}
.seg button:last-child{border-right:0}
.seg button.on{background:#e8f0ff;color:#1a5fd6;font-weight:600}
.thumb{width:100%;max-height:140px;object-fit:contain;background:#f1f1f3 repeating-conic-gradient(#e6e6e9 0 25%,#f4f4f6 0 50%) 0 0/16px 16px;border-radius:7px;border:1px solid #e3e3e6}
.media-row{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f2}
.media-row img,.media-row video{width:54px;height:40px;object-fit:cover;border-radius:5px;background:#eee;flex:none}
.media-row span{flex:1;font-size:11px;color:#6e6e73;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hint{font-size:12px;color:#6e6e73;margin:10px 0}
.outline-item{display:flex;align-items:center;gap:6px;padding:7px 4px;border-bottom:1px solid #f0f0f2}
.outline-item b{flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.outline-item b:hover{color:#1a5fd6}
.outline-item small{color:#9a9aa0}
.mask{position:fixed;inset:0;z-index:2147483640;display:grid;place-items:center;padding:20px;background:rgba(20,20,22,.5)}
.modal{width:min(560px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.modal.wide{width:min(960px,100%)}
.modal.full{width:min(1400px,100%);height:calc(100vh - 40px)}
.mh{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #eee}
.mh b{flex:1;font-size:16px}
.mb{flex:1;overflow:auto;padding:16px 18px}
.mf{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #eee;background:#fafafa}
.x{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:8px;background:none}
.x:hover{background:#f1f1f3}
.tabs{display:flex;gap:4px;margin-bottom:14px}
.tabs button{height:32px;padding:0 14px;border:1px solid #e3e3e6;border-radius:999px;background:#fff;font-weight:600}
.tabs button.on{background:#1d1d1f;border-color:#1d1d1f;color:#fff}
.dropzone{display:grid;place-items:center;gap:8px;padding:34px 16px;border:2px dashed #cfd2d8;border-radius:12px;text-align:center;color:#6e6e73}
.dropzone.over{border-color:#2F80FF;background:#f2f7ff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.grid button{display:grid;gap:4px;padding:6px;border:1px solid #e3e3e6;border-radius:9px;background:#fff;text-align:left;font-size:11px;color:#6e6e73;overflow:hidden}
.grid button:hover{border-color:#2F80FF}
.grid img,.grid video{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:#eee}
.grid span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:8px}
.icons button{display:grid;justify-items:center;gap:6px;padding:12px 4px 8px;border:1px solid #e3e3e6;border-radius:9px;background:#fff;font-size:11px;color:#6e6e73}
.icons button:hover{border-color:#2F80FF;color:#1a5fd6}
.icons svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;color:#1d1d1f}
.adds h4{margin:4px 0 10px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73}
.adds .icons{margin-bottom:20px}
.vrow{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;padding:12px 0;border-bottom:1px solid #f0f0f2}
.vrow .meta{font-size:12px;color:#6e6e73}
.vrow .live{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:#e5f6ea;color:#18794e;font-size:11px;font-weight:700}
.vrow .acts{display:flex;gap:6px;grid-row:span 2}
.toast{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:11px 16px;border-radius:10px;background:#1d1d1f;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.35);font-weight:500}
.toast button{border:0;background:none;color:#9cc1ff;font-weight:700}
.ghost{position:fixed;z-index:2147483646;pointer-events:none;padding:5px 9px;border-radius:6px;background:#2F80FF;color:#fff;font-size:12px;font-weight:600;transform:translate(12px,12px)}
.menu{position:fixed;z-index:2147483620;min-width:200px;padding:6px;border-radius:10px;background:#fff;border:1px solid #e3e3e6;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.menu button{display:flex;width:100%;align-items:center;gap:8px;padding:8px 10px;border:0;border-radius:7px;background:none;text-align:left}
.menu button:hover{background:#f1f1f3}
.frames{display:flex;justify-content:center;flex:1;background:#2a2a2d;padding:16px;overflow:auto}
.frames iframe{border:0;background:#0A0908;height:100%;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.4);transition:width .3s}
.spin{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.form-topic{border:1px solid #eee;border-radius:9px;padding:10px;margin-bottom:10px}
.form-topic b{display:block;margin-bottom:6px}
</style>
<div class="ui">
  <div class="top">
    <span class="brand">MWP Editor<small>${HE ? 'Hebrew page' : 'English page'}</small></span>
    <button class="tb" data-a="lang" title="Edit the other language">${OTHER.label}</button>
    <span class="sep"></span>
    <button class="tb" data-a="undo" title="Undo (Ctrl+Z)">${ico('undo')}</button>
    <button class="tb" data-a="redo" title="Redo (Ctrl+Shift+Z)">${ico('redo')}</button>
    <span class="sep"></span>
    <button class="tb" data-a="add" title="Add an element or section">${ico('plus')} Add</button>
    <button class="tb" data-a="panel" title="Show the settings panel">${ico('gear')} Settings</button>
    <button class="tb" data-a="outline" title="All sections on this page">${ico('layers')} Sections</button>
    <button class="tb" data-a="pagesettings" title="Page title and description for Google">${ico('page')} Page</button>
    <span class="grow"></span>
    <span class="status" data-status>Loading…</span>
    <button class="tb" data-a="history" title="Version history">${ico('history')} History</button>
    <button class="tb" data-a="preview" title="Preview on desktop and phone">${ico('eye')} Preview</button>
    <button class="tb primary" data-a="save" title="Publish (Ctrl+S)">Save</button>
    <button class="tb" data-a="more" title="More">${ico('more')}</button>
  </div>
  <div class="box hov" data-hov><span class="tag"></span></div>
  <div class="box" data-sel><span class="tag"></span></div>
  <div class="box drop" data-drop></div>
  <div class="bar" data-bar></div>
  <aside class="panel" data-panel>
    <div class="ph"><b data-ptitle>Settings</b><button class="x" data-a="closepanel" title="Close">${ico('close')}</button></div>
    <div class="pb" data-pbody></div>
  </aside>
</div>`;
  const U = s => ui.querySelector(s);
  const hov = U('[data-hov]'), selBox = U('[data-sel]'), dropBox = U('[data-drop]'), bar = U('[data-bar]');
  const panel = U('[data-panel]'), pbody = U('[data-pbody]'), ptitle = U('[data-ptitle]'), statusEl = U('[data-status]');
  const uiRoot = U('.ui');

  // ---------- toasts, menus, modals ----------
  let toastT;
  const toast = (msg, action) => {
    U('.toast')?.remove(); clearTimeout(toastT);
    const t = h('div', {class: 'toast'}, msg);
    if (action) t.append(h('button', {onclick: () => { t.remove(); action.run(); }}, action.label));
    uiRoot.append(t); toastT = setTimeout(() => t.remove(), action ? 6000 : 3200);
  };
  const closeMenus = () => ui.querySelectorAll('.menu').forEach(m => m.remove());
  const menu = (anchor, items) => {
    closeMenus();
    const r = anchor.getBoundingClientRect();
    const m = h('div', {class: 'menu'}, items.map(it => h('button', {onclick: () => { closeMenus(); it.run(); }}, it.label)));
    m.style.top = (r.bottom + 6) + 'px'; m.style.right = Math.max(8, innerWidth - r.right) + 'px';
    uiRoot.append(m);
    setTimeout(() => addEventListener('pointerdown', function off(e) { if (!e.composedPath().includes(m)) { m.remove(); removeEventListener('pointerdown', off, true); } }, true));
  };
  const modal = ({title, body, actions = [], size = ''}) => {
    const mask = h('div', {class: 'mask'});
    const close = () => { mask.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    const m = h('div', {class: 'modal ' + size},
      h('div', {class: 'mh'}, h('b', {}, title), h('button', {class: 'x', title: 'Close', html: ico('close'), onclick: close})),
      h('div', {class: 'mb'}, body),
      actions.length ? h('div', {class: 'mf'}, actions.map(a => h('button', {class: 'btn ' + (a.primary ? 'primary' : '') + (a.danger ? ' danger' : ''), onclick: () => a.run(close)}, a.label))) : null);
    mask.append(m);
    mask.addEventListener('pointerdown', e => { if (e.target === mask) close(); });
    uiRoot.append(mask);
    return {close, el: m};
  };
  const confirmBox = (title, text, okLabel = 'OK', danger = false) => new Promise(res => {
    let done = false;
    const md = modal({title, body: h('p', {style: 'margin:0;line-height:1.55'}, text), actions: [
      {label: 'Cancel', run: c => { done = true; c(); res(false); }},
      {label: okLabel, primary: !danger, danger, run: c => { done = true; c(); res(true); }},
    ]});
    const obs = new MutationObserver(() => { if (!md.el.isConnected) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(uiRoot, {childList: true});
  });
  const ask = (title, fields, okLabel = 'OK') => new Promise(res => {
    let done = false;
    const inputs = {};
    const body = h('div', {}, fields.map(f => {
      const inp = f.type === 'textarea' ? h('textarea', {placeholder: f.placeholder || ''}) : h('input', {type: f.type || 'text', placeholder: f.placeholder || ''});
      inp.value = f.value ?? ''; inputs[f.name] = inp;
      if (f.type === 'checkbox') { inp.checked = !!f.value; return h('label', {class: 'f', style: 'display:flex;gap:8px;align-items:center'}, inp, h('span', {}, f.label)); }
      return h('label', {class: 'f'}, h('span', {}, f.label), inp, f.hint ? h('em', {}, f.hint) : null);
    }));
    const finish = (c, ok) => { done = true; c(); res(ok ? Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.type === 'checkbox' ? i.checked : i.value])) : null); };
    const md = modal({title, body, actions: [{label: 'Cancel', run: c => finish(c, false)}, {label: okLabel, primary: true, run: c => finish(c, true)}]});
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); finish(md.close, true); } });
    const obs = new MutationObserver(() => { if (!md.el.isConnected) { obs.disconnect(); if (!done) res(null); } });
    obs.observe(uiRoot, {childList: true});
    setTimeout(() => Object.values(inputs)[0]?.focus(), 30);
  });

  // =====================================================================
  // State: content, history (undo/redo), drafts
  // =====================================================================
  let baseHTML = '', baseMeta = {}, baseVersion = null, meta = {};
  const DRAFT_KEY = 'mwp-draft-' + PAGE;

  const prepMedia = () => { $$('video[data-poster]', root).forEach(v => { if (!v.getAttribute('poster')) v.setAttribute('poster', v.dataset.poster); }); };
  const cleanHTML = () => {
    const c = root.cloneNode(true);
    $$('[contenteditable]', c).forEach(e => e.removeAttribute('contenteditable'));
    $$('[spellcheck]', c).forEach(e => e.removeAttribute('spellcheck'));
    $$('video[data-poster]', c).forEach(v => { if (v.getAttribute('poster') === v.dataset.poster) v.removeAttribute('poster'); });
    $$('[style=""]', c).forEach(e => e.removeAttribute('style'));
    $$('[class=""]', c).forEach(e => e.removeAttribute('class'));
    return c.innerHTML;
  };
  const pathOf = el => { const p = []; while (el && el !== root) { p.unshift([...el.parentElement.children].indexOf(el)); el = el.parentElement; } return p; };
  const fromPath = p => { let el = root; for (const i of p) { el = el && el.children[i]; } return el && el !== root ? el : null; };

  const hist = {stack: [], i: -1};
  const isDirty = () => cleanHTML() !== baseHTML || JSON.stringify(meta) !== JSON.stringify(baseMeta);
  const setStatus = () => {
    const d = isDirty();
    statusEl.textContent = d ? '● Unsaved changes' : (baseVersion ? `Published · version #${baseVersion}` : 'Original design · not edited yet');
    statusEl.classList.toggle('dirty', d);
    U('[data-a="undo"]').disabled = hist.i <= 0;
    U('[data-a="redo"]').disabled = hist.i >= hist.stack.length - 1;
  };
  const saveDraft = debounce(() => {
    try {
      if (isDirty()) localStorage.setItem(DRAFT_KEY, JSON.stringify({html: cleanHTML(), meta, base: baseVersion, at: new Date().toISOString()}));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (_) {}
  }, 600);
  const commit = label => {
    const html = cleanHTML();
    if (hist.stack[hist.i]?.html === html) { setStatus(); return; }
    hist.stack = hist.stack.slice(0, hist.i + 1);
    hist.stack.push({html, label});
    if (hist.stack.length > 150) hist.stack.shift();
    hist.i = hist.stack.length - 1;
    setStatus(); saveDraft();
  };
  const setContent = html => { root.innerHTML = html; prepMedia(); };
  const restoreState = state => {
    const p = sel ? pathOf(sel) : null;
    finishEdit(false); deselect();
    setContent(state.html);
    const again = p && fromPath(p);
    if (again) select(again);
    setStatus(); saveDraft();
  };
  const undo = () => { finishEdit(); if (hist.i > 0) { hist.i--; restoreState(hist.stack[hist.i]); toast('Undone: ' + hist.stack[hist.i + 1].label); } };
  const redo = () => { finishEdit(); if (hist.i < hist.stack.length - 1) { hist.i++; restoreState(hist.stack[hist.i]); toast('Redone: ' + hist.stack[hist.i].label); } };

  // =====================================================================
  // Selection
  // =====================================================================
  let sel = null, editing = null, hovered = null;
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'TIME', 'SUP', 'SUB', 'BR', 'MARK', 'CODE', 'ABBR', 'Q', 'WBR']);
  const NOT_TEXT_SELF = 'img,video,audio,svg,canvas,iframe,picture,input,select,textarea,ul,ol,section,form,figure,dialog,main,table,hr,[data-odo]';
  const TEXT_BLOCKERS = 'img,video,audio,svg,canvas,iframe,picture,input,select,textarea,[data-odo],div,p,ul,ol,li,h1,h2,h3,h4,h5,h6,figure,section,article,form,table,blockquote,nav,header,footer,dialog,button,label,hr';
  const SVG_PARTS = 'path,circle,rect,g,line,polyline,polygon,ellipse,use,text,tspan,defs,clipPath,mask';

  const isTextual = el => !!el && !el.matches(NOT_TEXT_SELF) && !el.querySelector(TEXT_BLOCKERS);
  const pickable = t => {
    if (!t || t.nodeType !== 1 || !root.contains(t) || t === root) return null;
    if (t.closest('svg') && t.closest('svg') !== t) t = t.closest('svg');
    let el = t;
    while (el.parentElement && el.parentElement !== root && (INLINE.has(el.tagName) || (el.tagName === 'SPAN' && !el.attributes.length)) && isTextual(el.parentElement)) el = el.parentElement;
    return el;
  };
  const nameOf = el => {
    if (!el) return '';
    const t = el.tagName.toLowerCase(), c = el.classList;
    if (el.matches('[data-odo]')) return 'Number';
    if (t === 'svg') return 'Icon';
    if (t === 'img') return c.contains('blk-ic') ? 'Icon (image)' : 'Image';
    if (t === 'video') return 'Video';
    if (/^h[1-6]$/.test(t)) return 'Heading';
    if (t === 'p') return c.contains('kick') ? 'Label' : 'Text';
    if (t === 'a') return (c.contains('send') || c.contains('talk') || c.contains('blk-btn') || c.contains('wa-btn')) ? 'Button link' : 'Link';
    if (t === 'button') return 'Button';
    if (t === 'section') return 'Section';
    if (t === 'figure') return c.contains('band') ? 'Panorama' : 'Photo block';
    if (t === 'figcaption') return 'Caption';
    if (t === 'ul' || t === 'ol') return 'List';
    if (t === 'li') return 'List item';
    if (t === 'form') return 'Contact form';
    if (t === 'input' || t === 'textarea') return 'Form field';
    if (t === 'select') return 'Dropdown';
    if (t === 'label') return 'Field label';
    if (t === 'dialog') return 'Pop-up';
    if (t === 'article') return 'Pop-up page';
    if (t === 'footer') return 'Footer';
    if (t === 'nav') return 'Menu';
    if (t === 'hr') return 'Divider';
    if (t === 'span' || t === 'b' || t === 'small' || t === 'time' || t === 'strong') return 'Text';
    if (t === 'main') return 'Page';
    if (c.contains('blk-space')) return 'Empty space';
    return 'Box';
  };
  const describe = el => {
    const id = el.id ? ' #' + el.id : '';
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34);
    return nameOf(el) + (id || (text ? ' · ' + text : ''));
  };
  const place = (box, el, label) => {
    if (!el || !el.isConnected) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.style.left = r.left - 2 + 'px'; box.style.top = r.top - 2 + 'px';
    box.style.width = r.width + 4 + 'px'; box.style.height = r.height + 4 + 'px';
    const tag = box.querySelector('.tag');
    if (tag) { tag.textContent = label; tag.style.top = r.top < 74 ? (r.height + 4) + 'px' : '-21px'; }
  };

  const select = el => {
    if (editing && el !== editing) finishEdit();
    sel = el;
    renderBar();
    if (panel.classList.contains('open')) renderPanel();
  };
  const deselect = () => { sel = null; renderBar(); if (panel.classList.contains('open')) renderPanel(); };

  // keep the boxes and the toolbar glued to the page as it scrolls and changes
  const loop = () => {
    place(hov, hovered && hovered !== sel && !dragging ? hovered : null, hovered ? nameOf(hovered) : '');
    place(selBox, sel, sel ? (editing ? 'Editing text · Esc to finish' : nameOf(sel)) : '');
    if (sel && sel.isConnected && !dragging) {
      const r = sel.getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight;
      let top = r.top - bh - 26; if (top < 60) top = Math.min(r.bottom + 10, innerHeight - bh - 10);
      if (top < 60) top = 60;
      const right = panel.classList.contains('open') ? 340 : 0;
      let left = Math.min(Math.max(8, r.left), innerWidth - right - bw - 8);
      bar.style.top = top + 'px'; bar.style.left = left + 'px'; bar.style.display = 'flex';
    } else if (!dragging) bar.style.display = 'none';
    requestAnimationFrame(loop);
  };

  // =====================================================================
  // The floating toolbar
  // =====================================================================
  const bgUrl = el => { const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(el).backgroundImage || ''); return m ? m[1] : null; };
  const renderBar = () => {
    bar.innerHTML = '';
    if (!sel) return;
    const B = (icon, title, run, extra = {}) => h('button', {title, html: typeof icon === 'string' && I[icon] ? ico(icon) : icon, onclick: run, ...extra});
    if (editing) {
      bar.append(
        B('bold', 'Bold (Ctrl+B)', () => fmt('bold')),
        B('italic', 'Italic (Ctrl+I)', () => fmt('italic')),
        B('link', 'Make a link', () => linkSelection()),
        B('unlink', 'Remove link', () => fmt('unlink')),
        B('eraser', 'Clear formatting', () => fmt('removeFormat')),
        h('span', {class: 'vs'}),
        h('button', {class: 'txt', title: 'Finish editing (Esc)', onclick: () => finishEdit()}, '✓ Done'));
      bar.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault())); // keep the text selection
      return;
    }
    const grip = B('move', 'Drag to move · hold Shift to place freely', null, {class: 'grip'});
    grip.addEventListener('pointerdown', startDrag);
    bar.append(h('span', {class: 'name'}, nameOf(sel)));
    if (sel.parentElement && sel.parentElement !== root) bar.append(B('up', 'Select the box around this', () => select(sel.parentElement)));
    bar.append(grip);
    if (isTextual(sel)) bar.append(B('text', 'Edit text (double-click)', () => startEdit(sel)));
    if (sel.matches('img,video')) bar.append(B('image', sel.matches('video') ? 'Replace video' : 'Replace image', () => replaceMedia(sel)));
    else if (sel.matches('svg')) bar.append(B('star', 'Replace icon', () => replaceIcon(sel)));
    else if (bgUrl(sel)) bar.append(B('image', 'Replace background photo', () => replaceBackground(sel)));
    if (sel.matches('a')) bar.append(B('link', 'Link address', () => editLink(sel)));
    bar.append(
      B('gear', 'Settings and style', () => openPanel()),
      B('copy', 'Duplicate (Ctrl+D)', () => duplicate(sel)),
      B('arrowUp', 'Move up', () => moveBy(sel, -1)),
      B('arrowDown', 'Move down', () => moveBy(sel, 1)),
      B('trash', 'Delete (Del)', () => remove(sel)));
  };

  // =====================================================================
  // Actions on elements
  // =====================================================================
  const duplicate = el => {
    const c = el.cloneNode(true);
    c.removeAttribute('id'); $$('[id]', c).forEach(x => x.removeAttribute('id'));
    el.after(c); select(c); commit('Duplicate ' + nameOf(el).toLowerCase());
  };
  const moveBy = (el, d) => {
    const sib = d < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!sib) { toast(d < 0 ? 'Already first here. Drag it to move it further.' : 'Already last here. Drag it to move it further.'); return; }
    d < 0 ? sib.before(el) : sib.after(el);
    el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    commit('Move ' + nameOf(el).toLowerCase());
  };
  const remove = el => {
    if (el === mainEl()) return;
    const parent = el.parentElement;
    el.remove(); select(parent && parent !== root ? parent : null);
    commit('Delete ' + nameOf(el).toLowerCase());
    toast(nameOf(el) + ' deleted', {label: 'Undo', run: undo});
  };
  const topLevel = el => { while (el && el.parentElement && el.parentElement !== mainEl() && el.parentElement !== root) el = el.parentElement; return el; };
  const insertBlock = async (b, kind) => {
    const tpl = h('template', {html: b.html});
    const node = tpl.content.firstElementChild;
    if (kind === 'sections') {
      const anchor = sel && topLevel(sel);
      if (anchor && anchor !== mainEl()) anchor.after(node); else mainEl().append(node);
    } else {
      let a = sel;
      if (!a) { const last = [...mainEl().children].filter(x => x.matches('section')).pop(); a = last ? ($(':scope > .wrap', last) || last) : mainEl(); a.append(node); }
      else {
        if (a.parentElement && a.parentElement.matches('ul,ol') && b.key !== 'list') a = a.parentElement;
        if (b.key === 'list' && a.matches('li')) { a.after(...tpl.content.firstElementChild.children); select(a.nextElementSibling); commit('Add list items'); return; }
        const container = a.matches('section,article,footer,dialog,.wrap,.blk-cols>div,.blk-two>div,[data-layout-cols]') && !a.matches('.band');
        if (container) ($(':scope > .wrap', a) || a).append(node); else if (a.closest('a,button,h1,h2,h3,h4,h5,h6,p,label') && a.closest('a,button,h1,h2,h3,h4,h5,h6,p,label') !== a) a.closest('a,button,h1,h2,h3,h4,h5,h6,p,label').after(node); else a.after(node);
      }
    }
    prepMedia();
    select(node);
    node.scrollIntoView({block: 'center', behavior: 'smooth'});
    commit('Add ' + b.name.toLowerCase());
    if (b.pick === 'image') replaceMedia($('img', node));
    else if (b.pick === 'video') replaceMedia($('video', node));
    else if (b.pick === 'icon') replaceIcon(node);
  };
  const openAdd = () => {
    const body = h('div', {class: 'adds'},
      h('p', {class: 'hint', style: 'margin-top:0'}, sel ? `New elements go after “${describe(sel)}” (or inside it, for a section or box). New sections go after the section you’re in.` : 'Nothing is selected, so elements go at the end of the last section and sections at the end of the page. Select something first to choose the spot.'),
      h('h4', {}, 'Elements'),
      h('div', {class: 'icons'}, BLOCKS.elements.map(b => h('button', {onclick: () => { md.close(); insertBlock(b, 'elements'); }, html: blockIcon(b.key) + `<span>${b.name}</span>`}))),
      h('h4', {}, 'Sections'),
      h('div', {class: 'icons'}, BLOCKS.sections.map(b => h('button', {onclick: () => { md.close(); insertBlock(b, 'sections'); }, html: blockIcon(b.key) + `<span>${b.name}</span>`}))));
    const md = modal({title: 'Add to the page', body, size: 'wide'});
  };
  const blockIcon = k => {
    const p = {
      heading: '<path d="M5 5v14M15 5v14M5 12h10"/><path d="M18 9l2-1v11"/>', subheading: '<path d="M6 6v12M14 6v12M6 12h8"/>', label: '<path d="M4 9h10M4 13h7"/>',
      intro: '<path d="M4 7h16M4 11h16M4 15h10"/>', para: '<path d="M4 6h16M4 10h16M4 14h16M4 18h9"/>', button: '<rect x="3" y="8" width="18" height="8" rx="4"/>', link: I.link,
      image: I.image, video: I.video, icon: I.star, list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
      columns: '<rect x="3" y="5" width="5" height="14" rx="1"/><rect x="9.5" y="5" width="5" height="14" rx="1"/><rect x="16" y="5" width="5" height="14" rx="1"/>', divider: '<path d="M3 12h18"/>', space: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
      's-text': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>', 's-two': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M5.5 9h4M5.5 12h4"/>',
      's-gallery': '<rect x="3" y="5" width="5" height="7" rx="1"/><rect x="9.5" y="5" width="5" height="7" rx="1"/><rect x="16" y="5" width="5" height="7" rx="1"/><path d="M3 16h18"/>',
      's-cover': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5"/><path d="M6 8h6"/>', 's-band': '<rect x="2" y="8" width="20" height="8" rx="1"/>', 's-video': I.video,
    }[k] || I.plus;
    return `<svg viewBox="0 0 24 24">${p}</svg>`;
  };

  // ---------- links ----------
  const editLink = async a => {
    const anchors = $$('[id]', root).filter(e => e.matches('section,figure,footer,div')).map(e => '#' + e.id);
    const v = await ask('Link', [
      {name: 'href', label: 'Where it goes', value: a.getAttribute('href') || '', placeholder: 'https://…  or  #reach  or  mailto:…', hint: anchors.length ? 'Sections on this page: ' + anchors.join('  ') : ''},
      {name: 'blank', label: 'Open in a new tab', type: 'checkbox', value: a.target === '_blank'},
    ], 'Apply');
    if (!v) return;
    a.setAttribute('href', v.href.trim());
    if (v.blank) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
    commit('Edit link'); if (panel.classList.contains('open')) renderPanel();
  };

  // =====================================================================
  // Inline text editing
  // =====================================================================
  let editStartHTML = '';
  const startEdit = (el, x, y) => {
    if (!isTextual(el)) return;
    if (editing === el) return;
    finishEdit();
    editing = el; sel = el; editStartHTML = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    el.focus({preventScroll: true});
    const s = getSelection(); s.removeAllRanges();
    let r = null;
    if (x != null) {
      if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
      else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
    }
    if (!r || !el.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(el); }
    s.addRange(r);
    try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
    renderBar();
  };
  const finishEdit = (save = true) => {
    if (!editing) return;
    const el = editing; editing = null;
    el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck');
    // tidy what the browser leaves behind
    $$('span[style], font', el).forEach(s => s.replaceWith(...s.childNodes));
    $$('b:empty, i:empty, strong:empty, em:empty', el).forEach(e => e.remove());
    if (el.innerHTML === '<br>') el.innerHTML = '';
    getSelection().removeAllRanges();
    if (save && el.innerHTML !== editStartHTML) commit('Edit text');
    renderBar();
  };
  const fmt = cmd => { if (editing) { document.execCommand(cmd, false, null); editing.focus(); } };
  const linkSelection = async () => {
    if (!editing) return;
    const s = getSelection(); const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    const v = await ask('Make a link', [{name: 'href', label: 'Link address', placeholder: 'https://…  or  #reach'}], 'Link');
    if (!v || !v.href.trim() || !editing) return;
    editing.focus(); if (range) { s.removeAllRanges(); s.addRange(range); }
    if (s.isCollapsed) { toast('Select some words first, then make them a link.'); return; }
    document.execCommand('createLink', false, v.href.trim());
  };
  document.addEventListener('paste', e => {
    if (!editing || !editing.contains(e.target)) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }, true);
  document.addEventListener('drop', e => { if (root.contains(e.target)) e.preventDefault(); }, true);

  // =====================================================================
  // Pointer: hover, select, double-click
  // =====================================================================
  const inEditing = t => editing && (editing === t || editing.contains(t));
  document.addEventListener('pointermove', e => {
    if (dragging) return;
    const t = e.target;
    hovered = root.contains(t) && !inEditing(t) ? pickable(t) : null;
  }, true);
  DOC.addEventListener('mouseleave', () => { hovered = null; });
  document.addEventListener('mousedown', e => {
    if (!root.contains(e.target)) return;
    if (inEditing(e.target)) return; // place the caret normally
    e.preventDefault();
    if (e.detail > 1) return; // the dblclick handler takes it
    const el = pickable(e.target);
    if (el) select(el);
  }, true);
  document.addEventListener('click', e => { if (root.contains(e.target) && !inEditing(e.target)) { e.preventDefault(); e.stopPropagation(); } if (inEditing(e.target) && e.target.closest('a')) e.preventDefault(); }, true);
  document.addEventListener('submit', e => { if (root.contains(e.target)) e.preventDefault(); }, true);
  document.addEventListener('dblclick', e => {
    if (!root.contains(e.target) || inEditing(e.target)) return;
    e.preventDefault();
    const el = pickable(e.target); if (!el) return;
    select(el);
    if (isTextual(el)) startEdit(el, e.clientX, e.clientY);
    else if (el.matches('img,video')) replaceMedia(el);
    else if (el.matches('svg')) replaceIcon(el);
    else openPanel();
  }, true);

  // =====================================================================
  // Keyboard
  // =====================================================================
  document.addEventListener('keydown', e => {
    const path = e.composedPath(), t = path[0];
    const typingInUI = t && t !== document.body && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && !root.contains(t);
    if (typingInUI) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); publish(); return; }
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(); return; }
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
      if (mod && k === 'b') { e.preventDefault(); fmt('bold'); return; }
      if (mod && k === 'i') { e.preventDefault(); fmt('italic'); return; }
      return; // normal typing (and the browser's own undo while typing)
    }
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) { e.preventDefault(); redo(); return; }
    if (!sel) return;
    if (e.key === 'Escape') { deselect(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(sel); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(sel); return; }
    if (e.key === 'Enter' && isTextual(sel)) { e.preventDefault(); startEdit(sel); return; }
    if (e.key.startsWith('Arrow') && e.altKey) { // nudge
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1, [x, y] = getOffset(sel);
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      setOffset(sel, x + dx, y + dy); nudgeCommit();
    }
  }, true);
  const getOffset = el => { const m = (el.style.translate || '').match(/(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/); return m ? [+m[1], +(m[2] || 0)] : [0, 0]; };
  const setOffset = (el, x, y) => { el.style.translate = (x || y) ? `${Math.round(x)}px ${Math.round(y)}px` : ''; };
  const nudgeCommit = debounce(() => commit('Nudge position'), 500);

  // =====================================================================
  // Drag to move (Shift = free placement)
  // =====================================================================
  let dragging = null;
  const FLOW = 'main,section,div,article,aside,header,footer,nav,form,figure,dialog,ul,ol,li';
  const INLINE_CTX = 'a,button,p,h1,h2,h3,h4,h5,h6,label,figcaption,span,small,b,strong,em,i,svg';
  const blockedParent = p => { const c = p.closest(INLINE_CTX); return !!c && root.contains(c); };
  const findDrop = (x, y, dragged) => {
    let hit = document.elementFromPoint(x, y);
    if (!hit || !root.contains(hit) || hit === root) return null;
    if (hit.closest('svg')) hit = hit.closest('svg');
    if (dragged.contains(hit)) return null;
    // an empty box takes the element inside it
    if (hit.matches('div,section,article,li,figure,form') && !hit.children.length && !(hit.textContent || '').trim() && !blockedParent(hit)) {
      return {target: hit, mode: 'inside'};
    }
    const isLi = dragged.tagName === 'LI';
    let el = hit;
    while (el && el !== root) {
      const p = el.parentElement;
      if (!p || dragged === p || dragged.contains(p)) return null;
      const okParent = isLi ? p.matches('ul,ol') : (p === root || (p.matches(FLOW) && !p.matches('ul,ol')));
      if (okParent && !blockedParent(p) && el !== dragged) break;
      el = p;
    }
    if (!el || el === root || el === dragged) return null;
    const ps = getComputedStyle(el.parentElement);
    const horiz = (ps.display.includes('flex') && !ps.flexDirection.startsWith('column')) || (ps.display.includes('grid') && ps.gridTemplateColumns.trim().split(/\s+/).length > 1);
    const r = el.getBoundingClientRect();
    let before = horiz ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
    if (horiz && ps.direction === 'rtl') before = !before;
    return {target: el, mode: before ? 'before' : 'after', horiz, rect: r};
  };
  const showDrop = d => {
    if (!d) { dropBox.style.display = 'none'; return; }
    const r = d.rect || d.target.getBoundingClientRect();
    dropBox.style.display = 'block';
    if (d.mode === 'inside') Object.assign(dropBox.style, {left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: Math.max(4, r.height) + 'px', background: 'rgba(47,128,255,.18)'});
    else {
      dropBox.style.background = '';
      const rtlFlip = d.horiz && getComputedStyle(d.target.parentElement).direction === 'rtl';
      const atStart = (d.mode === 'before') !== rtlFlip;
      if (d.horiz) Object.assign(dropBox.style, {left: (atStart ? r.left - 4 : r.right) + 'px', top: r.top + 'px', width: '4px', height: r.height + 'px'});
      else Object.assign(dropBox.style, {left: r.left + 'px', top: (d.mode === 'before' ? r.top - 3 : r.bottom - 1) + 'px', width: r.width + 'px', height: '4px'});
    }
  };
  function startDrag(e) {
    if (!sel) return;
    e.preventDefault();
    const el = sel, free = e.shiftKey;
    const keep = {pe: el.style.pointerEvents, op: el.style.opacity};
    const [ox, oy] = getOffset(el), sx = e.clientX, sy = e.clientY;
    const ghost = h('div', {class: 'ghost'}, free ? 'Placing freely · release to drop' : 'Moving ' + nameOf(el).toLowerCase() + ' · Esc to cancel');
    uiRoot.append(ghost);
    dragging = {el, free, drop: null};
    bar.style.display = 'none'; hov.style.display = 'none';
    if (!free) { el.style.pointerEvents = 'none'; el.style.opacity = '.35'; }
    let lastY = e.clientY, raf = 0;
    const scroller = () => { if (!dragging) return; if (lastY < 80) scrollBy(0, -14); else if (lastY > innerHeight - 50) scrollBy(0, 14); raf = requestAnimationFrame(scroller); };
    raf = requestAnimationFrame(scroller);
    const move = ev => {
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; lastY = ev.clientY;
      if (free) { setOffset(el, ox + ev.clientX - sx, oy + ev.clientY - sy); return; }
      dragging.drop = findDrop(ev.clientX, ev.clientY, el); showDrop(dragging.drop);
    };
    const end = (cancel) => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); document.removeEventListener('keydown', esc, true);
      ghost.remove(); showDrop(null);
      el.style.pointerEvents = keep.pe; el.style.opacity = keep.op;
      const d = dragging.drop; dragging = null;
      if (cancel) { if (free) setOffset(el, ox, oy); return; }
      if (free) { commit('Place freely'); return; }
      if (!d) return;
      if (d.mode === 'inside') d.target.append(el); else if (d.mode === 'before') d.target.before(el); else d.target.after(el);
      select(el); commit('Move ' + nameOf(el).toLowerCase());
    };
    const up = () => end(false);
    const esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(true); } };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); document.addEventListener('keydown', esc, true);
  }

  // =====================================================================
  // Media: upload, library, replace
  // =====================================================================
  const slug = s => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
  const shrinkImage = async file => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const max = 2560, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 1.5e6) return file;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise(r => c.toBlob(r, type, .86));
      return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, type === 'image/png' ? '.png' : '.jpg'), {type}) : file;
    } catch (_) { return file; }
  };
  const upload = async (file, kind) => {
    if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB. Please use a smaller or compressed version.');
    const f = kind === 'video' ? file : await shrinkImage(file);
    const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [, kind === 'video' ? 'mp4' : 'jpg'])[1].toLowerCase();
    const path = `${kind === 'video' ? 'videos' : 'images'}/${Date.now()}-${slug(f.name)}.${ext}`;
    const {error} = await sb.storage.from(BUCKET).upload(path, f, {cacheControl: '31536000', contentType: f.type || undefined, upsert: false});
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };
  // pick a file (upload / library / link). kind: 'image' | 'video'. Resolves to a URL or null.
  const pickMedia = (kind, title) => new Promise(resolve => {
    let done = false;
    const finish = url => { if (done) return; done = true; md.close(); resolve(url); };
    const tabs = h('div', {class: 'tabs'});
    const pane = h('div');
    const accept = kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/*';
    const showUpload = () => {
      const input = h('input', {type: 'file', accept, style: 'display:none'});
      const zone = h('div', {class: 'dropzone'}, h('div', {html: ico('upload', 30)}), h('b', {}, `Drop ${kind === 'video' ? 'a video' : 'an image'} here`), h('span', {}, 'or'), h('button', {class: 'btn primary', onclick: () => input.click()}, 'Choose a file'),
        h('span', {style: 'font-size:12px'}, kind === 'video' ? 'MP4 works best. Up to 50 MB.' : 'JPG, PNG, WebP, SVG or GIF. Large photos are resized to 2560 px automatically.'));
      const go = async file => {
        if (!file) return;
        zone.innerHTML = ''; zone.append(h('div', {class: 'spin'}), h('span', {}, 'Uploading ' + file.name + '…'));
        try { finish(await upload(file, kind)); } catch (err) { zone.innerHTML = ''; zone.append(h('b', {style: 'color:#c62828'}, 'Upload failed'), h('span', {}, err.message || String(err)), h('button', {class: 'btn', onclick: showUpload}, 'Try again')); }
      };
      input.onchange = () => go(input.files[0]);
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); go(e.dataTransfer.files[0]); });
      pane.replaceChildren(zone, input);
    };
    const showLibrary = async () => {
      pane.replaceChildren(h('div', {class: 'row'}, h('div', {class: 'spin'}), 'Loading…'));
      const folder = kind === 'video' ? 'videos' : 'images';
      const {data} = await sb.storage.from(BUCKET).list(folder, {limit: 500, sortBy: {column: 'created_at', order: 'desc'}});
      const uploaded = (data || []).filter(o => o.name && !o.name.startsWith('.')).map(o => ({url: sb.storage.from(BUCKET).getPublicUrl(folder + '/' + o.name).data.publicUrl, name: o.name.replace(/^\d+-/, '')}));
      const builtIn = BUILT_IN[kind].map(u => ({url: u, name: u.split('/').pop()}));
      const item = it => h('button', {onclick: () => finish(it.url), title: it.name}, kind === 'video' ? h('video', {src: it.url, muted: true, preload: 'metadata'}) : h('img', {src: it.url, loading: 'lazy', alt: ''}), h('span', {}, it.name));
      pane.replaceChildren(
        h('h4', {style: 'margin:0 0 8px'}, 'Uploaded'), uploaded.length ? h('div', {class: 'grid'}, uploaded.map(item)) : h('p', {class: 'hint'}, 'Nothing uploaded yet.'),
        h('h4', {style: 'margin:18px 0 8px'}, 'Already on the website'), h('div', {class: 'grid'}, builtIn.map(item)));
    };
    const showLink = () => {
      const inp = h('input', {type: 'url', placeholder: 'https://…'});
      pane.replaceChildren(h('label', {class: 'f'}, h('span', {}, `Address of the ${kind}`), inp, h('em', {}, 'Paste a direct link to the file.')), h('button', {class: 'btn primary', onclick: () => inp.value.trim() && finish(inp.value.trim())}, 'Use this link'));
      setTimeout(() => inp.focus(), 30);
    };
    const T = [['Upload', showUpload], ['Library', showLibrary], ['Link', showLink]];
    T.forEach(([label, fn], i) => tabs.append(h('button', {class: i ? '' : 'on', onclick: e => { tabs.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); fn(); }}, label)));
    const md = modal({title: title || (kind === 'video' ? 'Choose a video' : 'Choose an image'), body: h('div', {}, tabs, pane), size: 'wide'});
    const obs = new MutationObserver(() => { if (!md.el.isConnected) { obs.disconnect(); if (!done) { done = true; resolve(null); } } });
    obs.observe(uiRoot, {childList: true});
    showUpload();
  });
  const replaceMedia = async el => {
    if (!el) return;
    const isVideo = el.matches('video');
    const url = await pickMedia(isVideo ? 'video' : 'image');
    if (!url) return;
    if (isVideo) {
      $$('source', el).forEach(s => s.remove());
      el.setAttribute('src', url);
      if (el.dataset.poster) { el.removeAttribute('data-poster'); el.removeAttribute('poster'); }
      el.setAttribute('preload', 'metadata');
      el.load();
    } else {
      el.setAttribute('src', url); el.removeAttribute('srcset'); el.removeAttribute('sizes');
      const fig = el.closest('figure[data-full]'); if (fig) fig.dataset.full = url;
    }
    select(el); commit(isVideo ? 'Replace video' : 'Replace image');
  };
  const replaceBackground = async el => {
    const url = await pickMedia('image', 'Choose a background photo');
    if (!url) return;
    el.style.backgroundImage = `url("${url}")`;
    commit('Replace background');
    if (panel.classList.contains('open')) renderPanel();
  };
  const setAttrMedia = async (el, attr, kind) => {
    const url = await pickMedia(kind);
    if (!url) return;
    el.setAttribute(attr, url);
    if (attr === 'data-poster' && el.matches('video')) el.setAttribute('poster', url);
    commit('Change ' + attr.replace('data-', '')); renderPanel();
  };
  // ---------- icons ----------
  const replaceIcon = el => new Promise(resolve => {
    const apply = paths => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      if (el.getAttribute('class')) svg.setAttribute('class', el.getAttribute('class'));
      if (el.getAttribute('style')) svg.setAttribute('style', el.getAttribute('style'));
      svg.innerHTML = paths;
      el.replaceWith(svg); select(svg); commit('Replace icon'); md.close(); resolve(true);
    };
    const uploadBtn = h('button', {class: 'btn', onclick: async () => {
      md.close();
      const url = await pickMedia('image', 'Upload an icon (SVG or PNG)');
      if (!url) return resolve(false);
      const img = h('img', {src: url, alt: '', class: (el.getAttribute('class') || 'blk-ic')});
      el.replaceWith(img); select(img); commit('Replace icon'); resolve(true);
    }}, 'Upload my own icon…');
    const md = modal({title: 'Choose an icon', size: 'wide', body: h('div', {},
      h('div', {class: 'icons'}, Object.entries(LIB).map(([n, p]) => h('button', {onclick: () => apply(p), html: `<svg viewBox="0 0 24 24">${p}</svg><span>${n}</span>`}))),
      h('div', {style: 'margin-top:16px'}, uploadBtn))});
  });

  // =====================================================================
  // Settings panel
  // =====================================================================
  const openPanel = () => { panel.classList.add('open'); DOC.classList.add('mwe-panel'); U('[data-a="panel"]').classList.add('on'); renderPanel(); };
  const closePanel = () => { panel.classList.remove('open'); DOC.classList.remove('mwe-panel'); U('[data-a="panel"]').classList.remove('on'); U('[data-a="outline"]').classList.remove('on'); };
  const F = (label, control, hint) => h('div', {class: 'f'}, h('span', {}, label), control, hint ? h('em', {}, hint) : null);
  const changeCommit = debounce(label => commit(label), 350);
  const txt = (value, onInput, label, ph = '') => { const i = h('input', {type: 'text', placeholder: ph}); i.value = value ?? ''; i.addEventListener('input', () => { onInput(i.value); changeCommit(label); }); return i; };
  const num = (value, onInput, label, ph = 'auto', step = 1) => { const i = h('input', {type: 'number', placeholder: ph, step}); i.value = value ?? ''; i.addEventListener('input', () => { onInput(i.value); changeCommit(label); }); return i; };
  const pxOf = v => { if (!v) return ''; const m = String(v).match(/(-?[\d.]+)px\)?\s*$/); return m ? +m[1] : ''; };
  const colorOf = v => { if (!v) return ''; const c = document.createElement('canvas').getContext('2d'); c.fillStyle = v; const s = c.fillStyle; return /^#/.test(s) ? s : ''; };
  const colorCtl = (el, prop, label) => {
    const cur = el.style.getPropertyValue(prop);
    const c = h('input', {type: 'color'}); c.value = colorOf(cur) || colorOf(getComputedStyle(el).getPropertyValue(prop)) || '#ffffff';
    const reset = h('button', {class: 'btn small', onclick: e => { e.preventDefault(); el.style.removeProperty(prop); commit('Reset ' + label.toLowerCase()); renderPanel(); }}, 'Reset');
    c.addEventListener('input', () => { el.style.setProperty(prop, c.value); changeCommit(label); });
    return h('div', {class: 'row'}, c, h('span', {style: 'flex:1;font-size:12px;color:#6e6e73'}, cur ? cur : 'Design default'), reset);
  };
  const seg = (options, current, onPick) => h('div', {class: 'seg'}, options.map(([v, l]) => h('button', {class: v === current ? 'on' : '', onclick: e => { e.preventDefault(); onPick(v); }}, l)));
  const styleNum = (el, prop, label, hint) => F(label, num(pxOf(el.style.getPropertyValue(prop)), v => v === '' ? el.style.removeProperty(prop) : el.style.setProperty(prop, v + 'px'), label), hint);

  const DATA_FIELDS = [
    ['data-odo', 'Number shown', 'text', 'Counts up when it scrolls into view. Digits only, e.g. 112 or 3.4'],
    ['data-label', 'Number, as read aloud', 'text', 'For screen readers, e.g. “3.4 million”'],
    ['data-date', 'Photo date', 'text', 'Shown in the caption, e.g. December 2025'],
    ['data-cam', 'Camera details', 'text', 'Shown in the full-size viewer. Separate items with |'],
    ['data-full', 'Full-size photo', 'image', 'Opens when a visitor clicks the photo'],
    ['data-reveal', 'Hover photo', 'image', 'Revealed under the pointer on desktop'],
    ['data-img', 'Pop-up photo', 'image', ''],
    ['data-alt', 'Pop-up photo description', 'text', ''],
    ['data-cta', 'Pop-up button text', 'text', ''],
    ['data-msg', 'Message it pre-fills', 'text', 'Put into the contact form when the button is used'],
    ['data-door', 'Contact topic', 'text', 'Must match a topic in the contact form dropdown'],
    ['data-poster', 'Video cover image', 'image', 'Shown before the video plays'],
  ];

  const renderPanel = () => {
    pbody.innerHTML = '';
    U('[data-a="outline"]').classList.toggle('on', !sel);
    if (!sel) { ptitle.textContent = 'Sections on this page'; renderOutline(); return; }
    const el = sel;
    ptitle.textContent = nameOf(el);
    // breadcrumb: the boxes around this element
    const chain = []; let p = el; while (p && p !== root && chain.length < 6) { chain.unshift(p); p = p.parentElement; }
    pbody.append(h('div', {class: 'crumbs'}, chain.map(c => h('button', {onclick: () => select(c), title: describe(c)}, nameOf(c)))));
    const sections = [];
    const sec = (title, open, ...kids) => { const d = h('details', {open}, h('summary', {}, title), ...kids.flat().filter(Boolean)); sections.push(d); return d; };

    // --- content ---
    const content = [];
    if (isTextual(el)) content.push(h('p', {class: 'hint'}, 'Double-click the text on the page to type. Select words to make them bold, italic or a link.'), h('button', {class: 'btn', onclick: () => startEdit(el), html: ico('text', 16) + ' Edit text'}));
    if (el.matches('a')) {
      content.push(F('Link address', txt(el.getAttribute('href'), v => el.setAttribute('href', v), 'Edit link', 'https://… or #reach')));
      const cb = h('input', {type: 'checkbox'}); cb.checked = el.target === '_blank';
      cb.addEventListener('change', () => { if (cb.checked) { el.target = '_blank'; el.rel = 'noopener'; } else { el.removeAttribute('target'); el.removeAttribute('rel'); } commit('Link target'); });
      content.push(h('label', {class: 'row', style: 'margin-bottom:12px'}, cb, h('span', {}, 'Open in a new tab')));
    }
    if (el.matches('img')) {
      content.push(h('img', {class: 'thumb', src: el.currentSrc || el.src, alt: ''}), h('div', {class: 'row', style: 'margin:8px 0 12px'}, h('button', {class: 'btn primary', onclick: () => replaceMedia(el)}, 'Replace image'), h('button', {class: 'btn danger', onclick: () => remove(el)}, 'Remove')));
      content.push(F('Description (alt text)', txt(el.getAttribute('alt'), v => el.setAttribute('alt', v), 'Image description'), 'Read by screen readers and Google'));
      content.push(F('Focus point', seg([['', 'Center'], ['50% 20%', 'Top'], ['50% 80%', 'Bottom'], ['20% 50%', 'Left'], ['80% 50%', 'Right']], el.style.objectPosition, v => { el.style.objectPosition = v; commit('Focus point'); renderPanel(); }), 'Which part stays visible when the photo is cropped'));
    }
    if (el.matches('video')) {
      const poster = el.dataset.poster || el.getAttribute('poster');
      content.push(h('video', {class: 'thumb', src: el.currentSrc || el.getAttribute('src') || ($('source', el) || {}).src || '', poster: poster || '', muted: true, controls: true, preload: 'metadata'}));
      content.push(h('div', {class: 'row', style: 'margin:8px 0 12px'}, h('button', {class: 'btn primary', onclick: () => replaceMedia(el)}, 'Replace video'), h('button', {class: 'btn', onclick: () => setAttrMedia(el, el.dataset.poster ? 'data-poster' : 'poster', 'image')}, 'Cover image')));
      if (!el.hasAttribute('data-film-video')) {
        const opts = [['autoplay', 'Play automatically (silent)'], ['controls', 'Show play controls'], ['loop', 'Loop']];
        opts.forEach(([a, l]) => { const cb = h('input', {type: 'checkbox'}); cb.checked = el.hasAttribute(a); cb.addEventListener('change', () => { cb.checked ? el.setAttribute(a, '') : el.removeAttribute(a); if (a === 'autoplay' && cb.checked) { el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); } commit('Video option'); }); content.push(h('label', {class: 'row', style: 'margin-bottom:8px'}, cb, h('span', {}, l))); });
      } else content.push(h('p', {class: 'hint'}, 'This film plays by itself while it is on screen, with a Pause button.'));
    }
    if (el.matches('svg') || el.matches('img.blk-ic')) {
      content.push(h('button', {class: 'btn primary', style: 'margin-bottom:12px', onclick: () => replaceIcon(el)}, 'Replace icon'));
      if (el.matches('svg')) content.push(F('Icon colour', colorCtl(el, 'stroke', 'Icon colour')));
    }
    if (el.matches('input,textarea')) {
      content.push(F('Hint inside the field', txt(el.getAttribute('placeholder'), v => v ? el.setAttribute('placeholder', v) : el.removeAttribute('placeholder'), 'Field hint')));
      const cb = h('input', {type: 'checkbox'}); cb.checked = el.required; cb.addEventListener('change', () => { el.required = cb.checked; commit('Required field'); });
      content.push(h('label', {class: 'row', style: 'margin-bottom:12px'}, cb, h('span', {}, 'Must be filled in')));
    }
    if (el.matches('select')) {
      const ta = h('textarea', {rows: 8}); ta.value = $$('option', el).map(o => o.value === o.textContent ? o.value : `${o.value} | ${o.textContent}`).join('\n');
      ta.addEventListener('change', () => {
        el.innerHTML = ''; ta.value.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => { const [v, l] = line.split('|').map(s => s.trim()); el.append(h('option', {value: v}, l || v)); });
        commit('Dropdown options');
      });
      content.push(F('Options, one per line', ta, 'Write “Topic | Label shown” to show a different label (the Hebrew page keeps English topics on the left)'));
    }
    if (el.matches('[data-form]')) content.push(formTexts(el));
    if (el.matches('section,figure,div,article,footer,li,ul,a,button,dialog,form,header,nav,main')) {
      const media = $$('img,video', el).slice(0, 16);
      if (media.length) {
        content.push(h('div', {class: 'f'}, h('span', {}, 'Photos and videos inside'),
          ...media.map(m => h('div', {class: 'media-row'}, m.matches('video') ? h('video', {src: m.currentSrc || m.getAttribute('src') || ($('source', m) || {}).src || '', muted: true, preload: 'metadata'}) : h('img', {src: m.currentSrc || m.src, alt: ''}),
            h('span', {}, m.getAttribute('alt') || (m.currentSrc || m.getAttribute('src') || '').split('/').pop()),
            h('button', {class: 'btn small', onclick: () => replaceMedia(m)}, 'Replace'), h('button', {class: 'btn small', onclick: () => select(m)}, 'Select')))));
      }
    }
    const bg = bgUrl(el);
    if (bg) content.push(h('div', {class: 'f'}, h('span', {}, 'Background photo'), h('img', {class: 'thumb', src: bg, alt: ''}), h('div', {class: 'row'}, h('button', {class: 'btn', onclick: () => replaceBackground(el)}, 'Replace'), el.style.backgroundImage ? h('button', {class: 'btn', onclick: () => { el.style.removeProperty('background-image'); commit('Reset background'); renderPanel(); }}, 'Reset') : null)));
    DATA_FIELDS.forEach(([attr, label, type, hint]) => {
      if (!el.hasAttribute(attr)) return;
      if (type === 'image') content.push(h('div', {class: 'f'}, h('span', {}, label), h('div', {class: 'row'}, h('img', {src: el.getAttribute(attr), alt: '', style: 'width:64px;height:44px;object-fit:cover;border-radius:6px;background:#eee'}), h('button', {class: 'btn small', onclick: () => setAttrMedia(el, attr, 'image')}, 'Change')), hint ? h('em', {}, hint) : null));
      else content.push(F(label, txt(el.getAttribute(attr), v => el.setAttribute(attr, v), label), hint));
    });
    if (el.style.getPropertyValue('--ar')) content.push(F('Panorama shape (width ÷ height)', num(el.style.getPropertyValue('--ar'), v => v ? el.style.setProperty('--ar', v) : null, 'Panorama shape', '2.5', .01), 'Bigger number = wider and thinner band'));
    if (el.style.getPropertyValue('--lh')) content.push(F('Logo size (%)', num(parseFloat(el.style.getPropertyValue('--lh')), v => v ? el.style.setProperty('--lh', v + '%') : null, 'Logo size')));
    if (!content.length) content.push(h('p', {class: 'hint'}, 'Click inside it to select a photo, text or button within. Use Style and Layout below to change how this box looks.'));
    sec('Content', true, content);

    // --- style ---
    const S = el.style;
    sec('Style', false,
      (() => {
        const i = num(pxOf(S.fontSize), v => { if (v === '') S.removeProperty('font-size'); else S.fontSize = `clamp(${Math.max(10, Math.round(v * .6))}px, ${(v / 14.4).toFixed(2)}vw, ${v}px)`; }, 'Text size');
        return F('Text size (px)', i, 'Size on a large screen; it scales down on phones');
      })(),
      F('Text weight', (() => { const s = h('select'); [['', 'Design default'], ['200', 'Thin'], ['300', 'Light'], ['400', 'Regular'], ['600', 'Semi-bold'], ['750', 'Bold'], ['800', 'Extra bold']].forEach(([v, l]) => s.append(h('option', {value: v}, l))); s.value = S.fontWeight || ''; s.addEventListener('change', () => { s.value ? S.fontWeight = s.value : S.removeProperty('font-weight'); commit('Text weight'); }); return s; })()),
      F('Text colour', colorCtl(el, 'color', 'Text colour')),
      F('Alignment', seg([['', 'Default'], ['start', HE ? 'Right' : 'Left'], ['center', 'Center'], ['end', HE ? 'Left' : 'Right']], S.textAlign, v => { v ? S.textAlign = v : S.removeProperty('text-align'); commit('Alignment'); renderPanel(); })),
      F('Background colour', colorCtl(el, 'background-color', 'Background colour')),
      h('div', {class: 'row'}, styleNum(el, 'padding-top', 'Space inside, top'), styleNum(el, 'padding-bottom', 'bottom')),
      h('div', {class: 'row'}, styleNum(el, 'margin-top', 'Space above'), styleNum(el, 'margin-bottom', 'Space below')),
      h('div', {class: 'row'}, styleNum(el, 'max-width', 'Max width'), styleNum(el, 'border-radius', 'Rounded corners')),
      el.matches('.blk-space') || S.height ? styleNum(el, 'height', 'Height') : null,
      F('Opacity', (() => { const r = h('input', {type: 'range', min: 0, max: 1, step: .05}); r.value = S.opacity || 1; r.addEventListener('input', () => { +r.value === 1 ? S.removeProperty('opacity') : S.opacity = r.value; changeCommit('Opacity'); }); return r; })()),
      h('button', {class: 'btn small', onclick: () => { ['font-size', 'font-weight', 'color', 'text-align', 'background-color', 'padding-top', 'padding-bottom', 'margin-top', 'margin-bottom', 'max-width', 'border-radius', 'opacity', 'height'].forEach(p => S.removeProperty(p)); commit('Reset style'); renderPanel(); }}, 'Reset all style'));

    // --- layout ---
    const cs = getComputedStyle(el);
    if (el.children.length > 1 || /grid|flex/.test(cs.display)) {
      const cols = el.dataset.layoutCols || '';
      sec('Layout', false,
        F('Columns on desktop', seg([['', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], cols, v => { v ? el.dataset.layoutCols = v : el.removeAttribute('data-layout-cols'); if (v) { el.style.display = el.style.display || ''; } commit('Columns'); renderPanel(); }), 'Puts the items inside side by side. Phones always show one below another.'),
        /grid|flex/.test(cs.display) || cols ? styleNum(el, 'gap', 'Gap between items') : null,
        /grid|flex/.test(cs.display) || cols ? F('Line up items', seg([['', 'Default'], ['start', 'Top'], ['center', 'Middle'], ['end', 'Bottom'], ['stretch', 'Stretch']], S.alignItems, v => { v ? S.alignItems = v : S.removeProperty('align-items'); commit('Line up items'); renderPanel(); })) : null);
    }

    // --- position, visibility, anchor ---
    const [ox, oy] = getOffset(el);
    sec('Position and visibility', false,
      h('p', {class: 'hint'}, 'Drag the move handle to put it somewhere else. Hold Shift while dragging (or press Alt + arrow keys) to shift it freely.'),
      h('div', {class: 'row'}, F('Shift right (px)', num(ox || '', v => setOffset(el, +v || 0, getOffset(el)[1]), 'Position', '0')), F('Shift down (px)', num(oy || '', v => setOffset(el, getOffset(el)[0], +v || 0), 'Position', '0'))),
      (ox || oy) ? h('button', {class: 'btn small', style: 'margin-bottom:12px', onclick: () => { setOffset(el, 0, 0); commit('Reset position'); renderPanel(); }}, 'Put back in place') : null,
      F('Show on', seg([['', 'All screens'], ['mobile', 'Desktop only'], ['desktop', 'Phones only']], el.dataset.hide || '', v => { v ? el.dataset.hide = v : el.removeAttribute('data-hide'); commit('Visibility'); renderPanel(); }), 'Hidden items show with an orange outline while editing'),
      F('Anchor name', txt(el.id, v => v ? el.id = v.replace(/\s+/g, '-') : el.removeAttribute('id'), 'Anchor name', 'e.g. work'), 'Lets a link jump here with #name'));
    pbody.append(...sections);
  };
  // the contact form's per-topic texts
  const formTexts = form => {
    const D = window.MWP_FORM_DEFAULTS || {asks: {}, about: {}, starts: {}};
    let cur = {}; try { cur = JSON.parse(form.dataset.texts || '{}'); } catch (_) {}
    const get = (k, t) => (cur[k] && cur[k][t] !== undefined) ? cur[k][t] : (D[k] || {})[t];
    const topics = $$('option', $('select', form) || form).map(o => [o.value, o.textContent]);
    const save = () => { form.dataset.texts = JSON.stringify(cur); changeCommit('Form texts'); };
    const set = (k, t, v) => { cur[k] = cur[k] || {}; cur[k][t] = v; save(); };
    return h('div', {class: 'f'}, h('span', {}, 'What the form suggests for each topic'),
      ...topics.map(([t, label]) => {
        const ask_ = h('input', {type: 'text'}); ask_.value = get('asks', t) || ''; ask_.addEventListener('input', () => set('asks', t, ask_.value));
        const ab = h('input', {type: 'text'}); ab.value = get('about', t) || ''; ab.addEventListener('input', () => set('about', t, ab.value));
        const st = h('textarea', {rows: 3}); st.value = (get('starts', t) || []).join('\n'); st.addEventListener('input', () => set('starts', t, st.value.split('\n').map(s => s.trim()).filter(Boolean)));
        return h('div', {class: 'form-topic'}, h('b', {}, label), F('Hint in the message box', ask_), F('Ready-made messages (one per line)', st), F('WhatsApp opening (“…about ___”)', ab));
      }));
  };
  const renderOutline = () => {
    const items = [...mainEl().children, ...[...root.children].filter(c => c !== mainEl())].filter(c => !c.matches('script,style,template,a.skip,dialog.lb'));
    pbody.append(h('p', {class: 'hint'}, 'Click a name to jump to it. Click anything on the page to edit it.'));
    items.forEach(it => {
      const head = $('h1,h2,h3,.kick', it);
      const label = (it.id ? '#' + it.id + ' · ' : '') + (head ? head.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : nameOf(it));
      pbody.append(h('div', {class: 'outline-item'},
        h('b', {title: label, onclick: () => { select(it); it.scrollIntoView({block: 'start', behavior: 'smooth'}); }}, label),
        h('small', {}, nameOf(it)),
        h('button', {class: 'btn small', title: 'Move up', html: ico('arrowUp', 14), onclick: () => { moveBy(it, -1); renderPanel(); }}),
        h('button', {class: 'btn small', title: 'Move down', html: ico('arrowDown', 14), onclick: () => { moveBy(it, 1); renderPanel(); }})));
    });
  };

  // =====================================================================
  // Page settings (title / description for Google)
  // =====================================================================
  const pageSettings = async () => {
    const v = await ask('Page settings', [
      {name: 'title', label: 'Page title (browser tab and Google)', value: meta.title || document.title},
      {name: 'description', label: 'Description (shown under the title in Google)', type: 'textarea', value: meta.description || ($('meta[name="description"]') || {}).content || ''},
    ], 'Apply');
    if (!v) return;
    meta = {...meta, title: v.title.trim(), description: v.description.trim()};
    M.applyMeta(meta); setStatus(); saveDraft();
  };

  // =====================================================================
  // Publish, preview, history
  // =====================================================================
  let publishing = false;
  const publish = async () => {
    if (publishing) return;
    finishEdit();
    if (!isDirty()) { toast('Nothing new to publish.'); return; }
    const v = await ask('Publish changes', [{name: 'note', label: 'What did you change? (optional)', placeholder: 'e.g. New photos in the Work reel', hint: 'Helps you find this version later in History.'}], 'Publish');
    if (!v) return;
    const send = async base => sb.rpc('publish_page', {p_page: PAGE, p_html: cleanHTML(), p_meta: meta, p_note: v.note || null, p_restored_from: null, p_base_version: base});
    publishing = true; const btn = U('[data-a="save"]'); btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      let {data, error} = await send(baseVersion);
      if (error && /CONFLICT/.test(error.message || '')) {
        const ok = await confirmBox('Someone else published', 'The page was published from somewhere else after you opened the editor. Publishing now replaces that version (it stays in History).', 'Publish anyway');
        if (!ok) return;
        ({data, error} = await send(null));
      }
      if (error) throw error;
      baseVersion = data; baseHTML = cleanHTML(); baseMeta = {...meta};
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
      setStatus(); toast(`Published · version #${data} is live`);
    } catch (err) {
      console.error(err);
      toast('Could not publish: ' + (err.message || err));
    } finally { publishing = false; btn.disabled = false; btn.textContent = 'Save'; }
  };
  const previewHTML = (html, metaObj) => {
    try { sessionStorage.setItem('mwp-preview-' + PAGE, JSON.stringify({html, meta: metaObj || {}})); } catch (_) { toast('Preview is too large for this browser.'); return null; }
    return VIEW_URL + '?preview';
  };
  const preview = () => {
    finishEdit();
    const url = previewHTML(cleanHTML(), meta); if (!url) return;
    const frame = h('iframe', {src: url, title: 'Preview', style: 'width:100%'});
    const sizes = [['Desktop', '100%'], ['Tablet', '820px'], ['Phone', '390px']];
    const switcher = h('div', {class: 'seg', style: 'width:300px'}, sizes.map(([l, w], i) => h('button', {class: i ? '' : 'on', onclick: e => { switcher.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); frame.style.width = w; }}, l)));
    const md = modal({title: 'Preview (not published yet)', size: 'full', body: h('div', {style: 'display:flex;flex-direction:column;gap:12px;height:100%'}, h('div', {class: 'row'}, switcher, h('span', {class: 'grow', style: 'flex:1'}), h('button', {class: 'btn', onclick: () => open(url, '_blank')}, 'Open in a new tab')), h('div', {class: 'frames'}, frame))});
    md.el.querySelector('.mb').style.cssText = 'display:flex;flex-direction:column;padding:12px;overflow:hidden';
  };
  const loadVersionHTML = async id => {
    const {data, error} = await sb.from('site_versions').select('html,meta').eq('id', id).single();
    if (error) throw error; return data;
  };
  const showHistory = async () => {
    finishEdit();
    const list = h('div', {}, h('div', {class: 'row'}, h('div', {class: 'spin'}), 'Loading…'));
    const md = modal({title: `Version history · ${HE ? 'Hebrew' : 'English'} page`, body: list, size: 'wide'});
    const {data, error} = await sb.from('site_versions').select('id,created_at,author,note,restored_from').eq('page', PAGE).order('id', {ascending: false}).limit(300);
    if (error) { list.replaceChildren(h('p', {}, 'Could not load the history: ' + error.message)); return; }
    const openInEditor = (html, m, label) => { setContent(html); meta = {...(m || {})}; M.applyMeta(meta); deselect(); commit(label); md.close(); toast(label + ' · press Save to publish it'); };
    const restore = async (html, m, id, label) => {
      if (!await confirmBox('Restore this version?', `${label} will be published and become the live page right away. Nothing is lost: the current version stays in History.`, 'Restore and publish')) return;
      const {data: newId, error: e2} = await sb.rpc('publish_page', {p_page: PAGE, p_html: html, p_meta: m || {}, p_note: 'Restored ' + label.toLowerCase(), p_restored_from: id, p_base_version: null});
      if (e2) { toast('Could not restore: ' + e2.message); return; }
      setContent(html); meta = {...(m || {})}; M.applyMeta(meta); deselect();
      baseVersion = newId; baseHTML = cleanHTML(); baseMeta = {...meta}; commit('Restore ' + label.toLowerCase());
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
      setStatus(); md.close(); toast(`${label} restored · now live as version #${newId}`);
    };
    const row = (title, metaLine, isLive, get, id) => h('div', {class: 'vrow'},
      h('div', {}, h('b', {}, title), isLive ? h('span', {class: 'live'}, 'LIVE') : null),
      h('div', {class: 'acts'},
        h('button', {class: 'btn small', onclick: async () => { const v = await get(); const u = previewHTML(v.html, v.meta); if (u) open(u, '_blank'); }}, 'Preview'),
        h('button', {class: 'btn small', onclick: async () => { const v = await get(); openInEditor(v.html, v.meta, 'Opened ' + title.toLowerCase()); }}, 'Open in editor'),
        isLive ? null : h('button', {class: 'btn small primary', onclick: async () => { const v = await get(); restore(v.html, v.meta, id, title); }}, 'Restore')),
      h('div', {class: 'meta'}, metaLine));
    const rows = (data || []).map(v => row(`Version #${v.id}`, `${fmtTime(v.created_at)} · ${v.author || 'admin'}${v.note ? ' · “' + v.note + '”' : ''}${v.restored_from ? ' · restored from #' + v.restored_from : ''}`, v.id === baseVersion, () => loadVersionHTML(v.id), v.id));
    rows.push(row('Original design', 'The page as it was built, from the website files', !baseVersion, async () => ({html: M.original, meta: {}}), null));
    list.replaceChildren(h('p', {class: 'hint', style: 'margin-top:0'}, '“Open in editor” loads a version so you can look and change it before saving. “Restore” publishes it straight away.'), ...rows);
  };

  // =====================================================================
  // Top bar actions
  // =====================================================================
  const leave = async url => {
    finishEdit();
    if (isDirty() && !await confirmBox('Leave without publishing?', 'Your changes are kept as a draft in this browser, and you can continue them next time you open the editor. Visitors won’t see them until you Save.', 'Leave')) return;
    leaving = true; location.href = url;
  };
  let leaving = false;
  const actions = {
    undo, redo, save: publish, preview, history: showHistory, add: openAdd, pagesettings: pageSettings,
    panel: () => panel.classList.contains('open') && sel ? closePanel() : openPanel(),
    outline: () => { deselect(); openPanel(); },
    closepanel: closePanel,
    lang: () => leave(OTHER.url),
    more: e => menu(e.currentTarget, [
      {label: 'View the live page', run: () => leave(VIEW_URL)},
      {label: 'Admin dashboard (messages, password)', run: () => leave('admin.html')},
      {label: 'Sign out', run: async () => { if (isDirty() && !await confirmBox('Sign out?', 'Unpublished changes stay as a draft in this browser.', 'Sign out')) return; leaving = true; await sb.auth.signOut(); location.href = 'admin.html'; }},
    ]),
  };
  ui.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => { const fn = actions[b.dataset.a]; if (fn) fn(e); }));
  addEventListener('beforeunload', e => { if (!leaving && isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // =====================================================================
  // Start: load the live page, offer a saved draft, go
  // =====================================================================
  statusEl.textContent = 'Loading the live page…';
  const live = await M.fetchLive();
  if (live && live.html) { setContent(live.html); baseVersion = live.version_id; meta = {...(live.meta || {})}; M.applyMeta(meta); }
  else prepMedia();
  baseHTML = cleanHTML(); baseMeta = {...meta};
  hist.stack = [{html: baseHTML, label: 'Open'}]; hist.i = 0;
  requestAnimationFrame(loop);
  setStatus();

  let draft = null; try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) {}
  if (draft && draft.html && draft.html !== baseHTML) {
    const newer = draft.base !== baseVersion;
    const ok = await confirmBox('Continue where you left off?', `You have changes from ${fmtTime(draft.at)} that were never published.${newer ? ' Note: the page has been published again since then, so continuing replaces those newer changes when you Save.' : ''}`, 'Continue my changes');
    if (ok) { setContent(draft.html); meta = {...(draft.meta || {})}; M.applyMeta(meta); commit('Continue draft'); }
    else { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }
  }
  if (!sessionStorage.getItem('mwe-welcomed')) { sessionStorage.setItem('mwe-welcomed', '1'); toast('Click anything to select it · double-click text to type'); }
})().catch(err => { console.error(err); alert('The editor could not start: ' + (err.message || err)); });
