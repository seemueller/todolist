import { useEffect, useState } from "react";
import { debugLogs, clearDebugLogs, DebugLog } from "./debug";

export function DebugLogPanel({ onClose }: { onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<DebugLog[]>([...debugLogs]);

  useEffect(() => {
    setSnapshot([...debugLogs]);
    const id = setInterval(() => setSnapshot([...debugLogs]), 500);
    return () => clearInterval(id);
  }, []);

  const handleCopy = () => {
    const text = snapshot.map((l) => `[${l.time}] [${l.level}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="debug-overlay">
      <div className="debug-panel">
        <div className="debug-header">
          <h2>Debug Logs ({snapshot.length})</h2>
          <div className="debug-actions">
            <button className="debug-action-btn" onClick={handleCopy}>Kopieren</button>
            <button className="debug-action-btn" onClick={clearDebugLogs}>Leeren</button>
            <button className="debug-close-btn" onClick={onClose} aria-label="Schließen">&times;</button>
          </div>
        </div>
        <div className="debug-body">
          {snapshot.length === 0 && <span className="debug-empty">Noch keine Logs.</span>}
          {snapshot.map((log, i) => (
            <div key={i} className={`debug-line debug-${log.level}`}>
              <span className="debug-time">{log.time}</span>
              <span className="debug-level">{log.level}</span>
              <span className="debug-msg">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
