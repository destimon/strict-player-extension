const KEYS = [
  {
    keys: ["Space"],
    action: "Play / Pause",
    detail:
      "Toggles playback. Clicks the player's own button on YouTube and Twitch, so their UI stays perfectly in sync.",
  },
  {
    keys: ["↑", "↓"],
    action: "Volume",
    detail:
      "5% per press, hold to keep adjusting. Goes through the site's own volume control, and a small on-screen badge shows the result.",
  },
  {
    keys: ["←", "→"],
    action: "Seek 5s",
    detail:
      "Jumps back or forward. On live streams it respects the DVR window and the live edge.",
  },
  {
    keys: ["F"],
    action: "Fullscreen",
    detail:
      "Enters or exits fullscreen via the player's button, or the browser Fullscreen API on other sites.",
  },
];

const EXCEPTIONS = [
  {
    icon: "⌨️",
    title: "Typing",
    text: "Focus in a search box, chat or comment field? Keys type text as usual.",
  },
  {
    icon: "📋",
    title: "Player menus",
    text: "Arrows still navigate quality and settings menus inside the player.",
  },
  {
    icon: "🖱️",
    title: "Shortcuts",
    text: "Ctrl / Alt / Cmd combinations are never touched.",
  },
  {
    icon: "📄",
    title: "No player",
    text: "Pages without a real video (like the YouTube home page) behave normally — Space scrolls.",
  },
];

export function Help() {
  const version = chrome.runtime.getManifest().version;

  return (
    <div className="help">
      <header className="hero">
        <img className="hero-logo" src="/icons/icon128.png" alt="" />
        <h1>StrictPlayer</h1>
        <p className="tagline">Player keys always do what they should.</p>
      </header>

      <section className="card">
        <h2>
          <span className="h-icon">🎯</span> Why StrictPlayer
        </h2>
        <p>
          On YouTube, Twitch and most video sites, hotkeys stop working the
          moment focus lands somewhere else. Click the volume slider once — and
          suddenly <kbd>Space</kbd> resizes the volume instead of pausing, or
          just scrolls the page.
        </p>
        <p>
          StrictPlayer pins the essential keys directly to the video player.
          Wherever focus is, whatever the site thinks —{" "}
          <strong>the keys below always control the video</strong>.
        </p>
      </section>

      <section className="card">
        <h2>
          <span className="h-icon">⌨️</span> The keys
        </h2>
        <ul className="keylist">
          {KEYS.map((k) => (
            <li key={k.action}>
              <div className="keylist-head">
                <span className="keycaps">
                  {k.keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </span>
                <span className="keylist-action">{k.action}</span>
              </div>
              <p className="keylist-detail">{k.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>
          <span className="h-icon">🛡️</span> Smart exceptions
        </h2>
        <p className="muted">
          StrictPlayer steps aside whenever grabbing a key would get in your
          way:
        </p>
        <ul className="exceptions">
          {EXCEPTIONS.map((e) => (
            <li key={e.title}>
              <span className="ex-icon">{e.icon}</span>
              <div>
                <strong>{e.title}.</strong> {e.text}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>
          <span className="h-icon">🌐</span> Sites
        </h2>
        <p>
          <strong>YouTube</strong> and <strong>Twitch</strong> get first-class
          support: actions go through each player's own buttons and API, so
          sliders, icons and saved preferences stay in sync.
        </p>
        <p>
          <strong>Other sites</strong> are covered by a generic mode: the
          extension finds the main video on the page (small decorative clips
          are ignored) and controls it directly. If a site misbehaves, just
          switch "Other sites" off in the popup.
        </p>
      </section>

      <section className="card">
        <h2>
          <span className="h-icon">🎛️</span> The popup
        </h2>
        <p>
          Click the toolbar icon to open the control panel. Everything applies
          instantly — no page reload needed:
        </p>
        <ul className="plain">
          <li>
            <strong>Enabled</strong> — master switch for the whole extension.
          </li>
          <li>
            <strong>Keys</strong> — turn each binding on or off individually.
          </li>
          <li>
            <strong>Sites</strong> — enable or disable per site.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>
          <span className="h-icon">⚙️</span> Under the hood
        </h2>
        <p className="muted">
          StrictPlayer listens for keys at the very top of the event chain —
          the capture phase on <code>window</code> — before any of the site's
          own handlers run. A matched key is fully consumed, so a focused
          button or slider never sees it, and the extension performs the action
          itself through the most reliable route the site offers: its player
          API, its real controls, or the video element directly.
        </p>
      </section>

      <footer className="help-footer">
        <span>StrictPlayer v{version}</span>
        <a
          href="https://github.com/destimon/strict-player-extension"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
