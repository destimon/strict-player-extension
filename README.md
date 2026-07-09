# StrictPlayer

A Chrome extension that makes player hotkeys **always** do what they should — no matter where the site has moved focus (volume slider, fullscreen button, etc.).

- **Space** → play / pause
- **↑ / ↓** → volume up / down

Supported sites: **YouTube**, **Twitch**, plus a generic mode for **any other site** with a video player (toggleable as "Other sites").

## Why

On YouTube and Twitch, Space is supposed to toggle playback — but once focus lands on a control (volume slider, fullscreen button), Space starts clicking that control or scrolling the page instead. Same story with the arrow keys. StrictPlayer pins these keys to the player, always.

## How it works

The content script intercepts `keydown`/`keyup`/`keypress` in the **capture phase on `window`** — before any of the site's own handlers. The event is swallowed (`preventDefault` + `stopImmediatePropagation`), so focused sliders and buttons never see it, and the extension performs the action itself.

**Play/pause**: clicks the player's play/pause button, falling back to `video.play()/pause()`.

**Other sites**: there are no site-specific selectors, so the extension picks the "main" video — the largest visible `<video>` on the page (small decorative/preview videos are ignored) — and controls it directly. If no significant video exists on the page, keys are not intercepted at all.

**Volume** is changed through the site itself so its UI never goes out of sync, trying in order:

1. **YouTube player API** — a MAIN-world script calls `movie_player.setVolume()`; the slider and player state update on their own.
2. **Generic slider** — finds an `input[type="range"]` inside the player container (walking up the DOM from the `<video>`, no site-specific selectors) and moves it via the native value setter + an `input` event; React-based players (Twitch) sync their state and UI from it.
3. **Fallback** — direct `video.volume` if nothing above was found.

A small on-screen overlay shows the resulting volume percentage.

Keys are **not** intercepted when:
- focus is in a text field (search, Twitch chat, comments) — typing works as usual;
- Ctrl/Alt/Meta is held;
- there is no player on the page (e.g. YouTube home) — Space scrolls as normal;
- arrows are pressed inside a player menu (e.g. YouTube quality menu) — they keep navigating items;
- the extension or the current site is toggled off in the popup.

## Build

```bash
npm install
npm run build
```

The built extension ends up in `dist/`.

## Install in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

## Controls

Click the extension icon to open the popup:
- **Enabled** — global on/off;
- per-key toggles (Space → play/pause, ↑/↓ → volume);
- per-site toggles for YouTube, Twitch and Other sites.

Settings are stored in `chrome.storage.sync` and apply instantly, no page reload needed.

## Project structure

```
public/manifest.json        — Manifest V3
src/content/content.ts      — key interception + player control
src/page/page.ts            — MAIN-world bridge to the YouTube player API
src/popup/                  — React popup (toggles)
src/shared/settings.ts      — settings types + chrome.storage helpers
src/shared/bridge.ts        — events between content and page scripts
vite.config.ts              — popup build
vite.content.config.ts      — content script build (IIFE)
vite.page.config.ts         — page script build (IIFE)
```

## Adding first-class support for a site

Unknown sites are already covered by the generic "Other sites" mode. To give a site its own adapter and toggle (better play/pause via its real button):

1. Extend `SiteId`, `DEFAULT_SETTINGS.sites` and `SITE_LABELS` in `src/shared/settings.ts`.
2. Add an adapter to `ADAPTERS` in `src/content/content.ts` (play/pause button and `<video>` selectors) and a branch in `currentSite()`.
