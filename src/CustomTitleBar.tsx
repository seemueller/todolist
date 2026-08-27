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
  const w = window as any;
  if (typeof w === "undefined") return false;
  if (w.__TAURI_INTERNALS__?.invoke) return true;
  return /Tauri/i.test(navigator.userAgent);
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
    console.log("Titlebar: Tauri detected", tauri);
    if (!tauri) return;

    let cleanup: (() => void) | undefined;

    loadTauriWindow()
      .then((win) => {
        console.log("Titlebar: window acquired");
        return win.isMaximized().then((max) => {
          console.log("Titlebar: isMaximized", max);
          setIsMaximized(max);
          return win.listen("tauri://resize", () => {
            win.isMaximized().then(setIsMaximized).catch(() => {});
          });
        });
      })
      .then((unlisten) => {
        console.log("Titlebar: resize listener attached");
        cleanup = unlisten;
      })
      .catch((e) => {
        console.error("Titlebar: setup failed", e);
      });

    return () => {
      cleanup?.();
    };
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
    try {
      console.log("Titlebar: minimize clicked");
      const win = await loadTauriWindow();
      await win.minimize();
      console.log("Titlebar: minimized");
    } catch (e) {
      console.error("Titlebar: minimize failed", e);
    }
  }

  async function handleMaximize() {
    try {
      console.log("Titlebar: maximize clicked");
      const win = await loadTauriWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
        console.log("Titlebar: unmaximized");
      } else {
        await win.maximize();
        console.log("Titlebar: maximized");
      }
      setIsMaximized((m) => !m);
    } catch (e) {
      console.error("Titlebar: maximize failed", e);
    }
  }

  async function handleClose() {
    try {
      console.log("Titlebar: close clicked");
      const win = await loadTauriWindow();
      await win.close();
    } catch (e) {
      console.error("Titlebar: close failed", e);
    }
  }

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left">
        <AppIcon />
        <span className="titlebar-title">TodoList</span>
      </div>
      <div className="titlebar-controls">
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
