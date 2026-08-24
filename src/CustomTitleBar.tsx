import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

function AppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="icon-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#icon-bg)" />
      <path d="M9 16.5l4 4 10-10" stroke="#e0e7ff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
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

export function CustomTitleBar() {
  const win = getCurrentWindow();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    win.isMaximized().then(setIsMaximized);
  }, [win]);

  async function handleMinimize() {
    await win.minimize();
  }

  async function handleMaximize() {
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
    setIsMaximized(!maximized);
  }

  async function handleClose() {
    await win.close();
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
        <button className="titlebar-btn close" onClick={handleClose} aria-label="Schlie&szlig;en">
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
