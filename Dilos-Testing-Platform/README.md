# Dilo's Testing Platform

A small Chrome extension for software testers. Save many test-user profiles, search for one, and fill the matching login, signup or registration fields on a website you are authorized to test, with one click.

Built with HTML, CSS, JavaScript and Chrome Extension Manifest V3. No build step, no external servers, no libraries.

## Install

1. Keep this folder (`Dilos-Testing-Platform`) somewhere permanent.
2. Open `chrome://extensions/` in Google Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Pin the extension from the puzzle-piece menu so the icon is always visible.

## Use

1. Click the extension icon, then **Manage Accounts** (or **Add New User**).
2. Create several profiles. Only **Profile Name** is required.
3. Open the website you want to test.
4. Click the extension icon. The first time on a site, click **Authorize this site** (or add the domain in Settings).
5. Search for a profile, select it and click **Fill Form**.
6. Review the filled fields and submit the form yourself. Use **Undo** on the page's small notice to restore the old values.

### Suggestions while you type (no need to open the popup)
On an authorized site, click or type in a name, NIC, username, email or phone field. A small list of matching saved profiles appears under the field (name and username only). Click a profile (or press Enter for the highlighted one, arrow keys to change it) and the whole form is filled. Esc closes the list.

- Works only on authorized domains, and only when Autofill and "Suggest profiles while typing" are on in Settings.
- Nothing is filled until you pick a profile. Picking is the explicit action, so the password is filled too.
- Only trusted keystrokes and clicks count. A website's own scripts cannot trigger it.
- The extension now runs a small script on every http(s) page so it can show the list. Chrome will say it can "read and change data on all sites". The script does nothing unless the site is on your authorized list, and it reads nothing from the page. If you prefer, turn suggestions off and use the popup only.

### Search
Type any part of a profile name, full name, username, NIC, email or phone number. Search ignores letter case and matches while you type. `student001` finds a profile whose username is `student001`. Several words must all match.

### How fields are matched
The filler reads each field's `name`, `id`, label, placeholder, `aria-label`, input type and `autocomplete` attribute.

- Username, email, password, confirm password, full / first / last name, NIC, phone, alternative phone, date of birth, address, city, postal code and role are recognised.
- If the profile's Confirm Password is empty, the Password value is reused for confirm fields.
- Custom fields take priority. Give a custom field a name (and optional comma-separated "match words") and it fills any page field whose name, label or placeholder contains those words.
- It fills one form per click: the form you last clicked in, or the form with the most matches. Search boxes, newsletter boxes in other forms and OTP / CAPTCHA fields are left alone.
- Fields that already contain a value are skipped unless you tick **Replace values already on the page**.
- Tick or untick **Fill password fields** before each fill.
- It works with plain HTML forms and common frameworks (React, Vue, Angular) because it sets values the way the browser does and fires `input` and `change` events. Forms inside open shadow DOM are supported. Forms inside iframes are not.

## Safety

- Fills only on domains you authorize (Settings, or **Authorize this site**). `example.com` matches only that host. `*.example.com` also covers its subdomains.
- Never clicks Login, Register, Submit or Save. Never touches OTP, MFA or CAPTCHA fields.
- Never reads or collects values from websites. Never sends anything to any server.
- Passwords are hidden by default in the interface and are never shown in search results, cards or logs.
- Permissions requested: `storage` (save profiles), `activeTab` and `scripting` (the popup's Fill Form), plus a content script on http(s) pages for typing suggestions. It stays idle unless the site is authorized.
- **Chrome local storage is not automatically encrypted.** Anyone with access to your Chrome profile or computer could read it. Store test data only, never real accounts or real passwords.

## Settings
Enable or disable autofill, turn typing suggestions on or off, manage authorized domains, choose the theme (dark by default), clear recent history, and reset preferences (asks first). Resetting preferences does not delete profiles.

## Files

```
Dilos-Testing-Platform/
  manifest.json     extension definition (MV3)
  storage.js        profile, settings and search logic (chrome.storage.local)
  theme.css         shared dark / light theme
  popup.html/.css/.js     toolbar popup
  accounts.html/.css/.js  Manage Test Accounts page
  content.js        field detection and filling
  suggest.js        suggestion list while typing on authorized sites
  icons/            16, 32, 48 and 128 px icons
```

## Testing checklist

- Create, edit, duplicate and delete a profile (deleting asks first).
- Search by name, username, NIC, email and phone, in any letter case.
- Close and reopen Chrome: profiles and settings are still there.
- Authorize a test site, then fill a login form and a registration form.
- Confirm nothing is submitted automatically and Undo restores the old values.

## Notes

- Chrome's storage limit applies (about 10 MB for this kind of storage). If it is full the extension shows an error instead of losing data.
- Validation blocks invalid emails, phone numbers and mismatched confirm passwords. For negative testing, type the bad value directly into the website field.
- Chrome does not allow extensions on pages such as `chrome://` and the Chrome Web Store.
