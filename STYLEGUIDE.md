# Styleguide — TodoList

Verbindlich für alle, die an dieser App weiterbauen, Mensch wie Agent. Wer hier
etwas ergänzt, hält sich an die Regeln in Abschnitt 3 und den Baustein-Katalog in
Abschnitt 4.

---

## 1. Die Gestaltungssprache

Helles Neo-Pop. Die Fläche ist ein warmer Sandton, die Schrift steht als
tiefschwarze Tinte darauf. Jedes Bedienelement trägt einen harten Rahmen von
2,5 px und wirft einen versetzten, ungeweichzeichneten Schatten in derselben
Tinte — Tiefe entsteht durch Versatz, nie durch Weichzeichnung. Überschriften
setzt **Archivo Black** in Versalien, Fließtext **Archivo**. Farbe kommt als
kräftige, flache Fläche (Orange, Gelb, Blau, Grün), niemals als Verlauf.

---

## 2. Token

Alle Token stehen im `:root`-Block von `src/App.css`. Farben und Maße werden
ausschließlich über diese Variablen angesprochen.

### Flächen

| Token | Wert | Wofür |
|---|---|---|
| `--canvas` | `#fbeed2` | Grundfläche der App, Hintergrund von `body` und Modal-Panels. |
| `--canvas-sunken` | `#f6e8c6` | Eine Stufe tiefer liegende Fläche, z. B. der Korpus einer Kanban-Spalte. |
| `--surface` | `#ffffff` | Erhöhte Elemente, die auf der Fläche liegen: Karten, Zeilen, Eingabefelder. |
| `--surface-muted` | `#f2e6c8` | Erledigte Karten und Zeilen — dieselbe Form, weniger Anspruch. |

### Tinte

| Token | Wert | Wofür |
|---|---|---|
| `--ink` | `#14100c` | Rahmen, Schatten, Text, alles Tragende. Das echte Schwarz der App. |
| `--ink-soft` | `#6b6152` | Sekundärtext und ruhende Icon-Farbe in Aktionsknöpfen. |
| `--ink-faint` | `#8a806f` | Platzhaltertext und durchgestrichene Titel erledigter Aufgaben. |
| `--ink-ghost` | `#a89e8c` | Rahmen erledigter Elemente und Text, der fast verschwindet. |
| `--ink-line` | `#c9bfa8` | Hellste Linie; zugleich die Kantenfarbe niedriger Priorität. |

### Akzente

| Token | Wert | Wofür |
|---|---|---|
| `--accent` | `#e5401a` | Primärakzent: Absende-Knopf, Überfälligkeit, Löschen, Aufzählungspunkte. |
| `--accent-ink` | `#b32e10` | Dunklere Stufe des Akzents, nur für `a:hover`. |
| `--highlight` | `#ffd43b` | Hervorhebung und Hover-Fläche: aktiver Reiter, Fälligkeit heute, aktive Filterleiste. |
| `--info` | `#7cc3f7` | Neutrale Kennzeichnung, z. B. der Kopf der Spalte „Zu tun". |
| `--success` | `#6fcf7f` | Erledigt: Kopf der Spalte „Erledigt" und das Signal beim Abhaken. |

### Prioritäten

| Token | Wert | Wofür |
|---|---|---|
| `--prio-high` | `var(--accent)` | Hohe Priorität — farbige Kante der Zeile bzw. Karte. |
| `--prio-medium` | `var(--highlight)` | Mittlere Priorität. |
| `--prio-low` | `var(--ink-line)` | Niedrige Priorität; bewusst zurückhaltend. |

### Rahmen, Radien, Schatten

| Token | Wert | Wofür |
|---|---|---|
| `--border` | `2.5px solid var(--ink)` | Standardrahmen für alles Bedienbare. |
| `--border-thin` | `2px solid var(--ink)` | Rahmen für kleine Elemente: Badges, 24–30 px große Knöpfe. |
| `--border-muted` | `2.5px solid var(--ink-ghost)` | Rahmen für Leerzustände und Erledigtes. |
| `--edge` | `12px` | Breite der farbigen Prioritätskante an der Listenzeile. |
| `--radius-sm` | `4px` | Badges, kleine Knöpfe, Eingabefelder in Zeilen. |
| `--radius-md` | `6px` | Karten, Zeilen, Formulare, Spalten. |
| `--radius-lg` | `8px` | Modal-Panels. |
| `--radius-pill` | `999px` | Filter-Chips und Segmentleisten. |
| `--shadow-sm` | `3px 3px 0 var(--ink)` | Kanban-Karten, Einträge im Kategorien-Dialog. |
| `--shadow-md` | `4px 4px 0 var(--ink)` | Listenzeilen, Ansicht-Umschalter, Changelog-Einträge. |
| `--shadow-lg` | `5px 5px 0 var(--ink)` | Das Hinzufügen-Formular als wichtigstes Element der Seite. |
| `--shadow-xl` | `8px 8px 0 var(--ink)` | Modal-Panels. |
| `--shadow-focus` | `5px 5px 0 var(--accent)` | Fokus: der Schatten wechselt auf den Akzent, statt einen Ring zu zeichnen. |

### Bewegung

| Token | Wert | Wofür |
|---|---|---|
| `--transition-fast` | `120ms ease` | Hover, aktiv, Farbwechsel. |
| `--transition-normal` | `200ms ease` | Alles, was Größe oder Position ändert. |

---

## 3. Regeln

**Keine Emoji in der Oberfläche.** Symbole sind strichbasiertes Inline-SVG aus
`src/ui/icons.tsx`, färben sich über `currentColor` und tragen `aria-hidden`.
Emoji rendern auf jedem Betriebssystem anders, lassen sich nicht einfärben und
brechen die gezeichnete Bildsprache.

**Keine Verläufe, keine weichen Schatten.** Tiefe entsteht durch Versatz
(`--shadow-*`), nicht durch Unschärfe. Ein `blur` im Schatten oder ein
`linear-gradient` als Fläche gehört nicht in diese App.

**Farben nur als Token.** Kein Hex-Literal im CSS außerhalb des `:root`-Blocks
und keines im TSX. Ausnahme sind Werte aus den Daten, etwa `category_color` —
die kommen als Inline-Style aus der Datenbank. Fehlt eine Farbe, wird ein neues
Token angelegt, statt einen Wert einzustreuen.

**Priorität zeigt die farbige Kante, sonst nichts.** In der Liste die 12 px
breite linke Kante, auf der Kanban-Karte die Kante oben. Kein zusätzlicher Punkt,
kein zweites Abzeichen — doppelte Kodierung derselben Information ist Rauschen.

**Abstände über `flex`/`grid` und `gap`.** Keine Ketten aus `margin` zwischen
Geschwistern und kein Abstand über Leerraum im Quelltext. `gap` überlebt
Umsortieren, Löschen und Umbruch.

**Klickflächen mindestens 30 × 30 px**, in der Kanban-Karte mindestens 24 × 24 px
mit umgebendem Abstand. Kleinere Ziele trifft man mit der Maus nicht zuverlässig.

**Fließtext nie unter 12 px.** Badges und Versalien-Labels dürfen auf 10,5 px
herunter, laufender Text nicht.

**Jedes Bedienelement braucht einen zugänglichen Namen.** Icon-Knöpfe tragen
`aria-label`, das Icon selbst `aria-hidden`. Die Testsuite hängt an genau diesen
Beschriftungen.

---

## 4. Baustein-Katalog

Alle Bausteine liegen unter `src/ui/` und werden über den Sammelexport geladen:

```tsx
import { IconButton, Modal, PencilIcon } from "./ui";
```

Das Styling bleibt in `src/App.css`. Die Bausteine erfinden **keine**
Klassennamen, sie wählen nur zwischen bereits vorhandenen. Jeder Baustein nimmt
`className` zum Erweitern und reicht die übrigen DOM-Props durch, damit
`aria-label`, `title`, `disabled` und Handler weiter funktionieren.

### `IconButton`

Knopf, der im Kern aus einem Icon besteht: bearbeiten, löschen, schließen,
abhaken, Status umschalten.

| Prop | Typ | Bedeutung |
|---|---|---|
| `variant` | `"action" \| "kanban" \| "icon" \| "close" \| "checkbox"` | Wählt die vorhandene CSS-Klasse. |
| `danger` | `boolean` | Hängt `danger` an — roter Ton für zerstörende Aktionen. |
| `children` | `ReactNode` | Icon, optional mit Textlabel daneben. |

```tsx
<IconButton variant="action" danger onClick={() => handleDelete(todo.id)} aria-label="Löschen">
  <TrashIcon />
</IconButton>
```

### `FilterChip`

Filterknopf mit `active`-Zustand. `variant="chip"` ist die freistehende Pille,
`variant="segment"` der Knopf innerhalb der gruppierten Statusleiste.

| Prop | Typ | Bedeutung |
|---|---|---|
| `active` | `boolean` | Hängt `active` an. |
| `variant` | `"chip" \| "segment"` | Freistehend oder in einer Gruppe. |

```tsx
<FilterChip active={dueDateFilter === key} onClick={() => setDueDateFilter(key)}>
  {filterLabels[key]}
</FilterChip>
```

### `CategorySelect`

Auswahlfeld für Kategorien. Kapselt die Optionsliste und die Umrechnung zwischen
leerem Optionswert und `null`.

| Prop | Typ | Bedeutung |
|---|---|---|
| `categories` | `Category[]` | Auswahlliste. |
| `value` | `number \| null` | Gewählte Id. |
| `onValueChange` | `(id: number \| null) => void` | Neue Id oder `null`. |
| `placeholderLabel` | `string` | Erste Option, z. B. `"Keine Kategorie"`. |

### `PrioritySelect`

Auswahlfeld mit den drei festen Optionen Niedrig / Mittel / Hoch.

| Prop | Typ | Bedeutung |
|---|---|---|
| `value` | `Priority` | Gewählte Priorität. |
| `onValueChange` | `(p: Priority) => void` | Neue Priorität. |
| `variant` | `"form" \| "inline"` | Im Hinzufügen-Formular oder in der Todo-Zeile. |

### `DueDateBadge`

Fälligkeits-Abzeichen. Der bereits formatierte Text kommt als `children` herein.

| Prop | Typ | Bedeutung |
|---|---|---|
| `variant` | `"list" \| "kanban"` | Größe je nach Umgebung. |
| `overdue` | `boolean` | Termin verstrichen, Aufgabe offen. |
| `today` | `boolean` | Termin ist heute, Aufgabe offen. |

### `CategoryBadge`

Kategoriename auf eingefärbtem Grund, inklusive Ersatzfarbe.

| Prop | Typ | Bedeutung |
|---|---|---|
| `variant` | `"list" \| "kanban"` | Größe je nach Umgebung. |
| `color` | `string \| null` | Farbe der Kategorie; `null` nutzt `CATEGORY_BADGE_FALLBACK`. |

### `Modal`

Overlay, Panel und Kopfzeile mit Titel und Schließen-Knopf. Bringt
Klick-außerhalb-schließt und den Escape-Listener mit. **Nur mounten, wenn das
Modal offen sein soll** — der Listener hängt an der Lebensdauer der Komponente.
`onClose` mit `useCallback` stabilisieren.

| Prop | Typ | Bedeutung |
|---|---|---|
| `variant` | `"changelog" \| "category"` | Wählt die Panelbreite. |
| `title` | `string` | Text der `<h2>` in der Kopfzeile. |
| `onClose` | `() => void` | Overlay-Klick, Schließen-Knopf, Escape. |
| `closeLabel` | `string` | `aria-label` des Schließen-Knopfs. |

```tsx
{showChangelog && (
  <Modal variant="changelog" title="Changelog" onClose={closeChangelog} closeLabel="Schließen">
    …
  </Modal>
)}
```

### `ColorPicker`

Farbwahl aus einer festen Liste; ohne `colors` sind es die `CATEGORY_COLORS` aus
`src/types.ts`.

| Prop | Typ | Bedeutung |
|---|---|---|
| `value` | `string` | Gewählte Farbe. |
| `onSelect` | `(color: string) => void` | Auswahl. |
| `colors` | `readonly string[]` | Abweichende Liste. |
| `inline` | `boolean` | Kleine 20 px Felder für die Bearbeitungszeile. |
| `swatchLabel` | `(color: string) => string` | Liefert das `aria-label` je Feld — bitte immer setzen. |

### `InlineEditInput`

Textfeld für Umbenennen an Ort und Stelle, mit dem überall gleichen
Tastaturvertrag: Enter und Verlassen übernehmen, Escape bricht ab.

| Prop | Typ | Bedeutung |
|---|---|---|
| `value` | `string` | Aktueller Text. |
| `onValueChange` | `(v: string) => void` | Tippen. |
| `onCommit` | `() => void` | Enter oder Blur. |
| `onCancel` | `() => void` | Escape. |

### `icons.tsx`

`CheckIcon`, `CloseIcon`, `PencilIcon`, `TrashIcon`, `TagIcon`, `PlusIcon`,
`ChevronLeftIcon`, `LaneTodoIcon`, `LaneProgressIcon`, `LaneDoneIcon`,
`ListViewIcon`, `BoardViewIcon`. Alle nehmen `size` und die üblichen SVG-Props.
Ein neues Icon entsteht hier und nirgends sonst: strichbasiert, `currentColor`,
Raster 14/16/18 px, Strichstärke 1,6–2 px.

### Bewusst nicht extrahiert

Todo-Zeile und Kanban-Spalte bleiben in `App.tsx`: sie hätten je einen einzigen
Aufrufort, würden aber Drag-and-drop, Sortierung und Inline-Bearbeitung
mitschleppen. Ebenso `.muted`, `.error`, `.version-badge`, `.kanban-count` und
`.app-subtitle` — optisch ähnlich, semantisch verschiedene Dinge an je einem Ort.
Eine Hülle um ein einzelnes `<span>` gewinnt nichts.

**Neue UI wird zuerst aus diesen Bausteinen gebaut. Ein neuer Baustein entsteht
erst, wenn ein Muster zum zweiten Mal auftaucht.**

---

## 5. Etwas Neues hinzufügen

1. **Token prüfen.** Gibt es die Farbe, den Radius, den Schatten schon? Dann den
   nehmen. Wenn nicht: neues Token in `:root` anlegen, benannt nach seiner Rolle
   (`--surface-muted`), nicht nach seinem Aussehen (`--beige-2`).
2. **Baustein suchen.** Abschnitt 4 durchgehen. Der passende Baustein wird über
   `variant` und `className` angepasst, nicht kopiert.
3. **Erst dann neu bauen.** Neue Klassen kommen nach `src/App.css`, thematisch
   einsortiert, mit Token statt Literalen. Wird ein Muster zum zweiten Mal
   gebraucht, wandert es als Baustein nach `src/ui/` und wird in `src/ui/index.ts`
   exportiert.
4. **Grün bleiben.** Vor jedem Merge nach `main`:

   ```bash
   npm run typecheck && npm test
   npx playwright test
   ```

   Die E2E-Tests selektieren über CSS-Klassen (`.filter-btn`,
   `.priority-select-inline`, `.todo-select`, `.category-item`, `.todo-list li`)
   und über `aria-label`. Wer eine dieser Klassen oder Beschriftungen umbenennt,
   zieht den Test mit.

---

## 6. Was nicht mehr gilt

Das frühere dunkle Thema mit Glassmorphismus, violettem Akzent (`#7f5af0`),
weichen Schatten und `backdrop-filter` ist vollständig ersetzt. **Inter** ist
nicht mehr die Schrift der App. Das Emoji-Konfetti beim Abhaken ist einem
gezeichneten Haken gewichen, und der Prioritätspunkt ist ersatzlos entfallen.

Wer einen alten Stand braucht, findet ihn in der git history — im Arbeitsbaum
wird nichts davon aufbewahrt.
