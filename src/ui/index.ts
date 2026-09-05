// Wiederverwendbare UI-Bausteine der TodoList.
// Alles Styling bleibt in src/App.css; die Komponenten setzen ausschliesslich
// dort bereits vorhandene Klassennamen und reichen restliche DOM-Props durch.
//
// Import in App.tsx: import { IconButton, Modal, PencilIcon } from "./ui";
//
// Neue UI wird zuerst aus diesen Bausteinen gebaut. Eine neue Komponente
// entsteht erst, wenn ein Muster zum zweiten Mal auftaucht — siehe STYLEGUIDE.md.

export {
  BoardViewIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockViewIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  LaneDoneIcon,
  LaneProgressIcon,
  LaneTodoIcon,
  ListViewIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  SlidersIcon,
  TagIcon,
  TrashIcon,
  UpdateIcon,
} from "./icons";

export { IconButton } from "./IconButton";
export type { IconButtonProps, IconButtonVariant } from "./IconButton";

export { FilterChip } from "./FilterChip";
export type { FilterChipProps, FilterChipVariant } from "./FilterChip";

export { CategorySelect } from "./CategorySelect";
export type { CategorySelectProps } from "./CategorySelect";

export { PrioritySelect } from "./PrioritySelect";
export type { PrioritySelectProps, PrioritySelectVariant } from "./PrioritySelect";

export { DueDateBadge } from "./DueDateBadge";
export type { BadgeVariant, DueDateBadgeProps } from "./DueDateBadge";

export { CategoryBadge, CATEGORY_BADGE_FALLBACK } from "./CategoryBadge";
export type { CategoryBadgeProps, CategoryBadgeVariant } from "./CategoryBadge";

export { Modal } from "./Modal";
export type { ModalProps, ModalVariant } from "./Modal";

export { ColorPicker } from "./ColorPicker";
export type { ColorPickerProps } from "./ColorPicker";

export { InlineEditInput } from "./InlineEditInput";
export type { InlineEditInputProps } from "./InlineEditInput";
