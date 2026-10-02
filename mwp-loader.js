// Loads the published (edited) version of this page from Supabase, then starts the site's animations.
// ?edit   → opens the visual editor (admins only)
// ?preview → shows the editor's unsaved preview from this browser tab
(() => {
  const html = document.documentElement;
  const root = document.getElementById('site');
  const page = html.lang === 'he' ? 'he' : 'en';
  const q = new URLSearchParams(location.search);
  const cfg = window.MWP_SUPABASE || {};
  const ready = !!(cfg.url && cfg.key && !/YOUR-/.test(cfg.url + cfg.key));
  const base = ready ? cfg.url.replace(/\/+$/, '') : '';

  const headers = () => {
    const h = {apikey: cfg.key};
    if (String(cfg.key).startsWith('eyJ')) h.Authorization = 'Bearer ' + cfg.key; // older "anon" keys
    return h;
  };

  const applyMeta = meta => {
    if (!meta) return;
    if (meta.title) document.title = meta.title;
    if (meta.description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
      m.content = meta.description;
    }
  };

  const fetchLive = async () => {
    if (!ready) return null;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(`${base}/rest/v1/site_pages?page=eq.${page}&select=html,meta,version_id,updated_at`, {headers: headers(), signal: ctl.signal, cache: 'no-store'});
      if (!r.ok) return null;
      const rows = await r.json();
      return rows[0] || null;
    } catch (_) { return null; } finally { clearTimeout(t); }
  };

  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.body.appendChild(s);
  });

  const hasSession = () => {
    try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); } catch (_) { return false; }
  };

  const boot = () => {
    try { if (window.MWP_BOOT) window.MWP_BOOT(); }
    catch (e) { console.error('The site script stopped:', e); html.classList.remove('js'); } // show everything, unanimated
  };

  window.MWP = {page, root, original: root.innerHTML, cfg, base, ready, headers, applyMeta, fetchLive, loadScript};

  if (q.has('edit')) {
    html.classList.remove('js', 'mwp-wait');
    html.classList.add('mwe-editing');
    loadScript('vendor/supabase.js').then(() => loadScript('editor.js')).catch(e => alert(e.message));
    return;
  }

  (async () => {
    let live = null, preview = false;
    if (q.has('preview')) {
      try { live = JSON.parse(sessionStorage.getItem('mwp-preview-' + page) || 'null'); } catch (_) {}
      preview = !!live;
    }
    if (!live) live = await fetchLive();
    if (live && live.html) { root.innerHTML = live.html; applyMeta(live.meta); }
    html.classList.remove('mwp-wait');
    boot();

    if (preview) {
      const r = document.createElement('div');
      r.className = 'mwp-ribbon';
      r.textContent = 'Preview · not published yet';
      document.body.appendChild(r);
    } else if (hasSession()) {
      const bar = document.createElement('div');
      bar.className = 'mwp-adminbar';
      const editUrl = location.pathname + '?edit';
      bar.innerHTML = `<a href="${editUrl}">✎ Edit this page</a><a href="admin.html">Admin</a>`;
      document.body.appendChild(bar);
    }
  })();
})();
