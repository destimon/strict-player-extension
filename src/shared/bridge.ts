// Events bridging the isolated content script and the MAIN-world page script.
// Details are primitives (strings) — objects don't cross world boundaries.

/** detail: volume delta in percent, e.g. "5" or "-5" */
export const VOLUME_REQUEST_EVENT = "strictplayer-volume-request";
/** detail: resulting volume in percent, e.g. "45" */
export const VOLUME_RESPONSE_EVENT = "strictplayer-volume-response";
