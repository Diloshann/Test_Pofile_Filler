(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var FIELD_KEYS = ['profileName', 'fullName', 'firstName', 'lastName', 'username', 'nic', 'email', 'password',
    'confirmPassword', 'phone', 'altPhone', 'dob', 'address', 'city', 'postalCode', 'role'];
  var state = { profiles: [], selectedId: null, query: '', editingId: '' };
  var toastTimer = null;

  function toast(message, kind) {
    var t = $('toast');
    t.textContent = message;
    t.className = 'toast' + (kind === 'error' ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, kind === 'error' ? 6000 : 3500);
  }

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'class') n.className = props[k];
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  /* ---------- list ---------- */

  async function load() {
    var res = await Promise.all([DTP.getProfiles(), DTP.getSelected()]);
    state.profiles = res[0].sort(function (a, b) { return a.profileName.localeCompare(b.profileName, undefined, { sensitivity: 'base' }); });
    state.selectedId = res[1];
    render();
  }

  function render() {
    var list = DTP.searchProfiles(state.profiles, state.query);
    var searching = !!state.query.trim();
    $('countLabel').textContent = !state.profiles.length ? '' :
      (searching ? list.length + ' of ' + state.profiles.length + ' match' : state.profiles.length + (state.profiles.length === 1 ? ' profile' : ' profiles'));

    var grid = $('grid');
    grid.textContent = '';
    list.forEach(function (p) { grid.appendChild(card(p)); });

    $('emptyState').hidden = list.length > 0;
    if (!list.length) {
      $('emptyTitle').textContent = searching ? 'No matching profiles' : 'No test accounts yet';
      $('emptyText').textContent = searching ? 'Try a different name, username, NIC, email or phone number.' : 'Add a profile once, then fill any login or signup form with one click.';
      $('emptyAddBtn').hidden = searching;
    }
  }

  function row(label, value, mono) {
    if (!value) return [];
    return [el('dt', { text: label }), el('dd', { text: value, class: mono ? 'mono' : '' })];
  }

  function card(p) {
    var active = p.id === state.selectedId;
    var head = el('div', { class: 'card-head' }, [el('h3', { text: p.profileName })]);
    if (active) head.appendChild(el('span', { class: 'badge ok', text: 'Active' }));

    var rows = el('dl', { class: 'rows' });
    [].concat(row('Name', p.fullName), row('Username', p.username, true), row('Email', p.email, true),
      row('Phone', p.phone, true), row('Role', p.role)).forEach(function (n) { rows.appendChild(n); });
    if (!rows.children.length) rows.appendChild(el('dd', { class: 'muted', text: 'No details saved yet.' }));

    var actions = el('div', { class: 'card-actions' });
    function act(label, cls, fn) {
      var b = el('button', { type: 'button', class: 'btn small ' + cls, text: label });
      b.addEventListener('click', fn);
      actions.appendChild(b);
    }
    act(active ? 'Selected' : 'Select', active ? 'primary' : '', function () { selectProfile(p); });
    act('Edit', '', function () { openForm(p); });
    act('Duplicate', '', function () { duplicate(p); });
    act('Delete', 'danger', function () { remove(p); });

    return el('article', { class: 'card' + (active ? ' active' : '') }, [head, rows, actions]);
  }

  async function selectProfile(p) {
    try {
      await DTP.setSelected(p.id);
      state.selectedId = p.id;
      render();
      toast('"' + p.profileName + '" is selected. Open the extension on a test site and click Fill Form.');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function duplicate(p) {
    try {
      var copy = await DTP.duplicateProfile(p.id);
      await load();
      toast('Duplicated as "' + copy.profileName + '".');
    } catch (e) { toast(e.message, 'error'); }
  }

  function confirmBox(title, text, yesLabel) {
    return new Promise(function (resolve) {
      var dlg = $('confirmDlg');
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      $('confirmYes').textContent = yesLabel;
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        dlg.close();
        resolve(v);
      }
      $('confirmYes').onclick = function () { finish(true); };
      $('confirmNo').onclick = function () { finish(false); };
      dlg.oncancel = function (e) { e.preventDefault(); finish(false); };
      dlg.showModal();
      $('confirmNo').focus();
    });
  }

  async function remove(p) {
    var ok = await confirmBox('Delete "' + p.profileName + '"?', 'This removes the profile from this browser. It cannot be undone.', 'Delete');
    if (!ok) return;
    try {
      await DTP.deleteProfile(p.id);
      await load();
      toast('Deleted "' + p.profileName + '".');
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------- form ---------- */

  function fieldInput(key) { return $('f_' + key); }

  function resetPasswordToggles() {
    Array.prototype.forEach.call(document.querySelectorAll('.toggle'), function (b) {
      $(b.dataset.target).type = 'password';
      b.textContent = 'Show';
      b.setAttribute('aria-pressed', 'false');
    });
  }

  function clearErrors() {
    FIELD_KEYS.forEach(function (k) {
      var e = $('err_' + k);
      if (e) e.textContent = '';
      fieldInput(k).removeAttribute('aria-invalid');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.custom-row .err'), function (e) { e.textContent = ''; });
    $('formError').hidden = true;
  }

  function customRow(c, index) {
    c = c || { key: '', value: '', match: '' };
    var r = el('div', { class: 'custom-row' });
    function input(cls, label, value, ph) {
      var i = el('input', { type: 'text', class: cls, 'aria-label': label, placeholder: ph, autocomplete: 'off' });
      i.value = value || '';
      return i;
    }
    var rm = el('button', { type: 'button', class: 'btn rm', 'aria-label': 'Remove custom field', text: '×' });
    rm.addEventListener('click', function () { r.remove(); });
    r.appendChild(input('c-key', 'Custom field name', c.key, 'Field name'));
    r.appendChild(input('c-value', 'Custom field value', c.value, 'Value'));
    r.appendChild(input('c-match', 'Match words (optional)', c.match, 'Match words (optional)'));
    r.appendChild(rm);
    r.appendChild(el('span', { class: 'err', id: 'err_custom_' + index }));
    return r;
  }

  function renumberCustom() {
    Array.prototype.forEach.call($('customList').children, function (r, i) {
      var e = r.querySelector('.err');
      if (e) e.id = 'err_custom_' + i;
    });
  }

  function fillForm(p) {
    FIELD_KEYS.forEach(function (k) { fieldInput(k).value = p[k] || ''; });
    var list = $('customList');
    list.textContent = '';
    (p.custom || []).forEach(function (c, i) { list.appendChild(customRow(c, i)); });
  }

  function openForm(profile) {
    clearErrors();
    resetPasswordToggles();
    var p = profile || DTP.blankProfile();
    state.editingId = profile ? profile.id : '';
    $('dlgTitle').textContent = profile ? 'Edit "' + profile.profileName + '"' : 'Add New User';
    $('saveBtn').textContent = profile ? 'Save changes' : 'Save profile';
    fillForm(p);
    if (!$('profileDlg').open) $('profileDlg').showModal();
    $('profileDlg').querySelector('.dlg-body').scrollTop = 0;
    fieldInput('profileName').focus();
  }

  function readForm() {
    var p = { id: state.editingId, custom: [] };
    FIELD_KEYS.forEach(function (k) { p[k] = fieldInput(k).value; });
    Array.prototype.forEach.call($('customList').children, function (r) {
      p.custom.push({
        key: r.querySelector('.c-key').value,
        value: r.querySelector('.c-value').value,
        match: r.querySelector('.c-match').value
      });
    });
    var existing = state.profiles.filter(function (x) { return x.id === state.editingId; })[0];
    if (existing) { p.createdAt = existing.createdAt; }
    return p;
  }

  function showErrors(errors) {
    clearErrors();
    var first = null;
    Object.keys(errors).forEach(function (k) {
      var target = $('err_' + k);
      if (!target) return;
      target.textContent = errors[k];
      var input = fieldInput(k) || target.parentNode.querySelector('.c-key');
      if (input) { input.setAttribute('aria-invalid', 'true'); if (!first) first = input; }
    });
    var count = Object.keys(errors).length;
    var box = $('formError');
    box.textContent = 'Could not save: ' + count + (count === 1 ? ' field needs' : ' fields need') + ' attention.';
    box.hidden = false;
    if (first) first.focus();
  }

  async function onSubmit(e) {
    e.preventDefault();
    var data = DTP.clean(readForm());
    var errors = DTP.validate(data, state.profiles);
    if (Object.keys(errors).length) return showErrors(errors);
    $('saveBtn').disabled = true;
    try {
      var saved = await DTP.upsertProfile(data);
      $('profileDlg').close();
      await load();
      toast((state.editingId ? 'Saved changes to "' : 'Saved "') + saved.profileName + '".');
    } catch (err) {
      if (err.validation) showErrors(err.validation);
      else toast(err.message || 'Could not save the profile.', 'error');
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  function bind() {
    $('addBtn').addEventListener('click', function () { openForm(null); });
    $('emptyAddBtn').addEventListener('click', function () { openForm(null); });
    $('searchInput').addEventListener('input', function (e) { state.query = e.target.value; render(); });
    $('profileForm').addEventListener('submit', onSubmit);
    $('cancelBtn').addEventListener('click', function () { $('profileDlg').close(); });
    $('closeBtn').addEventListener('click', function () { $('profileDlg').close(); });
    $('clearBtn').addEventListener('click', function () {
      clearErrors();
      resetPasswordToggles();
      fillForm(DTP.blankProfile());
      fieldInput('profileName').focus();
    });
    $('addCustomBtn').addEventListener('click', function () {
      var list = $('customList');
      var r = customRow(null, list.children.length);
      list.appendChild(r);
      renumberCustom();
      r.querySelector('.c-key').focus();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.toggle'), function (b) {
      b.addEventListener('click', function () {
        var input = $(b.dataset.target);
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.textContent = show ? 'Hide' : 'Show';
        b.setAttribute('aria-pressed', String(show));
      });
    });
    window.addEventListener('hashchange', checkHash);
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && (changes[DTP.KEYS.profiles] || changes[DTP.KEYS.selected])) load();
      });
    }
  }

  function checkHash() {
    if (location.hash === '#new') {
      history.replaceState(null, '', location.pathname);
      openForm(null);
    }
  }

  async function init() {
    bind();
    try {
      var settings = await DTP.getSettings();
      DTP.applyTheme(settings.theme);
      $('f_dob').max = new Date().toISOString().slice(0, 10);
      await load();
    } catch (e) {
      toast('Could not load saved profiles.', 'error');
    }
    checkHash();
  }

  init();
})();
