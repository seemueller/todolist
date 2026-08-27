import { useEffect, useState } from "react";

function AppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="28" height="28" rx="5" fill="#ffd43b" stroke="#14100c" strokeWidth="3" />
      <path d="M10 16.8l4 4 9-9" stroke="#14100c" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function UnmaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <rect x="3" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 9L9 2H5L2 5V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ((window as any).__TAURI_INTERNALS__ !== undefined ||
      (window as any).__TAURI__ !== undefined)
  );
}

async function loadTauriWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function CustomTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTauriEnv, setIsTauriEnv] = useState(false);

  useEffect(() => {
    const tauri = isTauri();
    setIsTauriEnv(tauri);
    if (tauri) {
      loadTauriWindow().then((win) => {
        win.isMaximized().then(setIsMaximized);

        const unlistenPayload = win.listen("tauri://resize", () => {
          win.isMaximized().then(setIsMaximized).catch(() => {});
        });

        const unlistenClose = win.listen("tauri://close-requested", () => {
          // no-op, just subscribed to keep the listener alive
        });

        return () => {
          unlistenPayload.then((fn) => fn());
          unlistenClose.then((fn) => fn());
        };
      }).catch(() => {});
    }
  }, []);

  if (!isTauriEnv) {
    return (
      <div className="titlebar">
        <div className="titlebar-left">
          <AppIcon />
          <span className="titlebar-title">TodoList</span>
        </div>
      </div>
    );
  }

  async function handleMinimize() {
    const win = await loadTauriWindow();
    await win.minimize();
  }

  async function handleMaximize() {
    const win = await loadTauriWindow();
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
    setIsMaximized(!maximized);
  }

  async function handleClose() {
    const win = await loadTauriWindow();
    await win.close();
  }

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left">
        <AppIcon />
        <span className="titlebar-title">TodoList</span>
      </div>
      <div className="titlebar-controls" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button className="titlebar-btn minimize" onClick={handleMinimize} aria-label="Minimieren">
          <MinimizeIcon />
        </button>
        <button className="titlebar-btn maximize" onClick={handleMaximize} aria-label="Maximieren">
          {isMaximized ? <UnmaximizeIcon /> : <MaximizeIcon />}
        </button>
        <button className="titlebar-btn close" onClick={handleClose} aria-label="Schließen">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
