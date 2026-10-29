(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { profiles: [], settings: null, recentIds: [], selectedId: null, query: '', tab: null, host: '', pending: null };

  function setStatus(msg, kind, id) {
    var el = $(id || 'status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function visibleProfiles() {
    if (state.query.trim()) return DTP.searchProfiles(state.profiles, state.query).slice(0, 50);
    var byId = {};
    state.profiles.forEach(function (p) { byId[p.id] = p; });
    var recent = state.recentIds.map(function (id) { return byId[id]; }).filter(Boolean);
    if (recent.length) return recent.slice(0, 8);
    return state.profiles.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).slice(0, 8);
  }

  function renderList() {
    var list = visibleProfiles();
    var searching = !!state.query.trim();
    var hasRecent = state.recentIds.some(function (id) { return state.profiles.some(function (p) { return p.id === id; }); });
    $('listLabel').textContent = searching ? 'Matching profiles' : (hasRecent ? 'Recent profiles' : 'Saved profiles');
    $('countLabel').textContent = searching ? list.length + ' of ' + state.profiles.length : (state.profiles.length ? state.profiles.length + ' saved' : '');

    if (!list.some(function (p) { return p.id === state.selectedId; })) {
      state.selectedId = list.length ? list[0].id : null;
    }

    var ul = $('list');
    ul.textContent = '';
    list.forEach(function (p) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(p.id === state.selectedId));
      btn.dataset.id = p.id;
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.profileName;
      var user = document.createElement('span');
      user.className = 'user';
      user.textContent = p.username || 'no username';
      btn.appendChild(name);
      btn.appendChild(user);
      btn.addEventListener('click', function () { select(p.id); });
      li.appendChild(btn);
      ul.appendChild(li);
    });

    var empty = $('empty');
    empty.hidden = list.length > 0;
    if (!list.length) {
      $('emptyText').textContent = searching ? 'No profile matches "' + state.query.trim() + '".' : 'No profiles yet.';
      $('emptyAddBtn').hidden = searching;
    }
    $('fillBtn').disabled = !state.selectedId;
  }

  function select(id) {
    state.selectedId = id;
    DTP.setSelected(id).catch(function () {});
    Array.prototype.forEach.call($('list').querySelectorAll('.item'), function (b) {
      b.setAttribute('aria-selected', String(b.dataset.id === id));
    });
    $('fillBtn').disabled = false;
    setStatus('');
  }

  function renderSite() {
    var text = $('siteText');
    var btn = $('authBtn');
    btn.hidden = true;
    var url = state.tab && state.tab.url;
    if (!url || !/^https?:\/\//i.test(url)) {
      text.textContent = 'Open the website you want to test, then click the icon.';
      return;
    }
    state.host = new URL(url).hostname.toLowerCase();
    if (DTP.isHostAuthorized(state.host, state.settings.domains)) {
      text.textContent = state.host + ' • authorized';
      text.style.color = 'var(--accent)';
    } else {
      text.textContent = state.host + ' • not authorized';
      text.style.color = 'var(--warm)';
      btn.hidden = false;
    }
  }

  async function fillForm() {
    var profile = state.profiles.filter(function (p) { return p.id === state.selectedId; })[0];
    if (!profile) return setStatus('Select a profile first.', 'error');
    if (!state.settings.autofill) return setStatus('Autofill is turned off. Turn it on in Settings.', 'error');
    var tab = state.tab;
    if (!tab || !/^https?:\/\//i.test(tab.url || '')) return setStatus('Open the website you want to test first.', 'error');
    if (!DTP.isHostAuthorized(state.host, state.settings.domains)) {
      return setStatus(state.host + ' is not an authorized testing site. Authorize it first.', 'warn');
    }

    var opts = { includePassword: $('optPassword').checked, overwrite: $('optOverwrite').checked };
    var payload = {
      fullName: profile.fullName, firstName: profile.firstName, lastName: profile.lastName,
      username: profile.username, nic: profile.nic, email: profile.email,
      password: profile.password, confirmPassword: profile.confirmPassword,
      phone: profile.phone, altPhone: profile.altPhone, dob: profile.dob, address: profile.address,
      city: profile.city, postalCode: profile.postalCode, role: profile.role, custom: profile.custom
    };

    $('fillBtn').disabled = true;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      var out = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function (p, o) { return window.__DTP_FILL(p, o); },
        args: [payload, opts]
      });
      var r = out && out[0] && out[0].result;
      if (!r) throw new Error('No response from the page.');
      await DTP.addRecent(profile.id);
      state.recentIds = await DTP.getRecentIds();
      reportFill(r, opts);
    } catch (e) {
      setStatus('Could not fill this page. Chrome blocks extensions on some pages (like the Web Store); try a normal website.', 'error');
    } finally {
      $('fillBtn').disabled = !state.selectedId;
    }
  }

  function reportFill(r, opts) {
    var n = r.filled.length;
    if (!r.total) return setStatus('No fillable fields found on this page.', 'warn');
    if (!n) {
      var why = r.skipped.length ? ' Fields already had values; tick "Replace values" to overwrite.' : ' No field matched this profile.';
      return setStatus('Nothing was filled.' + why, 'warn');
    }
    var msg = 'Filled ' + n + (n === 1 ? ' field' : ' fields') + '. Undo is on the page.';
    var notes = [];
    if (r.unmatched.length) notes.push('Not matched: ' + r.unmatched.slice(0, 4).join(', ') + (r.unmatched.length > 4 ? '…' : ''));
    if (r.noValue.length) notes.push('Profile has no value for: ' + r.noValue.slice(0, 4).join(', '));
    if (r.skipped.length) notes.push(r.skipped.length + ' already had a value');
    if (r.otherForms) notes.push(r.otherForms + ' other form' + (r.otherForms > 1 ? 's' : '') + ' left alone');
    if (!opts.includePassword) notes.push('passwords skipped');
    setStatus(msg + (notes.length ? ' ' + notes.join('. ') + '.' : ''), notes.length ? 'warn' : 'ok');
  }

  function openAccounts(hash) {
    chrome.tabs.create({ url: chrome.runtime.getURL('accounts.html') + (hash || '') });
    window.close();
  }

  /* Settings view */
  function renderSettings() {
    var s = state.settings;
    $('setAutofill').checked = s.autofill;
    $('setSuggest').checked = s.suggest;
    $('setTheme').value = s.theme;
    var ul = $('domainList');
    ul.textContent = '';
    if (!s.domains.length) {
      var none = document.createElement('li');
      none.className = 'none';
      none.textContent = 'No domains yet. Add the sites you are allowed to test.';
      ul.appendChild(none);
    }
    s.domains.forEach(function (d) {
      var li = document.createElement('li');
      var t = document.createElement('span');
      t.textContent = d;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'icon-btn';
      rm.setAttribute('aria-label', 'Remove ' + d);
      rm.textContent = '×';
      rm.addEventListener('click', async function () {
        state.settings = await DTP.saveSettings({ domains: state.settings.domains.filter(function (x) { return x !== d; }) });
        renderSettings();
        renderSite();
      });
      li.appendChild(t);
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }

  async function addDomain(raw) {
    var d = DTP.normalizeDomain(raw);
    if (!d || d === '*' ) return setStatus('Enter a domain like staging.example.com or *.example.com.', 'error', 'settingsStatus');
    if (state.settings.domains.indexOf(d) >= 0) return setStatus(d + ' is already in the list.', 'warn', 'settingsStatus');
    state.settings = await DTP.saveSettings({ domains: state.settings.domains.concat([d]) });
    $('domainInput').value = '';
    setStatus('Added ' + d + '.', 'ok', 'settingsStatus');
    renderSettings();
    renderSite();
  }

  function askConfirm(text, action) {
    state.pending = action;
    $('confirmText').textContent = text;
    $('confirmBox').hidden = false;
    $('confirmNo').focus();
  }

  function showView(name) {
    $('mainView').hidden = name !== 'main';
    $('settingsView').hidden = name !== 'settings';
    if (name === 'settings') { renderSettings(); setStatus('', '', 'settingsStatus'); $('confirmBox').hidden = true; }
    else { renderList(); renderSite(); }
  }

  function bind() {
    $('search').addEventListener('input', function (e) {
      state.query = e.target.value;
      renderList();
      setStatus('');
    });
    $('search').addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call($('list').querySelectorAll('.item'));
      var idx = items.findIndex(function (b) { return b.dataset.id === state.selectedId; });
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); select(items[Math.min(idx + 1, items.length - 1)].dataset.id); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); select(items[Math.max(idx - 1, 0)].dataset.id); }
      else if (e.key === 'Enter' && state.selectedId) { e.preventDefault(); $('fillBtn').focus(); }
    });
    $('fillBtn').addEventListener('click', fillForm);
    $('addBtn').addEventListener('click', function () { openAccounts('#new'); });
    $('emptyAddBtn').addEventListener('click', function () { openAccounts('#new'); });
    $('manageBtn').addEventListener('click', function () { openAccounts(''); });
    $('settingsBtn').addEventListener('click', function () { showView('settings'); });
    $('backBtn').addEventListener('click', function () { showView('main'); });

    $('authBtn').addEventListener('click', async function () {
      var d = DTP.normalizeDomain(state.host);
      if (!d) return;
      state.settings = await DTP.saveSettings({ domains: state.settings.domains.concat([d]) });
      renderSite();
      setStatus(d + ' authorized. Click Fill Form to continue.', 'ok');
    });

    $('setAutofill').addEventListener('change', async function (e) {
      state.settings = await DTP.saveSettings({ autofill: e.target.checked });
      setStatus(e.target.checked ? 'Autofill is on.' : 'Autofill is off.', 'ok', 'settingsStatus');
    });
    $('setSuggest').addEventListener('change', async function (e) {
      state.settings = await DTP.saveSettings({ suggest: e.target.checked });
      setStatus(e.target.checked ? 'Suggestions are on.' : 'Suggestions are off.', 'ok', 'settingsStatus');
    });
    $('setTheme').addEventListener('change', async function (e) {
      state.settings = await DTP.saveSettings({ theme: e.target.value });
      DTP.applyTheme(state.settings.theme);
    });
    $('domainAddBtn').addEventListener('click', function () { addDomain($('domainInput').value); });
    $('domainInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addDomain(e.target.value); } });

    $('clearRecentBtn').addEventListener('click', function () {
      askConfirm('Clear the list of recently used profiles? Your profiles are not deleted.', async function () {
        await DTP.clearRecent();
        state.recentIds = [];
        setStatus('Recent history cleared.', 'ok', 'settingsStatus');
      });
    });
    $('resetBtn').addEventListener('click', function () {
      askConfirm('Reset autofill, theme and authorized domains to their defaults? Your profiles are not deleted.', async function () {
        state.settings = await DTP.resetSettings();
        DTP.applyTheme(state.settings.theme);
        renderSettings();
        setStatus('Preferences reset.', 'ok', 'settingsStatus');
      });
    });
    $('confirmYes').addEventListener('click', async function () {
      var action = state.pending;
      state.pending = null;
      $('confirmBox').hidden = true;
      try { if (action) await action(); } catch (e) { setStatus(e.message, 'error', 'settingsStatus'); }
    });
    $('confirmNo').addEventListener('click', function () { state.pending = null; $('confirmBox').hidden = true; });
  }

  async function init() {
    bind();
    try {
      var results = await Promise.all([DTP.getProfiles(), DTP.getSettings(), DTP.getRecentIds(), DTP.getSelected()]);
      state.profiles = results[0];
      state.settings = results[1];
      state.recentIds = results[2];
      state.selectedId = results[3];
      DTP.applyTheme(state.settings.theme);
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      state.tab = tabs && tabs[0] ? tabs[0] : null;
    } catch (e) {
      setStatus('Could not load saved data.', 'error');
    }
    if (!state.settings) state.settings = Object.assign({}, DTP.DEFAULT_SETTINGS, { domains: [] });
    renderList();
    renderSite();
    $('search').focus();
  }

  init();
})();
