// Setzt den Baum aus `src/markdown.ts` in React-Elemente um.
//
// Bewusst kein `dangerouslySetInnerHTML`: der Parser liefert Werte, nicht
// HTML, und dieser Baustein erzeugt daraus Elemente. Damit kann aus einer
// Beschreibung -- die auch ueber MCP von einem Modell geschrieben wird --
// kein Markup in die App gelangen.

import type { ReactNode } from "react";
import { parseMarkdown } from "../markdown";
import type { Block, Inline } from "../markdown";
import { isTauri } from "../sqlClient";
import { CheckIcon } from "./icons";

export interface MarkdownProps {
  /** Der Quelltext. Leer heisst: nichts rendern, der Aufrufer zeigt seinen Leerzustand. */
  text: string;
  className?: string;
}

/** Im Fenster steht bereits eine `<h2>`; die Ueberschriften des Textes
 *  ordnen sich darunter ein, statt sie zu wiederholen. */
const HEADING_TAG = { 1: "h3", 2: "h4", 3: "h5" } as const;

export function Markdown({ text, className }: MarkdownProps) {
  if (text.trim() === "") return null;
  const blocks = parseMarkdown(text);
  return (
    <div className={className ? `markdown ${className}` : "markdown"}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = HEADING_TAG[block.level];
      return <Tag key={key}>{renderInlines(block.children)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{renderInlines(block.children)}</p>;
    case "code":
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr key={key} />;
    case "quote":
      return (
        <blockquote key={key}>{block.blocks.map((inner, i) => renderBlock(inner, i))}</blockquote>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} className={item.checked === null ? undefined : "markdown-task"}>
          {item.checked !== null && (
            <span
              className={item.checked ? "markdown-check checked" : "markdown-check"}
              role="img"
              aria-label={item.checked ? "erledigt" : "offen"}
            >
              {item.checked && <CheckIcon size={12} />}
            </span>
          )}
          <span>{renderInlines(item.children)}</span>
        </li>
      ));
      // Eine Checkliste traegt ihre Haken selbst; der Aufzaehlungspunkt daneben
      // waere eine zweite Markierung derselben Zeile.
      const isTaskList = block.items.every((item) => item.checked !== null);
      const listClass = isTaskList ? "markdown-tasks" : undefined;
      return block.ordered ? (
        // `start` steht nur da, wenn die Liste nicht bei eins beginnt --
        // `start={1}` waere im DOM Rauschen.
        <ol key={key} className={listClass} start={block.start === 1 ? undefined : block.start}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={listClass}>
          {items}
        </ul>
      );
    }
  }
}

function renderInlines(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => renderInline(node, index));
}

function renderInline(node: Inline, key: number): ReactNode {
  switch (node.kind) {
    // Ein blanker String in einer Liste braucht keinen Schluessel -- React
    // warnt nur bei Elementen -- und spart ein <span> je Textstueck.
    case "text":
      return node.text;
    case "break":
      return <br key={key} />;
    case "code":
      return <code key={key}>{node.text}</code>;
    case "strong":
      return <strong key={key}>{renderInlines(node.children)}</strong>;
    case "em":
      return <em key={key}>{renderInlines(node.children)}</em>;
    case "del":
      return <del key={key}>{renderInlines(node.children)}</del>;
    case "link":
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => handleLinkClick(e, node.href)}
        >
          {renderInlines(node.children)}
        </a>
      );
  }
}

/**
 * Im Browser bleibt es beim gewoehnlichen Link. In Tauri fuehrt `target="_blank"`
 * ins Leere -- das WebView oeffnet kein zweites Fenster --, darum geht die
 * Adresse dort an den Systembrowser. Der Import passiert erst beim Klick, damit
 * die Browser- und Testumgebung das Tauri-Modul nie laedt.
 */
function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (!isTauri()) return;
  e.preventDefault();
  void import("@tauri-apps/plugin-opener")
    .then(({ openUrl }) => openUrl(href))
    // Faellt das Plugin aus -- nicht registriert, Capability fehlt --, bleibt
    // der Link sonst tot und der Fehler unbehandelt in der Konsole.
    .catch(() => window.open(href, "_blank", "noopener"));
}
