/* Dilo's Testing Platform - suggestions while typing.
 * Runs on every http(s) page but does nothing unless the site is on your
 * authorized list and autofill + suggestions are on. Shows a small list of
 * matching profiles (name and username only, never passwords) under name,
 * NIC, username, email and phone fields. Nothing is filled until you pick a
 * profile with a real click or the Enter key. */
(function () {
  'use strict';
  if (window.__DTP_SUGGEST || !window.DTP || !window.__DTP_INTERNAL || !window.__DTP_FILL) return;
  window.__DTP_SUGGEST = true;

  var TRIGGER = ['fullName', 'firstName', 'lastName', 'nic', 'username', 'email', 'phone'];
  var TEXT_TYPES = ['text', 'email', 'tel', ''];
  var state = { enabled: false, profiles: [], recent: [] };
  var ui = null;
  var current = null; // { el, key, items, index }

  function css(el, styles) { Object.keys(styles).forEach(function (k) { el.style[k] = styles[k]; }); }

  async function refresh() {
    try {
      var s = await DTP.getSettings();
      var on = s.autofill && s.suggest && DTP.isHostAuthorized(location.hostname.toLowerCase(), s.domains);
      state.enabled = on;
      if (on) {
        state.profiles = await DTP.getProfiles();
        state.recent = await DTP.getRecentIds();
      } else {
        state.profiles = [];
        state.recent = [];
        hide();
      }
    } catch (e) {
      state.enabled = false;
    }
  }

  function triggerKey(el) {
    if (!el || el.tagName !== 'INPUT') return null;
    if (TEXT_TYPES.indexOf((el.getAttribute('type') || '').toLowerCase()) < 0) return null;
    var api = window.__DTP_INTERNAL;
    if (!api.isFillable(el)) return null;
    var keys = api.candidates(api.describe(el), { custom: [] });
    return keys && keys.length && TRIGGER.indexOf(keys[0]) >= 0 ? keys[0] : null;
  }

  function rank(query, key) {
    var list = state.profiles;
    var out;
    if (!query) {
      var byId = {};
      list.forEach(function (p) { byId[p.id] = p; });
      var recent = state.recent.map(function (id) { return byId[id]; }).filter(Boolean);
      var rest = list.filter(function (p) { return recent.indexOf(p) < 0; })
        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      out = recent.concat(rest);
    } else {
      var q = query.toLowerCase();
      out = DTP.searchProfiles(list, q).map(function (p, i) {
        var v = String(p[key] || '').toLowerCase();
        return { p: p, s: v.indexOf(q) === 0 ? 0 : (v.indexOf(q) > 0 ? 1 : 2), i: i };
      }).sort(function (a, b) { return a.s - b.s || a.i - b.i; }).map(function (x) { return x.p; });
    }
    return out.slice(0, 6);
  }

  function ensureUI() {
    if (ui) return ui;
    var host = document.createElement('div');
    host.id = 'dtp-suggest-host';
    var root = host.attachShadow({ mode: 'closed' });
    var box = document.createElement('div');
    css(box, {
      position: 'fixed', zIndex: '2147483647', boxSizing: 'border-box', background: '#151b23', color: '#e6edf3',
      border: '1px solid #2a3441', borderRadius: '8px', boxShadow: '0 10px 28px rgba(0,0,0,.45)',
      font: '13px/1.4 system-ui, sans-serif', overflow: 'hidden'
    });
    root.appendChild(box);
    // Keep focus in the page field while clicking the list.
    box.addEventListener('mousedown', function (e) { e.preventDefault(); });
    ui = { host: host, box: box };
    return ui;
  }

  function position() {
    if (!current || !ui) return;
    var r = current.el.getBoundingClientRect();
    var box = ui.box;
    var width = Math.max(r.width, 280);
    var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    css(box, { width: width + 'px', left: left + 'px' });
    var h = box.offsetHeight;
    var below = r.bottom + 4;
    css(box, { top: (below + h > window.innerHeight && r.top - h - 4 > 0 ? r.top - h - 4 : below) + 'px' });
  }

  function render() {
    var box = ensureUI().box;
    box.textContent = '';
    var head = document.createElement('div');
    head.textContent = 'Dilo’s Testing Platform • pick a profile to fill this form';
    css(head, { padding: '6px 10px', fontSize: '11px', color: '#8b98a7', borderBottom: '1px solid #2a3441' });
    box.appendChild(head);
    current.items.forEach(function (p, i) {
      var row = document.createElement('div');
      var name = document.createElement('div');
      var sub = document.createElement('div');
      name.textContent = p.profileName;
      sub.textContent = [p.username, p.nic, p.email].filter(Boolean).join(' • ') || p.fullName || '';
      css(row, { padding: '7px 10px', cursor: 'pointer', background: i === current.index ? '#1f2b3a' : 'transparent' });
      css(name, { fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      css(sub, { fontSize: '12px', color: '#8b98a7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      row.appendChild(name);
      row.appendChild(sub);
      row.addEventListener('mouseenter', function () { setIndex(i); });
      row.addEventListener('mousedown', function (e) { if (e.isTrusted && e.button === 0) { e.preventDefault(); pick(i); } });
      row.addEventListener('click', function (e) { e.preventDefault(); });
      row.className = 'dtp-row';
      box.appendChild(row);
    });
    if (!ui.host.parentNode) (document.body || document.documentElement).appendChild(ui.host);
    position();
  }

  function setIndex(i) {
    if (!current || !ui) return;
    current.index = i;
    var rows = ui.box.querySelectorAll('.dtp-row');
    for (var k = 0; k < rows.length; k++) rows[k].style.background = k === i ? '#1f2b3a' : 'transparent';
  }

  function show(el, key) {
    if (!state.enabled) return;
    var items = rank((el.value || '').trim(), key);
    if (!items.length) return hide();
    current = { el: el, key: key, items: items, index: 0 };
    render();
  }

  function hide() {
    current = null;
    if (ui && ui.host.parentNode) ui.host.remove();
  }

  async function pick(i) {
    var c = current;
    if (!c || !c.items[i]) return;
    var profile = c.items[i];
    hide();
    // Picking a profile is the explicit action, so passwords are included.
    // Only the field you typed in is replaced; other filled fields are kept.
    window.__DTP_FILL(profile, { includePassword: true, overwrite: false, forceEl: c.el });
    try {
      await DTP.addRecent(profile.id);
      state.recent = await DTP.getRecentIds();
    } catch (e) { /* recent list is optional */ }
  }

  function target(e) { return (e.composedPath && e.composedPath()[0]) || e.target; }

  document.addEventListener('focusin', function (e) {
    if (!e.isTrusted || !state.enabled) return;
    var el = target(e);
    var key = triggerKey(el);
    if (key) show(el, key); else hide();
  }, true);

  document.addEventListener('input', function (e) {
    if (!e.isTrusted || !state.enabled) return;
    var el = target(e);
    var key = triggerKey(el);
    if (key) show(el, key); else hide();
  }, true);

  document.addEventListener('focusout', function () { hide(); }, true);

  document.addEventListener('keydown', function (e) {
    if (!current || !e.isTrusted || target(e) !== current.el) return;
    var n = current.items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((current.index + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(current.index <= 0 ? n - 1 : current.index - 1); }
    else if (e.key === 'Enter' && current.index >= 0) { e.preventDefault(); e.stopPropagation(); pick(current.index); }
    else if (e.key === 'Escape') { hide(); }
  }, true);

  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local') refresh();
    });
  }
  refresh();
})();
