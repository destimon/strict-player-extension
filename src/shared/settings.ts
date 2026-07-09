export type SiteId = "youtube" | "twitch" | "other";
export type FeatureId = "playPause" | "volume" | "fullscreen";

export interface Settings {
  enabled: boolean;
  features: Record<FeatureId, boolean>;
  sites: Record<SiteId, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  features: {
    playPause: true,
    volume: true,
    fullscreen: true,
  },
  sites: {
    youtube: true,
    twitch: true,
    other: true,
  },
};

export const FEATURE_LABELS: Record<FeatureId, { keys: string; action: string }> = {
  playPause: { keys: "Space", action: "Play / Pause" },
  volume: { keys: "↑ / ↓", action: "Volume" },
  fullscreen: { keys: "F", action: "Fullscreen" },
};

export const SITE_LABELS: Record<SiteId, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  other: "Other sites",
};

const STORAGE_KEY = "strictPlayerSettings";

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  return mergeWithDefaults(raw);
}

function mergeWithDefaults(raw: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    features: { ...DEFAULT_SETTINGS.features, ...raw?.features },
    sites: { ...DEFAULT_SETTINGS.sites, ...raw?.sites },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[STORAGE_KEY]) return;
    const raw = changes[STORAGE_KEY].newValue as Partial<Settings> | undefined;
    callback(mergeWithDefaults(raw));
  });
}
