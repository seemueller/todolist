// Zentrale SVG-Icon-Sammlung der UI-Bibliothek.
// Nimm diese Icons ueberall statt inline-SVG: einheitlich stroke-basiert,
// faerben sich ueber currentColor und sind per aria-hidden vom Screenreader
// ausgenommen (die Beschriftung liefert der umgebende Button via aria-label).
// Alle Icons nehmen die ueblichen SVG-Props entgegen (size, className, style ...).

import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Kantenlaenge in px (setzt width und height). Default je Icon. */
  size?: number;
}

interface BaseIconProps extends IconProps {
  viewBox: string;
  children: ReactNode;
}

function BaseIcon({
  size = 14,
  viewBox,
  strokeWidth = 1.6,
  children,
  ...rest
}: BaseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Haken - Checkbox, Kanban-"erledigt", Kategorie speichern, Erledigt-Burst. */
export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={2} {...props}>
      <path d="M2 7l4 4 6-8" />
    </BaseIcon>
  );
}

/** Kreuz - Modal schliessen. */
export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={2} {...props}>
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
    </BaseIcon>
  );
}

/** Stift - Bearbeiten (Todo-Zeile und Kategorien-Modal). */
export function PencilIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 16 16" strokeWidth={1.6} {...props}>
      <path d="M11 2.6l2.4 2.4M2.4 13.6l.6-3L11 2.6l2.4 2.4-8 8-3 .6z" />
    </BaseIcon>
  );
}

/** Muelleimer - Loeschen (Todo-Zeile, Kanban-Karte, Kategorien-Modal). */
export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 16 16" strokeWidth={1.6} {...props}>
      <path d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M6.5 7.5v4M9.5 7.5v4M4.2 4.5l.6 8a1 1 0 001 1h4.4a1 1 0 001-1l.6-8" />
    </BaseIcon>
  );
}

/** Etikett - Knopf "Kategorien verwalten". */
export function TagIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.7} {...props}>
      <path d="M7.2 1.8H2v5.2l5 5 5.2-5.2-5-5z" />
      <circle cx="4.6" cy="4.4" r="1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

/** Plus - Absenden des Hinzufuegen-Formulars (18px). */
export function PlusIcon(props: IconProps) {
  return (
    <BaseIcon size={18} viewBox="0 0 18 18" strokeWidth={2} {...props}>
      <path d="M9 3v12M3 9h12" />
    </BaseIcon>
  );
}

/** Minus - Sollzeit verringern. */
export function MinusIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={2} {...props}>
      <path d="M3 7h8" />
    </BaseIcon>
  );
}

/** Schieberegler - Einstellungen der Zeiterfassung. Bei 14px lesbarer als ein Zahnrad. */
export function SlidersIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.6} {...props}>
      <path d="M1.8 4.2h10.4M1.8 9.8h10.4" />
      <circle cx="5" cy="4.2" r="1.6" fill="var(--canvas)" />
      <circle cx="9.2" cy="9.8" r="1.6" fill="var(--canvas)" />
    </BaseIcon>
  );
}

/** Pfeil in eine Ablage - CSV-Export. */
export function DownloadIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.6} {...props}>
      <path d="M7 1.8v6.4M4.4 5.8L7 8.4l2.6-2.6" />
      <path d="M2.2 10.2v1.4a.6.6 0 00.6.6h8.4a.6.6 0 00.6-.6v-1.4" />
    </BaseIcon>
  );
}

/** Pfeil nach links - Kanban-Karte zurueck nach "Zu tun". */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.5} {...props}>
      <path d="M9 3L5 7l4 4" />
    </BaseIcon>
  );
}

/** Pfeil nach rechts - Tag vorwaerts in der Zeiterfassung. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.5} {...props}>
      <path d="M5 3l4 4-4 4" />
    </BaseIcon>
  );
}

/** Kanban-Lane "Zu tun". */
export function LaneTodoIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.6} {...props}>
      <rect x="2.5" y="2" width="9" height="10" rx="1.5" />
      <path d="M5 5.5h4M5 8h2.5" />
    </BaseIcon>
  );
}

/** Kanban-Lane "In Bearbeitung". */
export function LaneProgressIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.6} {...props}>
      <path d="M7 1.5v3M7 9.5v3M1.5 7h3M9.5 7h3" />
      <circle cx="7" cy="7" r="2.5" />
    </BaseIcon>
  );
}

/** Kanban-Lane "Erledigt". */
export function LaneDoneIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={2} {...props}>
      <path d="M2.5 7.2l3 3 6-7" />
    </BaseIcon>
  );
}

/** Listen-Symbol im Ansicht-Umschalter (18px). */
export function ListViewIcon(props: IconProps) {
  return (
    <BaseIcon size={18} viewBox="0 0 18 18" strokeWidth={1.5} {...props}>
      <rect x="3" y="3" width="5" height="4" rx="1" />
      <rect x="3" y="9" width="5" height="4" rx="1" />
      <line x1="10" y1="5" x2="15" y2="5" />
      <line x1="10" y1="11" x2="15" y2="11" />
    </BaseIcon>
  );
}

/** Brett-Symbol im Ansicht-Umschalter (18px). */
export function BoardViewIcon(props: IconProps) {
  return (
    <BaseIcon size={18} viewBox="0 0 18 18" strokeWidth={1.5} {...props}>
      <rect x="1" y="3" width="4" height="12" rx="1" />
      <rect x="7" y="3" width="4" height="8" rx="1" />
      <rect x="13" y="3" width="4" height="10" rx="1" />
    </BaseIcon>
  );
}

/** Uhr-Symbol im Ansicht-Umschalter (18px). */
export function ClockViewIcon(props: IconProps) {
  return (
    <BaseIcon size={18} viewBox="0 0 18 18" strokeWidth={1.5} {...props}>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5.5V9l2.5 1.8" />
    </BaseIcon>
  );
}

/** Update-Pfeil im Footer. */
export function UpdateIcon(props: IconProps) {
  return (
    <BaseIcon viewBox="0 0 14 14" strokeWidth={1.6} {...props}>
      <path d="M1.5 7a5.5 5.5 0 0110.2-2.8M12.5 7a5.5 5.5 0 01-10.2 2.8" />
      <polyline points="8.5,1.5 11.5,2 11.5,5" />
      <polyline points="5.5,12.5 2.5,12 2.5,9" />
    </BaseIcon>
  );
}
