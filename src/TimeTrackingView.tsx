// Zeiterfassung als Viertelstunden-Matrix einer Arbeitswoche.
//
// Zeilen sind Stunden (6-22), Spalten sind die fuenf Arbeitstage mit je vier
// Viertelstunden. Oben stehen die Kategorien als Pinsel; eine Zelle wird
// angeklickt oder ueberstrichen.
//
// Ein Zug bucht einen Bereich, nicht die einzeln beruehrten Zellen: pointerdown
// setzt den Anker und legt die Aktion fest (fuellen oder leeren), pointerenter
// rechnet den Bereich Anker-aktuell immer neu gegen den Stand bei Zugbeginn. Darum
// ueberspringt eine schnelle Mausbewegung keine Viertelstunde und Zurueckziehen
// nimmt die Buchung wieder weg. Ein Zug bleibt in der Spalte, in der er begann;
// ueber Tagesgrenzen wird nicht gemalt. Gespeichert wird einmal beim Loslassen.
//
// Notizen werden ausschliesslich in der Blockliste unter dem Raster bearbeitet.
// Fachlogik liegt in timeSlots.ts, CSV in timeCsv.ts, Persistenz in timeDb.ts.
//
// Sollzeit und Wochenend-Schalter liegen als Einstellungen im Speicher. Das Soll
// gilt je regulaerem Arbeitstag; Samstag und Sonntag zaehlen nie mit, auch wenn sie
// angezeigt werden.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Category } from "./types";
import {
  DaySlot,
  SLOTS_PER_HOUR,
  addDays,
  applyPaint,
  buildBlocks,
  dayHours,
  WORKDAYS_PER_WEEK,
  formatDayLabel,
  formatDuration,
  formatSignedDuration,
  formatWeekLabel,
  isWeekend,
  slotToLabel,
  startOfWeek,
  sumByCategory,
  timeToSlot,
  toDateKey,
  weekDays,
} from "./timeSlots";
import * as timeDb from "./timeDb";
import { DEFAULT_SETTINGS, type TimeSettings } from "./timeDb";
import { buildCsv, csvFileName } from "./timeCsv";
import {
  CategoryBadge,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FilterChip,
  IconButton,
  Modal,
  MinusIcon,
  PlusIcon,
  SlidersIcon,
  TagIcon,
  TrashIcon,
} from "./ui";

export interface TimeTrackingViewProps {
  categories: Category[];
  /** Oeffnet den bestehenden Kategorien-Dialog aus dem Leerzustand heraus. */
  onManageCategories: () => void;
}

/** Was ein Zug mit den Zellen tut. */
type PaintAction = { kind: "fill"; categoryId: number } | { kind: "clear" };

/** Buchungen der Woche, je Datumsschluessel. */
type WeekSlots = Record<string, DaySlot[]>;

export function TimeTrackingView({ categories, onManageCategories }: TimeTrackingViewProps) {
  const [monday, setMonday] = useState(() => startOfWeek(toDateKey(new Date())));
  const [week, setWeek] = useState<WeekSlots>({});
  const [settings, setSettings] = useState<TimeSettings>(DEFAULT_SETTINGS);
  const [brushId, setBrushId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<{
    date: string;
    startSlot: number;
    value: string;
  } | null>(null);

  // Der laufende Zug: Tag, Aktion und Anker sowie der Stand bei Zugbeginn.
  const drag = useRef<{
    date: string;
    action: PaintAction;
    anchor: number;
    snapshot: DaySlot[];
  } | null>(null);
  // Letzter vorgeschauter Tagesstand, damit pointerup ihn speichern kann.
  const preview = useRef<DaySlot[] | null>(null);
  // Zaehler aller Schreibvorgaenge. Eine Ladezusage, die spaeter als ein Schreiben
  // ankommt, wird verworfen, statt die frische Buchung zu ueberschreiben.
  const writeSeq = useRef(0);

  const days = useMemo(() => weekDays(monday, settings.showWeekend), [monday, settings.showWeekend]);
  const today = toDateKey(new Date());
  const thisMonday = startOfWeek(today);

  useEffect(() => {
    let active = true;
    const seq = writeSeq.current;
    Promise.all(days.map((day) => timeDb.listSlots(day)))
      .then((loaded) => {
        if (!active || seq !== writeSeq.current) return;
        const next: WeekSlots = {};
        days.forEach((day, index) => {
          next[day] = loaded[index];
        });
        setWeek(next);
      })
      .catch(() => {
        if (active) setError("Buchungen konnten nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, [days]);

  useEffect(() => {
    let active = true;
    timeDb.getSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback((change: Partial<TimeSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...change };
      timeDb
        .saveSettings(next)
        .then(setSettings)
        .catch(() => setError("Einstellung konnte nicht gespeichert werden."));
      return next;
    });
  }, []);

  // Pinsel gueltig halten, wenn Kategorien dazukommen oder verschwinden.
  useEffect(() => {
    if (categories.length === 0) {
      setBrushId(null);
      return;
    }
    if (brushId === null || !categories.some((c) => c.id === brushId)) {
      setBrushId(categories[0].id);
    }
  }, [categories, brushId]);

  const categoryById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories) map.set(category.id, category);
    return map;
  }, [categories]);

  const slotLookup = useMemo(() => {
    const map = new Map<string, DaySlot>();
    for (const day of days) {
      for (const slot of week[day] ?? []) map.set(`${day}#${slot.slot}`, slot);
    }
    return map;
  }, [days, week]);

  const dayBlocks = useMemo(
    () => days.map((day) => ({ day, blocks: buildBlocks(week[day] ?? []) })),
    [days, week]
  );

  const daySums = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of days) map.set(day, (week[day] ?? []).length);
    return map;
  }, [days, week]);

  const weekSlots = useMemo(() => days.flatMap((day) => week[day] ?? []), [days, week]);
  const weekSums = useMemo(() => sumByCategory(weekSlots), [weekSlots]);
  const weekTotal = weekSlots.length;
  // Das Soll haengt an den regulaeren Arbeitstagen, nicht an den angezeigten Spalten.
  const weekTarget = settings.targetSlotsPerDay * WORKDAYS_PER_WEEK;
  const difference = weekTotal - weekTarget;

  const categoryName = useCallback(
    (id: number) => categoryById.get(id)?.name ?? "Gelöschte Kategorie",
    [categoryById]
  );

  /** Rechnet den Bereich zwischen Anker und Slot gegen den Stand bei Zugbeginn. */
  const previewRange = useCallback((slot: number) => {
    const current = drag.current;
    if (!current) return;
    const from = Math.min(current.anchor, slot);
    const to = Math.max(current.anchor, slot);
    const range: number[] = [];
    for (let index = from; index <= to; index++) range.push(index);
    const next = applyPaint(
      current.snapshot,
      range,
      current.action.kind === "clear" ? null : current.action.categoryId
    );
    preview.current = next;
    writeSeq.current++;
    setWeek((previous) => ({ ...previous, [current.date]: next }));
  }, []);

  const startPaint = useCallback(
    (day: string, slot: number) => {
      if (brushId === null) return;
      const existing = slotLookup.get(`${day}#${slot}`);
      const action: PaintAction =
        existing && existing.category_id === brushId
          ? { kind: "clear" }
          : { kind: "fill", categoryId: brushId };
      drag.current = { date: day, action, anchor: slot, snapshot: week[day] ?? [] };
      previewRange(slot);
    },
    [brushId, previewRange, slotLookup, week]
  );

  const extendPaint = useCallback(
    (day: string, slot: number) => {
      // Ein Zug bleibt in seiner Spalte; ein Wechsel des Tages wird ignoriert.
      if (drag.current?.date === day) previewRange(slot);
    },
    [previewRange]
  );

  // Der Zeiger kann ausserhalb des Rasters losgelassen werden, darum global. Der Zug
  // wird hier abgeschlossen und der vorgeschaute Stand einmal gespeichert.
  useEffect(() => {
    const stop = () => {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      const pending = preview.current;
      preview.current = null;
      if (!pending) return;
      writeSeq.current++;
      timeDb
        .saveDay(current.date, pending)
        .then((saved) => setWeek((previous) => ({ ...previous, [current.date]: saved })))
        .catch(() => setError("Buchung konnte nicht gespeichert werden."));
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const commitNote = useCallback(() => {
    const draft = noteDraft;
    setNoteDraft(null);
    if (!draft) return;
    const block = buildBlocks(week[draft.date] ?? []).find((b) => b.startSlot === draft.startSlot);
    if (!block || block.note === draft.value.trim()) return;
    writeSeq.current++;
    timeDb
      .setBlockNote(draft.date, draft.startSlot, draft.value.trim())
      .then((saved) => setWeek((previous) => ({ ...previous, [draft.date]: saved })))
      .catch(() => setError("Notiz konnte nicht gespeichert werden."));
  }, [noteDraft, week]);

  const removeBlock = useCallback((day: string, startSlot: number, endSlot: number) => {
    writeSeq.current++;
    timeDb
      .clearBlock(day, startSlot, endSlot)
      .then((saved) => setWeek((previous) => ({ ...previous, [day]: saved })))
      .catch(() => setError("Block konnte nicht gelöscht werden."));
  }, []);

  const exportCsv = useCallback(() => {
    const csv = buildCsv(days, week, categoryName);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFileName(monday);
    link.click();
    URL.revokeObjectURL(url);
  }, [categoryName, days, monday, week]);

  const closeSettings = useCallback(() => setShowSettings(false), []);

  const hasCategories = categories.length > 0;
  const hasBlocks = dayBlocks.some((entry) => entry.blocks.length > 0);

  return (
    <section className="time-view">
      <div className="time-daybar">
        <IconButton
          variant="icon"
          onClick={() => setMonday((m) => addDays(m, -7))}
          aria-label="Vorherige Woche"
        >
          <ChevronLeftIcon />
        </IconButton>
        <span className="time-date">{formatWeekLabel(monday)}</span>
        <IconButton
          variant="icon"
          onClick={() => setMonday((m) => addDays(m, 7))}
          aria-label="Nächste Woche"
        >
          <ChevronRightIcon />
        </IconButton>
        <FilterChip active={monday === thisMonday} onClick={() => setMonday(thisMonday)}>
          Diese Woche
        </FilterChip>
        <IconButton
          variant="icon"
          onClick={() => setShowSettings(true)}
          aria-label="Einstellungen der Zeiterfassung"
        >
          <SlidersIcon />
        </IconButton>
        <span className="time-total">
          Woche <strong>{formatDuration(weekTotal)}</strong>
        </span>
        <span
          className={`time-difference ${difference < 0 ? "behind" : difference > 0 ? "ahead" : ""}`}
          title={`Soll ${formatDuration(weekTarget)}`}
        >
          {formatSignedDuration(difference)}
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      {!hasCategories ? (
        <div className="time-empty">
          <p className="muted">
            Zeit wird auf Kategorien gebucht. Leg zuerst eine Kategorie an, dann kannst du
            Viertelstunden malen.
          </p>
          <IconButton variant="icon" onClick={onManageCategories} aria-label="Kategorien verwalten">
            <TagIcon />
            Kategorien
          </IconButton>
        </div>
      ) : (
        <>
          <div className="time-brushes">
            <span className="filter-label">Pinsel</span>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`time-brush ${brushId === category.id ? "active" : ""}`}
                style={{ background: category.color }}
                onClick={() => setBrushId(category.id)}
                aria-pressed={brushId === category.id}
                aria-label={`Pinsel ${category.name}`}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className={`time-grid days-${days.length}`}>
            <div className="time-grid-days">
              <span className="time-hour-label" aria-hidden="true" />
              {days.map((day) => (
                <span
                  key={day}
                  className={`time-day-label ${day === today ? "today" : ""} ${
                    isWeekend(day) ? "weekend" : ""
                  }`}
                >
                  {formatDayLabel(day)}
                </span>
              ))}
            </div>

            <div className="time-grid-head">
              <span className="time-hour-label" aria-hidden="true" />
              {days.map((day) =>
                [0, 15, 30, 45].map((minute) => (
                  <span
                    key={`${day}-${minute}`}
                    className={`time-quarter-label ${minute === 0 ? "day-start" : ""}`}
                  >
                    {String(minute).padStart(2, "0")}
                  </span>
                ))
              )}
            </div>

            {dayHours().map((hour) => (
              <div key={hour} className="time-grid-row">
                <span className="time-hour-label">{String(hour).padStart(2, "0")}</span>
                {days.map((day) =>
                  Array.from({ length: SLOTS_PER_HOUR }, (_, quarter) => {
                    const slot = timeToSlot(hour, quarter * 15);
                    const booked = slotLookup.get(`${day}#${slot}`);
                    const color = booked ? categoryById.get(booked.category_id)?.color : undefined;
                    return (
                      <button
                        key={`${day}-${slot}`}
                        type="button"
                        className={`time-cell ${booked ? "booked" : ""} ${
                          quarter === 0 ? "day-start" : ""
                        } ${isWeekend(day) ? "weekend" : ""}`}
                        style={color ? { background: color } : undefined}
                        draggable={false}
                        onPointerDown={() => startPaint(day, slot)}
                        onPointerEnter={() => extendPaint(day, slot)}
                        aria-label={`${formatDayLabel(day)} ${slotToLabel(slot)}, ${
                          booked ? categoryName(booked.category_id) : "frei"
                        }`}
                      />
                    );
                  })
                )}
              </div>
            ))}

            <div className="time-grid-foot">
              <span className="time-hour-label" aria-hidden="true" />
              {days.map((day) => (
                <span key={day} className="time-day-sum">
                  {formatDuration(daySums.get(day) ?? 0)}
                </span>
              ))}
            </div>
          </div>

          <div className="time-blocks">
            <h2 className="time-blocks-title">Blöcke der Woche</h2>
            {!hasBlocks ? (
              <p className="muted">
                Noch nichts gebucht. Wähle einen Pinsel und streich über die Viertelstunden.
              </p>
            ) : (
              dayBlocks
                .filter((entry) => entry.blocks.length > 0)
                .map(({ day, blocks }) => (
                  <div key={day} className="time-block-group">
                    <h3 className="time-block-day">
                      {formatDayLabel(day)}
                      <span className="time-block-day-sum">
                        {formatDuration(daySums.get(day) ?? 0)}
                      </span>
                    </h3>
                    <ul className="time-block-list">
                      {blocks.map((block) => (
                        <li key={block.startSlot} className="time-block">
                          <span className="time-block-range">
                            {slotToLabel(block.startSlot)}–{slotToLabel(block.endSlot)}
                          </span>
                          <CategoryBadge
                            variant="list"
                            color={categoryById.get(block.category_id)?.color ?? null}
                          >
                            {categoryName(block.category_id)}
                          </CategoryBadge>
                          <span className="time-block-duration">
                            {formatDuration(block.slotCount)}
                          </span>
                          <input
                            type="text"
                            className="time-note-input"
                            placeholder="Notiz"
                            value={
                              noteDraft?.date === day && noteDraft.startSlot === block.startSlot
                                ? noteDraft.value
                                : block.note
                            }
                            onChange={(e) =>
                              setNoteDraft({
                                date: day,
                                startSlot: block.startSlot,
                                value: e.currentTarget.value,
                              })
                            }
                            onBlur={commitNote}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setNoteDraft(null);
                                e.currentTarget.blur();
                              }
                            }}
                            aria-label={`Notiz für ${formatDayLabel(day)} ${slotToLabel(
                              block.startSlot
                            )}`}
                          />
                          <IconButton
                            variant="action"
                            danger
                            onClick={() => removeBlock(day, block.startSlot, block.endSlot)}
                            aria-label={`Block ${formatDayLabel(day)} ${slotToLabel(
                              block.startSlot
                            )} löschen`}
                          >
                            <TrashIcon />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </div>

          {weekSums.length > 0 && (
            <div className="time-sums">
              {weekSums.map((sum) => (
                <span key={sum.category_id} className="time-sum">
                  <CategoryBadge
                    variant="list"
                    color={categoryById.get(sum.category_id)?.color ?? null}
                  >
                    {categoryName(sum.category_id)}
                  </CategoryBadge>
                  {formatDuration(sum.slotCount)}
                </span>
              ))}
              <span className="time-sum-total">= {formatDuration(weekTotal)}</span>
            </div>
          )}
        </>
      )}

      {showSettings && (
        <Modal
          variant="category"
          title="Zeiterfassung"
          onClose={closeSettings}
          closeLabel="Schließen"
        >
          <div className="time-settings">
            <div className="time-setting">
              <span className="time-setting-label">Soll je Arbeitstag</span>
              <div className="time-stepper">
                <IconButton
                  variant="icon"
                  onClick={() =>
                    updateSettings({ targetSlotsPerDay: settings.targetSlotsPerDay - 1 })
                  }
                  disabled={settings.targetSlotsPerDay === 0}
                  aria-label="Sollzeit je Tag um 15 Minuten verringern"
                >
                  <MinusIcon />
                </IconButton>
                <span className="time-target-value">
                  {formatDuration(settings.targetSlotsPerDay)}
                </span>
                <IconButton
                  variant="icon"
                  onClick={() =>
                    updateSettings({ targetSlotsPerDay: settings.targetSlotsPerDay + 1 })
                  }
                  aria-label="Sollzeit je Tag um 15 Minuten erhöhen"
                >
                  <PlusIcon size={14} />
                </IconButton>
              </div>
            </div>

            <p className="time-setting-hint">
              Soll der Woche <strong>{formatDuration(weekTarget)}</strong> — fünf Arbeitstage.
              Samstag und Sonntag zählen nicht mit, auch wenn sie angezeigt werden.
            </p>

            <div className="time-setting">
              <span className="time-setting-label">Wochenende anzeigen</span>
              <FilterChip
                active={settings.showWeekend}
                onClick={() => updateSettings({ showWeekend: !settings.showWeekend })}
                aria-pressed={settings.showWeekend}
                aria-label="Wochenende anzeigen"
              >
                {settings.showWeekend ? "An" : "Aus"}
              </FilterChip>
            </div>

            <div className="time-setting">
              <span className="time-setting-label">Woche exportieren</span>
              <IconButton
                variant="icon"
                onClick={exportCsv}
                aria-label="Woche als CSV exportieren"
              >
                <DownloadIcon />
                CSV
              </IconButton>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
