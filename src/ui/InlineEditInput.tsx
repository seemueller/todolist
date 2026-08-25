// Textfeld fuer Inline-Bearbeitung (.edit-input) mit dem ueberall gleichen
// Tastaturvertrag: Enter und Blur uebernehmen, Escape bricht ab.
// Nimm es fuer jede Umbenennung an Ort und Stelle (Todo-Titel, Kategoriename).

import type { InputHTMLAttributes } from "react";

export interface InlineEditInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "onBlur" | "onKeyDown"
  > {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter oder Verlassen des Feldes. */
  onCommit: () => void;
  /** Escape. */
  onCancel: () => void;
}

export function InlineEditInput({
  value,
  onValueChange,
  onCommit,
  onCancel,
  className,
  type = "text",
  ...rest
}: InlineEditInputProps) {
  const classes = ["edit-input", className ?? ""].filter(Boolean).join(" ");

  return (
    <input
      className={classes}
      type={type}
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      {...rest}
    />
  );
}
