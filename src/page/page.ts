import {
  VOLUME_REQUEST_EVENT,
  VOLUME_RESPONSE_EVENT,
} from "../shared/bridge";

// Runs in the page's MAIN world (YouTube only). The isolated content script
// can't reach YouTube's player API, so it asks us via events. Going through
// the official API keeps the volume slider and player state in sync.

interface YtPlayerApi {
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  unMute(): void;
}

function findPlayerApi(): YtPlayerApi | null {
  const player = document.getElementById("movie_player") as unknown;
  if (
    player &&
    typeof (player as YtPlayerApi).getVolume === "function" &&
    typeof (player as YtPlayerApi).setVolume === "function"
  ) {
    return player as YtPlayerApi;
  }
  return null;
}

window.addEventListener(VOLUME_REQUEST_EVENT, (event) => {
  const player = findPlayerApi();
  if (!player) return;

  const delta = Number((event as CustomEvent).detail);
  if (!Number.isFinite(delta)) return;

  const next = Math.max(0, Math.min(100, Math.round(player.getVolume()) + delta));
  if (next > 0 && player.isMuted()) player.unMute();
  player.setVolume(next);

  window.dispatchEvent(
    new CustomEvent(VOLUME_RESPONSE_EVENT, { detail: String(next) })
  );
});
