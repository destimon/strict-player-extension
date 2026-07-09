import { useEffect, useState } from "react";
import {
  FEATURE_LABELS,
  loadSettings,
  saveSettings,
  SITE_LABELS,
  type FeatureId,
  type Settings,
  type SiteId,
} from "../shared/settings";
import { Toggle } from "./Toggle";

const SITE_IDS = Object.keys(SITE_LABELS) as SiteId[];
const FEATURE_IDS = Object.keys(FEATURE_LABELS) as FeatureId[];

async function openGuide() {
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id! });
    window.close();
  } catch {
    // Side panel unavailable (old Chrome) — open the guide as a tab instead.
    void chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  const update = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  };

  return (
    <div className="popup">
      <header className="header">
        <img className="logo" src="/icons/icon48.png" alt="" />
        <div className="header-text">
          <h1 className="title">StrictPlayer</h1>
          <p className="subtitle">Player keys always do what they should</p>
        </div>
        <button
          className="guide-btn"
          title="Open guide"
          aria-label="Open guide"
          onClick={openGuide}
        >
          ?
        </button>
      </header>

      <div className="master-row">
        <span className="master-label">Enabled</span>
        <Toggle
          checked={settings.enabled}
          onChange={(enabled) => update({ ...settings, enabled })}
        />
      </div>

      <div className={`sites ${settings.enabled ? "" : "sites--disabled"}`}>
        <p className="sites-caption">Keys</p>
        {FEATURE_IDS.map((id) => (
          <div className="site-row" key={id}>
            <span className="site-name">
              <kbd>{FEATURE_LABELS[id].keys}</kbd>
              <span className="feature-action">{FEATURE_LABELS[id].action}</span>
            </span>
            <Toggle
              checked={settings.features[id]}
              disabled={!settings.enabled}
              onChange={(value) =>
                update({
                  ...settings,
                  features: { ...settings.features, [id]: value },
                })
              }
            />
          </div>
        ))}
      </div>

      <div className={`sites ${settings.enabled ? "" : "sites--disabled"}`}>
        <p className="sites-caption">Sites</p>
        {SITE_IDS.map((id) => (
          <div className="site-row" key={id}>
            <span className="site-name">{SITE_LABELS[id]}</span>
            <Toggle
              checked={settings.sites[id]}
              disabled={!settings.enabled}
              onChange={(value) =>
                update({
                  ...settings,
                  sites: { ...settings.sites, [id]: value },
                })
              }
            />
          </div>
        ))}
      </div>

      <footer className="footer">
        On supported sites these keys always control the player — nothing else
        reacts to them.
      </footer>
    </div>
  );
}
