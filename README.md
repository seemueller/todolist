# TodoList

Eine einfache Desktop-TODO-Listen-Anwendung für Windows, macOS und Linux.

## Stack

- [Tauri 2](https://tauri.app/) (Rust-Backend, kleine Binaries)
- React + TypeScript + Vite
- SQLite via `tauri-plugin-sql` für lokale Datenspeicherung

## Funktionen

- Aufgaben anlegen, bearbeiten, abhaken und löschen
- Lokale Speicherung in einer SQLite-Datenbank (keine Anmeldung, kein Server nötig)

## Entwicklung

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```
