/* Dilo's Testing Platform - shared storage helpers.
 * All data stays in chrome.storage.local on this computer. Chrome does not
 * encrypt it automatically, so only store test data. Nothing here logs
 * profile contents. */
(function (global) {
  'use strict';

  var KEYS = {
    profiles: 'dtp_profiles',
    settings: 'dtp_settings',
    recent: 'dtp_recent',
    selected: 'dtp_selected'
  };
  var DEFAULT_SETTINGS = { autofill: true, suggest: true, domains: [], theme: 'dark' };
  var MAX_RECENT = 10;
  var SEARCH_FIELDS = ['profileName', 'fullName', 'username', 'nic', 'email', 'phone'];
  var TEXT_FIELDS = ['profileName', 'fullName', 'firstName', 'lastName', 'username', 'nic', 'email',
    'phone', 'altPhone', 'dob', 'address', 'city', 'postalCode', 'role'];
  var PASSWORD_FIELDS = ['password', 'confirmPassword'];
  var PHONE_RE = /^[+\d][\d\s\-().]{3,19}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Writes run one after another so saving never drops another profile.
  var chain = Promise.resolve();
  function serialize(task) {
    var run = chain.then(task);
    chain = run.catch(function () {});
    return run;
  }

  async function read(key, fallback) {
    var result = await chrome.storage.local.get(key);
    return result[key] === undefined ? fallback : result[key];
  }

  async function write(key, value) {
    try {
      var item = {};
      item[key] = value;
      await chrome.storage.local.set(item);
    } catch (e) {
      var quota = /quota/i.test((e && e.message) || '');
      throw new Error(quota
        ? 'Browser storage is full. Delete some profiles and try again.'
        : 'Could not save to browser storage.');
    }
  }

  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function blankProfile() {
    var p = { id: '', createdAt: 0, updatedAt: 0, custom: [] };
    TEXT_FIELDS.concat(PASSWORD_FIELDS).forEach(function (k) { p[k] = ''; });
    return p;
  }

  function clean(input) {
    var src = input || {};
    var out = blankProfile();
    TEXT_FIELDS.forEach(function (k) { out[k] = String(src[k] == null ? '' : src[k]).trim(); });
    PASSWORD_FIELDS.forEach(function (k) { out[k] = String(src[k] == null ? '' : src[k]); });
    out.custom = (Array.isArray(src.custom) ? src.custom : []).map(function (c) {
      c = c || {};
      return {
        key: String(c.key == null ? '' : c.key).trim(),
        value: String(c.value == null ? '' : c.value),
        match: String(c.match == null ? '' : c.match).trim()
      };
    }).filter(function (c) { return c.key || c.value || c.match; });
    out.id = String(src.id || '');
    out.createdAt = Number(src.createdAt) || 0;
    out.updatedAt = Number(src.updatedAt) || 0;
    return out;
  }

  function validate(p, all) {
    var e = {};
    var others = (all || []).filter(function (x) { return x.id !== p.id; });
    if (!p.profileName) {
      e.profileName = 'Profile name is required.';
    } else if (p.profileName.length > 80) {
      e.profileName = 'Use 80 characters or fewer.';
    } else if (others.some(function (x) { return x.profileName.toLowerCase() === p.profileName.toLowerCase(); })) {
      e.profileName = 'A profile with this name already exists.';
    }
    if (p.email && !EMAIL_RE.test(p.email)) e.email = 'Enter a valid email, like name@example.com.';
    if (p.phone && !PHONE_RE.test(p.phone)) e.phone = 'Use digits, spaces, + - ( ) only.';
    if (p.altPhone && !PHONE_RE.test(p.altPhone)) e.altPhone = 'Use digits, spaces, + - ( ) only.';
    if (p.nic && !/^[A-Za-z0-9-]{5,20}$/.test(p.nic)) e.nic = 'Use 5 to 20 letters, numbers or hyphens.';
    if (p.postalCode && p.postalCode.length > 12) e.postalCode = 'Use 12 characters or fewer.';
    if (p.dob) {
      var d = new Date(p.dob + 'T00:00:00');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dob) || isNaN(d.getTime())) e.dob = 'Enter a valid date.';
      else if (d.getTime() > Date.now()) e.dob = 'Date of birth cannot be in the future.';
    }
    if (p.confirmPassword && p.password !== p.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    p.custom.forEach(function (c, i) {
      if (!c.key) e['custom_' + i] = 'Give this custom field a name.';
    });
    return e;
  }

  async function getProfiles() {
    var list = await read(KEYS.profiles, []);
    return Array.isArray(list) ? list.map(clean) : [];
  }

  function upsertProfile(input) {
    return serialize(async function () {
      var list = await getProfiles();
      var p = clean(input);
      var errors = validate(p, list);
      if (Object.keys(errors).length) {
        var err = new Error('Please fix the highlighted fields.');
        err.validation = errors;
        throw err;
      }
      var now = Date.now();
      var idx = p.id ? list.findIndex(function (x) { return x.id === p.id; }) : -1;
      if (idx >= 0) {
        p.createdAt = list[idx].createdAt || now;
        p.updatedAt = now;
        list[idx] = p;
      } else {
        p.id = uid();
        p.createdAt = now;
        p.updatedAt = now;
        list.push(p);
      }
      await write(KEYS.profiles, list);
      return p;
    });
  }

  function deleteProfile(id) {
    return serialize(async function () {
      var list = await getProfiles();
      await write(KEYS.profiles, list.filter(function (x) { return x.id !== id; }));
      var recent = await read(KEYS.recent, []);
      await write(KEYS.recent, recent.filter(function (x) { return x !== id; }));
      if ((await read(KEYS.selected, null)) === id) await chrome.storage.local.remove(KEYS.selected);
    });
  }

  function duplicateProfile(id) {
    return serialize(async function () {
      var list = await getProfiles();
      var src = list.find(function (x) { return x.id === id; });
      if (!src) throw new Error('That profile no longer exists.');
      var names = list.map(function (x) { return x.profileName.toLowerCase(); });
      var base = src.profileName + ' (copy)';
      var name = base;
      var n = 2;
      while (names.indexOf(name.toLowerCase()) >= 0) { name = base.replace(/\)$/, ' ' + n + ')'); n++; }
      var now = Date.now();
      var copy = clean(src);
      copy.id = uid();
      copy.profileName = name;
      copy.createdAt = now;
      copy.updatedAt = now;
      list.push(copy);
      await write(KEYS.profiles, list);
      return copy;
    });
  }

  function searchProfiles(list, query) {
    var tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return list.slice();
    return list.filter(function (p) {
      var hay = SEARCH_FIELDS.map(function (k) { return String(p[k] || '').toLowerCase(); }).join('\n');
      return tokens.every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  async function getRecentIds() { return read(KEYS.recent, []); }
  function addRecent(id) {
    return serialize(async function () {
      var recent = (await read(KEYS.recent, [])).filter(function (x) { return x !== id; });
      recent.unshift(id);
      await write(KEYS.recent, recent.slice(0, MAX_RECENT));
    });
  }
  function clearRecent() { return serialize(function () { return write(KEYS.recent, []); }); }
  async function getSelected() { return read(KEYS.selected, null); }
  function setSelected(id) { return serialize(function () { return write(KEYS.selected, id); }); }

  async function getSettings() {
    var s = await read(KEYS.settings, {});
    return {
      autofill: s.autofill !== false,
      suggest: s.suggest !== false,
      domains: Array.isArray(s.domains) ? s.domains.filter(function (d) { return typeof d === 'string'; }) : [],
      theme: s.theme === 'light' ? 'light' : 'dark'
    };
  }
  function saveSettings(patch) {
    return serialize(async function () {
      var next = Object.assign(await getSettings(), patch);
      await write(KEYS.settings, next);
      return next;
    });
  }
  function resetSettings() {
    return serialize(async function () {
      await chrome.storage.local.remove(KEYS.settings);
      return Object.assign({}, DEFAULT_SETTINGS, { domains: [] });
    });
  }

  // "https://Test.Example.com:8080/login" -> "test.example.com". "*.example.com" keeps its wildcard.
  function normalizeDomain(input) {
    var d = String(input || '').trim().toLowerCase();
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/^.*@/, '').replace(/:\d+$/, '');
    if (!/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(d)) return null;
    return d;
  }

  function isHostAuthorized(host, domains) {
    var h = String(host || '').toLowerCase();
    if (!h) return false;
    return (domains || []).some(function (d) {
      if (d.indexOf('*.') === 0) {
        var base = d.slice(2);
        return h === base || h.slice(-(base.length + 1)) === '.' + base;
      }
      return h === d;
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  global.DTP = {
    KEYS: KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    blankProfile: blankProfile,
    clean: clean,
    validate: validate,
    getProfiles: getProfiles,
    upsertProfile: upsertProfile,
    deleteProfile: deleteProfile,
    duplicateProfile: duplicateProfile,
    searchProfiles: searchProfiles,
    getRecentIds: getRecentIds,
    addRecent: addRecent,
    clearRecent: clearRecent,
    getSelected: getSelected,
    setSelected: setSelected,
    getSettings: getSettings,
    saveSettings: saveSettings,
    resetSettings: resetSettings,
    normalizeDomain: normalizeDomain,
    isHostAuthorized: isHostAuthorized,
    applyTheme: applyTheme
  };
})(typeof self !== 'undefined' ? self : this);
