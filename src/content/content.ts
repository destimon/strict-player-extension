import {
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
 * Asks our MAIN-world script (YouTube) to change volume through the player's
 * own API. dispatchEvent is synchronous, so the response — if the page script
 * exists and found the player — arrives before this function returns.
 */
function changeVolumeViaPageApi(direction: 1 | -1): boolean {
  let result: number | null = null;
  const onResponse = (event: Event) => {
    result = Number((event as CustomEvent).detail);
  };
  window.addEventListener(VOLUME_RESPONSE_EVENT, onResponse);
  window.dispatchEvent(
    new CustomEvent(VOLUME_REQUEST_EVENT, {
      detail: String(direction * VOLUME_STEP * 100),
    })
  );
  window.removeEventListener(VOLUME_RESPONSE_EVENT, onResponse);
  if (result === null || !Number.isFinite(result)) return false;
  showVolumeOverlay(result);
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

// The sites' own volume UI may not react when we set video.volume directly,
// so we render our own small indicator.
let overlayEl: HTMLDivElement | null = null;
let overlayTimer: ReturnType<typeof setTimeout> | undefined;

function showVolumeOverlay(percent: number): void {
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
  overlayEl.textContent = `${percent === 0 ? "🔇" : "🔊"} ${percent}%`;
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

type Action = "playPause" | "volumeUp" | "volumeDown";

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
  } else {
    return null;
  }

  if (action !== "playPause" && isMenuTarget(event.target)) return null;
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
