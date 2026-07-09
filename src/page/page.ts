import {
  SEEK_REQUEST_EVENT,
  SEEK_RESPONSE_EVENT,
  VOLUME_REQUEST_EVENT,
  VOLUME_RESPONSE_EVENT,
} from "../shared/bridge";

// Runs in the page's MAIN world (YouTube only). The isolated content script
// can't reach YouTube's player API, so it asks us via events. Going through
// the official API keeps the player's UI and internal state in sync.

interface YtPlayerApi {
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}

function findPlayerApi(): YtPlayerApi | null {
  const player = document.getElementById("movie_player") as unknown;
  if (
    player &&
    typeof (player as YtPlayerApi).getVolume === "function" &&
    typeof (player as YtPlayerApi).setVolume === "function" &&
    typeof (player as YtPlayerApi).seekTo === "function"
  ) {
    return player as YtPlayerApi;
  }
  return null;
}

function parseDelta(event: Event): number | null {
  const delta = Number((event as CustomEvent).detail);
  return Number.isFinite(delta) ? delta : null;
}

function respond(eventName: string, value: number): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail: String(value) }));
}

window.addEventListener(VOLUME_REQUEST_EVENT, (event) => {
  const player = findPlayerApi();
  const delta = parseDelta(event);
  if (!player || delta === null) return;

  const next = Math.max(0, Math.min(100, Math.round(player.getVolume()) + delta));
  if (next > 0 && player.isMuted()) player.unMute();
  player.setVolume(next);
  respond(VOLUME_RESPONSE_EVENT, next);
});

window.addEventListener(SEEK_REQUEST_EVENT, (event) => {
  const player = findPlayerApi();
  const delta = parseDelta(event);
  if (!player || delta === null) return;

  let next = Math.max(0, player.getCurrentTime() + delta);
  const duration = player.getDuration();
  if (Number.isFinite(duration) && duration > 0) {
    next = Math.min(next, duration);
  }
  player.seekTo(next, true);
  respond(SEEK_RESPONSE_EVENT, next);
});
