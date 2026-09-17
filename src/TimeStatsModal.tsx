// Auswertung der Zeiterfassung: welcher Anteil der Arbeitszeit auf welche
// Kategorie faellt, einmal fuer die angezeigte Woche und einmal fuer einen
// Kalendermonat.
//
// Gezaehlt wird ausschliesslich Arbeitszeit -- Kategorien mit der Zeitart
// "none" (Pause, Privates) bleiben aussen vor, damit 100 % dasselbe bedeuten
// wie die Wochensumme in der Kopfzeile der Zeiterfassung. Wie dort gilt eine
// geloeschte Kategorie als Arbeitszeit, sonst fiele bereits gebuchte Zeit aus
// der Summe.
//
// Die Woche folgt der Ansicht dahinter; der Monat hat eine eigene Navigation
// und beginnt bei dem Monat, in dem die angezeigte Woche startet. Beide
// Zeitraeume kommen ueber timeDb.listRange -- ein Monat kostet damit eine
// Abfrage statt einunddreissig. Die Woche wird immer mit Samstag und Sonntag
// geladen, unabhaengig vom Wochenend-Schalter: was gebucht ist, zaehlt in der
// Auswertung mit, auch wenn die Matrix die Spalte gerade nicht zeigt.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Category, TimeKind } from "./types";
import {
  CategoryShare,
  addDays,
  addMonths,
  endOfMonth,
  formatDuration,
  formatMonthLabel,
  formatPercent,
  formatWeekLabel,
  shareByCategory,
  splitByWorkTime,
  startOfMonth,
  sumByCategory,
  sumSlots,
} from "./timeSlots";
import * as timeDb from "./timeDb";
import { TimeSlotRecord } from "./timeTypes";
import { CategoryBadge, ChevronLeftIcon, ChevronRightIcon, IconButton, Modal } from "./ui";

export interface TimeStatsModalProps {
  categories: Category[];
  /** Montag der Woche, die die Zeiterfassung gerade zeigt. */
  monday: string;
  onClose: () => void;
}

/** Ein ausgewerteter Zeitraum: Anteile je Kategorie und deren Gesamtsumme. */
interface Distribution {
  shares: CategoryShare[];
  totalSlots: number;
}

export function TimeStatsModal({ categories, monday, onClose }: TimeStatsModalProps) {
  const [month, setMonth] = useState(() => startOfMonth(monday));
  const [weekRecords, setWeekRecords] = useState<TimeSlotRecord[] | null>(null);
  const [monthRecords, setMonthRecords] = useState<TimeSlotRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setWeekRecords(null);
    timeDb
      .listRange(monday, addDays(monday, 6))
      .then((records) => {
        if (active) setWeekRecords(records);
      })
      .catch(() => {
        if (active) setError("Auswertung konnte nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, [monday]);

  useEffect(() => {
    let active = true;
    setMonthRecords(null);
    timeDb
      .listRange(startOfMonth(month), endOfMonth(month))
      .then((records) => {
        if (active) setMonthRecords(records);
      })
      .catch(() => {
        if (active) setError("Auswertung konnte nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, [month]);

  const categoryById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of categories) map.set(category.id, category);
    return map;
  }, [categories]);

  // Eine Kategorie, die es nicht mehr gibt, gilt als Arbeitszeit -- dieselbe
  // Regel wie in der Wochenansicht.
  const distribute = useCallback(
    (records: TimeSlotRecord[] | null): Distribution | null => {
      if (!records) return null;
      const kindOf = (id: number): TimeKind => categoryById.get(id)?.time_kind ?? "internal";
      const { work } = splitByWorkTime(sumByCategory(records), kindOf);
      return { shares: shareByCategory(work), totalSlots: sumSlots(work) };
    },
    [categoryById]
  );

  const weekDistribution = useMemo(() => distribute(weekRecords), [distribute, weekRecords]);
  const monthDistribution = useMemo(() => distribute(monthRecords), [distribute, monthRecords]);

  const nameOf = (id: number) => categoryById.get(id)?.name ?? "Gelöschte Kategorie";
  const colorOf = (id: number) => categoryById.get(id)?.color ?? null;

  function renderDistribution(distribution: Distribution | null, label: string) {
    if (!distribution) return <p className="muted">Wird geladen …</p>;
    if (distribution.shares.length === 0) {
      return <p className="muted">Keine Arbeitszeit {label} gebucht.</p>;
    }
    return (
      <ul className="time-share-list">
        {distribution.shares.map((share) => (
          <li key={share.category_id} className="time-share">
            <CategoryBadge variant="list" color={colorOf(share.category_id)}>
              {nameOf(share.category_id)}
            </CategoryBadge>
            <span className="time-share-bar" aria-hidden="true">
              <span
                className="time-share-fill"
                style={{
                  width: `${share.percent}%`,
                  backgroundColor: colorOf(share.category_id) ?? undefined,
                }}
              />
            </span>
            <span className="time-share-duration">{formatDuration(share.slotCount)}</span>
            <span className="time-share-percent">{formatPercent(share.percent)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Modal variant="stats" title="Auswertung" onClose={onClose} closeLabel="Schließen">
      <div className="time-stats">
        {error && <p className="error">{error}</p>}

        <div className="time-stats-section">
          <div className="time-stats-head">
            <h3 className="time-stats-title">Woche {formatWeekLabel(monday)}</h3>
            <span className="time-stats-total">
              {formatDuration(weekDistribution?.totalSlots ?? 0)}
            </span>
          </div>
          {renderDistribution(weekDistribution, "in dieser Woche")}
        </div>

        <div className="time-stats-section">
          <div className="time-stats-head">
            <IconButton
              variant="icon"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              aria-label="Vorheriger Monat"
            >
              <ChevronLeftIcon />
            </IconButton>
            <h3 className="time-stats-title">{formatMonthLabel(month)}</h3>
            <IconButton
              variant="icon"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Nächster Monat"
            >
              <ChevronRightIcon />
            </IconButton>
            <span className="time-stats-total">
              {formatDuration(monthDistribution?.totalSlots ?? 0)}
            </span>
          </div>
          {renderDistribution(monthDistribution, "in diesem Monat")}
        </div>

        <p className="time-stats-hint">
          Gezählt wird nur Arbeitszeit; Pausen und Privates bleiben außen vor.
        </p>
      </div>
    </Modal>
  );
}
