/* Dilo's Testing Platform - form filler.
 * Injected into the active tab only after the user clicks Fill Form on an
 * authorized site. It never clicks buttons, never submits forms, never
 * reads values out of the page, and never logs profile data. */
(function () {
  'use strict';
  if (window.__DTP_FILL) return;

  var SKIP_TYPES = ['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file', 'range', 'color', 'search'];
  var PROTECTED_RE = /\botp\b|one ?time|verification code|captcha|security code|\bpin\b|\b2fa\b|\bmfa\b|authenticator|\btotp\b|sms code/;

  function norm(s) {
    return String(s || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-.\[\]()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function textOf(node) { return node ? (node.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  function collectFields(root, out) {
    var nodes = root.querySelectorAll('input, select, textarea, *');
    // querySelectorAll('*') is only used to find open shadow roots.
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var tag = n.tagName;
      if ((tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') && out.indexOf(n) < 0) out.push(n);
      if (n.shadowRoot) collectFields(n.shadowRoot, out);
    }
    return out;
  }

  function isFillable(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.tagName === 'INPUT' && SKIP_TYPES.indexOf((el.type || 'text').toLowerCase()) >= 0) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    var style = el.ownerDocument.defaultView.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
  }

  function labelFor(el) {
    var parts = [];
    if (el.labels) {
      for (var i = 0; i < el.labels.length; i++) parts.push(textOf(el.labels[i]));
    }
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      by.split(/\s+/).forEach(function (id) {
        var n = el.ownerDocument.getElementById(id);
        if (n) parts.push(textOf(n));
      });
    }
    var wrap = el.closest && el.closest('label');
    if (wrap && !el.labels) parts.push(textOf(wrap));
    if (!parts.join('').trim()) {
      var prev = el.previousElementSibling;
      while (prev && !parts.join('').trim()) {
        if (/^(LABEL|SPAN|DIV|P|LEGEND|SMALL|B|STRONG)$/.test(prev.tagName) && !prev.querySelector('input, select, textarea') && textOf(prev).length < 60) {
          parts.push(textOf(prev));
        }
        prev = prev.previousElementSibling;
        if (parts.join('').trim()) break;
        break;
      }
    }
    if (!parts.join('').trim()) {
      var node = el.parentElement;
      for (var depth = 0; node && depth < 3 && !parts.join('').trim(); depth++, node = node.parentElement) {
        if (node.querySelectorAll('input:not([type=hidden]), select, textarea').length !== 1) break;
        var l = node.querySelector('label, .form-label, [class*="label"]');
        if (l && textOf(l).length < 60) parts.push(textOf(l));
      }
    }
    return parts.join(' ').trim();
  }

  function describe(el) {
    var d = {
      type: (el.type || 'text').toLowerCase(),
      ac: (el.getAttribute('autocomplete') || '').toLowerCase().trim().split(/\s+/).pop() || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      aria: el.getAttribute('aria-label') || '',
      label: labelFor(el)
    };
    d.hay = [d.name, d.id, d.placeholder, d.aria, d.label].map(norm).join(' | ');
    d.display = (d.label || d.aria || d.placeholder || d.name || d.id || d.type).slice(0, 40);
    return d;
  }

  /* Returns an ordered list of profile keys this field could take.
   * An empty list means "not recognised". null means "never fill" (OTP, CAPTCHA...). */
  function candidates(d, profile) {
    var h = d.hay;
    var t = d.type;
    var ac = d.ac;
    var i;

    if (ac === 'one-time-code' || PROTECTED_RE.test(h)) return null;

    if (profile.custom && profile.custom.length) {
      for (i = 0; i < profile.custom.length; i++) {
        var c = profile.custom[i];
        var kws = String(c.match || c.key || '').split(',').map(norm).filter(Boolean);
        for (var k = 0; k < kws.length; k++) {
          if (h.indexOf(kws[k]) >= 0) return ['custom:' + i];
        }
      }
    }

    if (t === 'password' || ac === 'current-password' || ac === 'new-password' || /password|passwd|\bpwd\b|passcode/.test(h)) {
      if (/confirm|retype|re ?enter|repeat|again|verify|\bconf\b|password ?2|\bsecond\b/.test(h)) return ['confirmPassword'];
      return ['password'];
    }
    if (/\brole\b|user ?type|account ?type|user ?level/.test(h)) return ['role'];
    if (t === 'email' || ac === 'email' || /e ?mail/.test(h)) {
      return /user ?name|user ?id|login/.test(h) ? ['email', 'username'] : ['email'];
    }
    if (ac === 'username' || /user ?name|user ?id|userid|login|sign ?in|account name|\bhandle\b|\buid\b|\buser\b/.test(h)) return ['username'];
    if (/\bnic\b|national ?(id|identity)|identity ?(card|number)|\bnid\b|id ?card|\bid ?(no|number)\b/.test(h)) return ['nic'];
    if (t === 'tel' || ac.indexOf('tel') === 0 || /phone|mobile|\btel\b|\bcell\b|contact ?(no|number)|whatsapp/.test(h)) {
      return /\balt|alternat|secondary|\bsecond\b|\bother\b|emergency/.test(h) ? ['altPhone'] : ['phone'];
    }
    if (ac === 'given-name' || /first ?name|given ?name|\bfname\b|forename|\bfirst\b/.test(h)) return ['firstName'];
    if (ac === 'family-name' || /last ?name|sur ?name|family ?name|\blname\b|\blast\b/.test(h)) return ['lastName'];
    if (ac === 'bday' || /birth|\bdob\b|bday/.test(h)) return ['dob'];
    if (ac === 'postal-code' || /post(al)? ?code|\bzip\b|pin ?code/.test(h)) return ['postalCode'];
    if (ac === 'address-level2' || /\bcity\b|\btown\b|suburb/.test(h)) return ['city'];
    if (ac === 'address-line2' || /address ?(line)? ?2|\bapt\b|\bsuite\b|\bunit\b/.test(h)) return [];
    if (ac === 'street-address' || ac === 'address-line1' || /address|street/.test(h)) return ['address'];
    if (ac === 'name' || /full ?name|your name|complete name|display name|legal name|\bname\b/.test(h)) {
      if (/user|company|organi[sz]ation|business|file|profile|school|university|father|mother|spouse|guardian|bank|account|card|street|city|first|last|middle|nick|referr|coupon/.test(h)) return [];
      return ['fullName'];
    }
    return [];
  }

  function valueFor(key, profile, opts, el) {
    var v;
    if (key.indexOf('custom:') === 0) {
      var c = profile.custom[Number(key.slice(7))];
      return c ? String(c.value || '') : '';
    }
    if (key === 'password' || key === 'confirmPassword') {
      if (!opts.includePassword) return '';
      v = key === 'password' ? profile.password : (profile.confirmPassword || profile.password);
      return String(v || '');
    }
    v = String(profile[key] || '');
    if (key === 'dob' && v) v = formatDob(v, el);
    return v;
  }

  function formatDob(iso, el) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m || (el.type || '').toLowerCase() === 'date') return iso;
    var ph = (el.getAttribute('placeholder') || '').toLowerCase();
    var sep = (/[^a-z]/.exec(ph) || ['/'])[0];
    if (/dd\W*mm\W*yyyy/.test(ph)) return m[3] + sep + m[2] + sep + m[1];
    if (/mm\W*dd\W*yyyy/.test(ph)) return m[2] + sep + m[3] + sep + m[1];
    return iso;
  }

  function hasValue(el) {
    if (el.tagName === 'SELECT') return el.selectedIndex > 0 && el.value !== '';
    return String(el.value || '').trim() !== '';
  }

  function setValue(el, value) {
    var win = el.ownerDocument.defaultView || window;
    var proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype
      : win.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  function fillSelect(el, value) {
    var want = value.trim().toLowerCase();
    var found = null;
    var partial = null;
    for (var i = 0; i < el.options.length; i++) {
      var o = el.options[i];
      var ov = String(o.value).trim().toLowerCase();
      var ot = String(o.text).trim().toLowerCase();
      if (ov === want || ot === want) { found = o; break; }
      if (!partial && want && (ot.indexOf(want) >= 0 || ov.indexOf(want) >= 0)) partial = o;
    }
    var pick = found || partial;
    if (!pick) return false;
    setValue(el, pick.value);
    return true;
  }

  function groupOf(el) {
    return el.form || (el.closest && el.closest('form')) || null;
  }

  function showToast(message, undo) {  // message may be long, so the box wraps
    var old = document.getElementById('dtp-toast-host');
    if (old) old.remove();
    var host = document.createElement('div');
    host.id = 'dtp-toast-host';
    var box = document.createElement('div');
    var text = document.createElement('span');
    var undoBtn = document.createElement('button');
    var closeBtn = document.createElement('button');
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host;
    function css(el, styles) { Object.keys(styles).forEach(function (k) { el.style[k] = styles[k]; }); }
    css(host, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' });
    css(box, {
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', maxWidth: '420px',
      background: '#151b23', color: '#e6edf3', border: '1px solid #2a3441', borderLeft: '4px solid #3ddc97',
      borderRadius: '8px', font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.4)'
    });
    function styleBtn(b, primary) {
      css(b, {
        font: '600 12px system-ui, sans-serif', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid #2a3441', background: primary ? '#3ddc97' : 'transparent', color: primary ? '#06130d' : '#8b98a7'
      });
    }
    text.textContent = 'Dilo\u2019s Testing Platform: ' + message;
    undoBtn.textContent = 'Undo';
    undoBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.type = 'button';
    styleBtn(undoBtn, true);
    styleBtn(closeBtn, false);
    var timer = setTimeout(function () { host.remove(); }, 20000);
    undoBtn.addEventListener('click', function () {
      undo();
      text.textContent = 'Fill undone.';
      undoBtn.remove();
      clearTimeout(timer);
      setTimeout(function () { host.remove(); }, 2500);
    });
    closeBtn.addEventListener('click', function () { clearTimeout(timer); host.remove(); });
    box.appendChild(text);
    if (undo) box.appendChild(undoBtn);
    box.appendChild(closeBtn);
    shadow.appendChild(box);
    (document.body || document.documentElement).appendChild(host);
  }

  // Used by suggest.js (same isolated world); not reachable from the page's own scripts.
  window.__DTP_INTERNAL = { describe: describe, candidates: candidates, isFillable: isFillable };

  window.__DTP_FILL = function (profile, opts) {
    opts = opts || {};
    profile = profile || {};
    var all = collectFields(document, []).filter(isFillable);
    var rows = [];

    all.forEach(function (el) {
      var d = describe(el);
      var keys = candidates(d, profile);
      if (keys === null) return; // OTP / CAPTCHA style field: never touched
      var chosen = null;
      var recognised = keys.length > 0;
      for (var i = 0; i < keys.length; i++) {
        var v = valueFor(keys[i], profile, opts, el);
        if (v !== '') { chosen = { key: keys[i], value: v }; break; }
      }
      rows.push({ el: el, d: d, form: groupOf(el), recognised: recognised, chosen: chosen });
    });

    // Fill one form only, so footer newsletter boxes and search bars stay untouched.
    var groups = [];
    rows.forEach(function (r) {
      var g = groups.filter(function (x) { return x.form === r.form; })[0];
      if (!g) { g = { form: r.form, rows: [], score: 0 }; groups.push(g); }
      g.rows.push(r);
      if (r.chosen) g.score++;
    });
    var active = document.activeElement;
    var target = null;
    groups.forEach(function (g) {
      if (!g.score) return;
      if (g.form && active && g.form.contains(active)) target = g;
    });
    if (!target) {
      groups.forEach(function (g) { if (g.score && (!target || g.score > target.score)) target = g; });
    }

    var result = { total: rows.length, filled: [], skipped: [], unmatched: [], noValue: [], otherForms: 0 };
    var undoList = [];

    groups.forEach(function (g) {
      if (g !== target) { if (g.score) result.otherForms++; return; }
      g.rows.forEach(function (r) {
        if (!r.chosen) {
          (r.recognised ? result.noValue : result.unmatched).push(r.d.display);
          return;
        }
        if (hasValue(r.el) && !opts.overwrite && r.el !== opts.forceEl) { result.skipped.push(r.d.display); return; }
        var prev = r.el.value;
        var ok = true;
        if (r.el.tagName === 'SELECT') ok = fillSelect(r.el, r.chosen.value);
        else setValue(r.el, r.chosen.value);
        if (ok) { undoList.push({ el: r.el, prev: prev }); result.filled.push(r.d.display); }
        else result.unmatched.push(r.d.display);
      });
    });

    function undo() {
      undoList.forEach(function (u) { setValue(u.el, u.prev); });
      undoList = [];
    }

    var msg = 'Filled ' + result.filled.length + (result.filled.length === 1 ? ' field.' : ' fields.');
    if (result.noValue.length) msg += ' This profile has no saved value for: ' + result.noValue.slice(0, 6).join(', ') + '.';
    if (result.unmatched.length) msg += ' Not recognised: ' + result.unmatched.slice(0, 6).join(', ') + '.';
    if (result.skipped.length) msg += ' Already had a value: ' + result.skipped.slice(0, 6).join(', ') + '.';
    if (result.otherForms) msg += ' ' + result.otherForms + ' other form(s) left alone.';
    if (result.filled.length || result.noValue.length || result.unmatched.length || result.skipped.length) {
      showToast(msg, result.filled.length ? undo : null);
    }
    return result;
  };
})();
