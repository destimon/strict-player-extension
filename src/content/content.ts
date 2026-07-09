import {
  SEEK_REQUEST_EVENT,
  SEEK_RESPONSE_EVENT,
  VOLUME_REQUEST_EVENT,
  VOLUME_RESPONSE_EVENT,
} from "../shared/bridge";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  type Settings,
  type SiteId,
} from "../shared/settings";

/** Volume step as a fraction of the full range (5%). */
const VOLUME_STEP = 0.05;
/** Seek step in seconds. */
const SEEK_STEP = 5;

let settings: Settings = DEFAULT_SETTINGS;

loadSettings().then((s) => {
  settings = s;
});
onSettingsChanged((s) => {
  settings = s;
});

function currentSite(): SiteId {
  const host = location.hostname;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) return "twitch";
  return "other";
}

// Input types where the key types/edits text. Notably NOT "range": volume
// sliders are <input type="range"> and must not steal keys from the player.
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "password",
  "url",
  "tel",
  "number",
]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type);
  }
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  // Twitch chat uses a Slate editor exposed as role="textbox"
  if (target.closest('[contenteditable="true"], [role="textbox"]')) return true;
  return false;
}

// Arrow keys must keep working inside dropdowns and menus (e.g. YouTube's
// quality menu), where they navigate between items.
function isMenuTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      '[role="menu"], [role="menuitem"], [role="menuitemradio"], ' +
        '[role="listbox"], [role="option"], [role="combobox"]'
    ) !== null
  );
}

interface SiteAdapter {
  /** Returns the play/pause button to click, or null. */
  findPlayPauseButton(): HTMLElement | null;
  /** Returns the fullscreen button to click, or null. */
  findFullscreenButton(): HTMLElement | null;
  /** Returns the player's <video> element, or null. */
  findVideo(): HTMLVideoElement | null;
}

const ADAPTERS: Record<SiteId, SiteAdapter> = {
  youtube: {
    findPlayPauseButton() {
      return document.querySelector<HTMLElement>(
        "#movie_player .ytp-play-button"
      );
    },
    findFullscreenButton() {
      return document.querySelector<HTMLElement>(
        "#movie_player .ytp-fullscreen-button"
      );
    },
    findVideo() {
      return document.querySelector<HTMLVideoElement>(
        "#movie_player video, video.html5-main-video"
      );
    },
  },
  twitch: {
    findPlayPauseButton() {
      return document.querySelector<HTMLElement>(
        '[data-a-target="player-play-pause-button"]'
      );
    },
    findFullscreenButton() {
      return document.querySelector<HTMLElement>(
        '[data-a-target="player-fullscreen-button"]'
      );
    },
    findVideo() {
      return document.querySelector<HTMLVideoElement>(
        ".video-player video, video"
      );
    },
  },
  // Any other site: there is no reliable generic play/pause button, so the
  // video element is controlled directly.
  other: {
    findPlayPauseButton() {
      return null;
    },
    findFullscreenButton() {
      return null;
    },
    findVideo() {
      return findMainVideo();
    },
  },
};

// Minimum rendered size for a video to count as "the player". Filters out
// decorative background loops, thumbnails and preview videos.
const MIN_VIDEO_WIDTH = 200;
const MIN_VIDEO_HEIGHT = 112;

/** Picks the largest visible <video> on the page, if any. */
function findMainVideo(): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const video of document.querySelectorAll("video")) {
    const rect = video.getBoundingClientRect();
    if (rect.width < MIN_VIDEO_WIDTH || rect.height < MIN_VIDEO_HEIGHT) continue;
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = video;
      bestArea = area;
    }
  }
  return best;
}

function toggleFullscreen(site: SiteId): void {
  const button = ADAPTERS[site].findFullscreenButton();
  if (button) {
    button.click();
    return;
  }
  // Generic path: the Fullscreen API. Allowed here because this runs inside
  // a real (trusted) keydown — it counts as a user gesture.
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  const video = ADAPTERS[site].findVideo();
  if (video) {
    video.requestFullscreen().catch(() => {
      // e.g. an iframe without allowfullscreen — nothing we can do
    });
  }
}

function togglePlayback(site: SiteId): void {
  const adapter = ADAPTERS[site];
  const button = adapter.findPlayPauseButton();
  if (button) {
    button.click();
    return;
  }
  const video = adapter.findVideo();
  if (video) {
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }
}

function changeVolume(site: SiteId, direction: 1 | -1): void {
  // Order matters: the page-API and slider paths update the site's own state,
  // so its UI stays in sync. Touching video.volume directly is a last resort.
  if (changeVolumeViaPageApi(direction)) return;
  if (changeVolumeViaSlider(site, direction)) return;
  changeVolumeDirectly(site, direction);
}

/**
 * Asks our MAIN-world script (YouTube) to act through the player's own API.
 * dispatchEvent is synchronous, so the response — if the page script exists
 * and found the player — arrives before this function returns.
 */
function pageApiRequest(
  requestEvent: string,
  responseEvent: string,
  detail: string
): number | null {
  let result: number | null = null;
  const onResponse = (event: Event) => {
    result = Number((event as CustomEvent).detail);
  };
  window.addEventListener(responseEvent, onResponse);
  window.dispatchEvent(new CustomEvent(requestEvent, { detail }));
  window.removeEventListener(responseEvent, onResponse);
  return result !== null && Number.isFinite(result) ? result : null;
}

function changeVolumeViaPageApi(direction: 1 | -1): boolean {
  const volume = pageApiRequest(
    VOLUME_REQUEST_EVENT,
    VOLUME_RESPONSE_EVENT,
    String(direction * VOLUME_STEP * 100)
  );
  if (volume === null) return false;
  showVolumeOverlay(volume);
  return true;
}

/**
 * Finds the site's volume slider as a generic input[type=range] near the
 * <video> (no site-specific selectors) and moves it the way a user would:
 * native value setter + "input" event, which React-based players (Twitch)
 * pick up and sync their state, UI and actual volume from.
 */
function changeVolumeViaSlider(site: SiteId, direction: 1 | -1): boolean {
  const video = ADAPTERS[site].findVideo();
  if (!video) return false;
  const slider = findVolumeSlider(video);
  if (!slider) return false;

  const min = slider.min === "" ? 0 : Number(slider.min);
  const max = slider.max === "" ? 100 : Number(slider.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return false;

  const step = (max - min) * VOLUME_STEP;
  const current = Number(slider.value);
  const next =
    Math.round(Math.min(max, Math.max(min, current + direction * step)) * 1000) /
    1000;

  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  if (!setValue) return false;
  setValue.call(slider, String(next));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));

  showVolumeOverlay(Math.round(((next - min) / (max - min)) * 100));
  return true;
}

/** Walks up from the video element looking for a range input in the player. */
function findVolumeSlider(video: HTMLVideoElement): HTMLInputElement | null {
  let node: Element | null = video;
  while (node && node !== document.body) {
    const slider = node.querySelector<HTMLInputElement>('input[type="range"]');
    if (slider) return slider;
    node = node.parentElement;
  }
  return null;
}

/** Last resort: no site UI found, change the media element itself. */
function changeVolumeDirectly(site: SiteId, direction: 1 | -1): void {
  const video = ADAPTERS[site].findVideo();
  if (!video) return;
  const next = Math.min(1, Math.max(0, video.volume + direction * VOLUME_STEP));
  video.volume = next;
  if (next > 0 && video.muted) video.muted = false;
  showVolumeOverlay(Math.round(next * 100));
}

function seek(site: SiteId, direction: 1 | -1): void {
  const delta = direction * SEEK_STEP;

  // YouTube: through the player API, which handles live streams and ads.
  const position = pageApiRequest(
    SEEK_REQUEST_EVENT,
    SEEK_RESPONSE_EVENT,
    String(delta)
  );
  if (position !== null) {
    showSeekOverlay(direction, position);
    return;
  }

  // Everything else: progress bars track the video's timeupdate, so setting
  // currentTime stays in sync with the site's UI (unlike volume).
  const video = ADAPTERS[site].findVideo();
  if (!video) return;
  let next = Math.max(0, video.currentTime + delta);
  if (Number.isFinite(video.duration)) next = Math.min(next, video.duration);
  if (video.seekable.length > 0) {
    // Live streams: stay inside the seekable window (up to the live edge).
    const start = video.seekable.start(0);
    const end = video.seekable.end(video.seekable.length - 1);
    next = Math.min(Math.max(next, start), end);
  }
  video.currentTime = next;
  showSeekOverlay(direction, next);
}

function showSeekOverlay(direction: 1 | -1, positionSeconds: number): void {
  showOverlay(`${direction > 0 ? "⏩" : "⏪"} ${formatTime(positionSeconds)}`);
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// The sites' own UI may not react when we act on the media element directly,
// so we render our own small feedback indicator.
let overlayEl: HTMLDivElement | null = null;
let overlayTimer: ReturnType<typeof setTimeout> | undefined;

function showVolumeOverlay(percent: number): void {
  showOverlay(`${percent === 0 ? "🔇" : "🔊"} ${percent}%`);
}

function showOverlay(text: string): void {
  if (!overlayEl || !overlayEl.isConnected) {
    overlayEl = document.createElement("div");
    overlayEl.style.cssText = [
      "position: fixed",
      "top: 10%",
      "left: 50%",
      "transform: translateX(-50%)",
      "z-index: 2147483647",
      "background: rgba(0, 0, 0, 0.75)",
      "color: #fff",
      "font: 600 15px/1 'Segoe UI', system-ui, sans-serif",
      "padding: 10px 16px",
      "border-radius: 8px",
      "pointer-events: none",
      "transition: opacity 0.2s ease",
    ].join(";");
    document.documentElement.appendChild(overlayEl);
  }
  overlayEl.textContent = text;
  overlayEl.style.opacity = "1";
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    if (overlayEl) overlayEl.style.opacity = "0";
  }, 900);
}

function hasPlayer(site: SiteId): boolean {
  const adapter = ADAPTERS[site];
  return adapter.findPlayPauseButton() !== null || adapter.findVideo() !== null;
}

type Action =
  | "playPause"
  | "volumeUp"
  | "volumeDown"
  | "seekBack"
  | "seekForward"
  | "fullscreen";

const ARROW_ACTIONS = new Set<Action>([
  "volumeUp",
  "volumeDown",
  "seekBack",
  "seekForward",
]);

/**
 * Maps the event to our action if this key press belongs to us. If it does,
 * the site must not see the event (prevents focused volume sliders /
 * fullscreen buttons from reacting).
 */
function actionFor(event: KeyboardEvent, site: SiteId): Action | null {
  if (!settings.enabled || !settings.sites[site]) return null;
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (isTypingTarget(event.target)) return null;

  let action: Action;
  if (event.code === "Space" && settings.features.playPause) {
    action = "playPause";
  } else if (event.code === "ArrowUp" && settings.features.volume) {
    action = "volumeUp";
  } else if (event.code === "ArrowDown" && settings.features.volume) {
    action = "volumeDown";
  } else if (event.code === "ArrowLeft" && settings.features.seek) {
    action = "seekBack";
  } else if (event.code === "ArrowRight" && settings.features.seek) {
    action = "seekForward";
  } else if (event.code === "KeyF" && settings.features.fullscreen) {
    action = "fullscreen";
  } else {
    return null;
  }

  // Arrows keep navigating inside player menus (e.g. YouTube quality menu).
  if (ARROW_ACTIONS.has(action) && isMenuTarget(event.target)) return null;
  return hasPlayer(site) ? action : null;
}

function swallow(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

const site = currentSite();

// Capture phase on window: runs before any of the site's own handlers.
window.addEventListener(
  "keydown",
  (event) => {
    const action = actionFor(event, site);
    if (!action) return;
    swallow(event);
    switch (action) {
      case "playPause":
        // Holding Space auto-repeats keydown; toggle only on the initial
        // press. Held arrows keep adjusting volume — that one we want.
        if (!event.repeat) togglePlayback(site);
        break;
      case "volumeUp":
        changeVolume(site, 1);
        break;
      case "volumeDown":
        changeVolume(site, -1);
        break;
      case "seekBack":
        seek(site, -1);
        break;
      case "seekForward":
        seek(site, 1);
        break;
      case "fullscreen":
        if (!event.repeat) toggleFullscreen(site);
        break;
    }
  },
  true
);

// Focused <button> elements activate on keyup, and some sites listen to
// keypress/keyup directly — block those too so nothing else reacts.
for (const type of ["keyup", "keypress"] as const) {
  window.addEventListener(
    type,
    (event) => {
      if (actionFor(event, site)) swallow(event);
    },
    true
  );
}
