// Ein kleiner Markdown-Parser fuer die Beschreibung einer Aufgabe.
//
// Warum eigen und nicht `react-markdown` oder `marked`: die Beschreibung ist
// der einzige Ort im Projekt, an dem Markdown vorkommt, und sie wird von Hand
// oder ueber MCP geschrieben -- kein CommonMark-Dokument. Ein eigener Parser
// haelt die App abhaengigkeitsfrei und, wichtiger, sicher: er liefert einen
// Baum aus Werten, den `src/ui/Markdown.tsx` in React-Elemente umsetzt. Es
// entsteht nirgends ein HTML-String, also gibt es auch kein
// `dangerouslySetInnerHTML` und keinen Sanitizer, der vergessen werden kann.
//
// Bewusst nicht unterstuetzt: Tabellen, Fussnoten, verschachtelte Listen,
// Bilder und rohes HTML. Rohes HTML wird als Text ausgegeben, nicht gedeutet.
// Was der Parser nicht kennt, bleibt sichtbarer Text -- nichts verschwindet.

/** Ein Textstueck innerhalb einer Zeile. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "break" }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "del"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

/** Ein Punkt einer Liste. `checked` ist `null`, wenn es keine Checkliste ist. */
export interface ListItem {
  checked: boolean | null;
  children: Inline[];
}

/** Ein Block auf oberster Ebene. */
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s{0,3}(?:```|~~~)/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;

/** Zitate duerfen sich schachteln, aber nicht endlos -- sonst frisst ein
 *  Text aus lauter `>` den Stack. */
const MAX_QUOTE_DEPTH = 4;

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

/**
 * Zerlegt Markdown in Bloecke. Reine Funktion, ohne React -- `src/ui/Markdown.tsx`
 * setzt das Ergebnis in Elemente um.
 */
export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source, 0);
}

/** `depth` zaehlt die Schachtelung der Zitate und bleibt darum intern: als
 *  zweiter Parameter der oeffentlichen Funktion koennte ein Aufrufer die
 *  Schachtelung still abschalten. */
function parseBlocks(source: string, depth: number): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Codeblock: alles bis zum schliessenden Zaun bleibt woertlich stehen.
    if (FENCE.test(line)) {
      const fence = line.trim().slice(0, 3);
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        body.push(lines[i]);
        i += 1;
      }
      // Fehlt der schliessende Zaun, endet der Block am Textende.
      if (i < lines.length) i += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // Mehr als drei Ebenen gibt die Typografie der App nicht her; tiefere
      // Ueberschriften landen auf der dritten, statt zu verschwinden.
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, children: parseInline(heading[2].trim()) });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i]);
        if (quoted) {
          body.push(quoted[1]);
          i += 1;
          continue;
        }
        // Lazy continuation: eine Folgezeile ohne `>` gehoert noch zum Zitat,
        // solange sie nicht selbst einen Block beginnt.
        if (lines[i].trim() !== "" && !startsBlock(lines[i])) {
          body.push(lines[i]);
          i += 1;
          continue;
        }
        break;
      }
      const inner =
        depth >= MAX_QUOTE_DEPTH
          ? [{ kind: "paragraph" as const, children: parseInline(body.join("\n")) }]
          : parseBlocks(body.join("\n"), depth + 1);
      blocks.push({ kind: "quote", blocks: inner });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = !bullet;
      // Die Startnummer gehoert zur Liste: `3. drei` beginnt bei drei, nicht
      // bei eins. Eine stille Eins waere eine falsche Zahl auf dem Schirm.
      const start = ordered ? Number(ordered[2]) : 1;
      const items: ListItem[] = [];
      let itemLines: string[] = [];
      let itemChecked: boolean | null = null;

      const flush = () => {
        if (itemLines.length === 0) return;
        items.push({ checked: itemChecked, children: parseInline(itemLines.join("\n")) });
        itemLines = [];
        itemChecked = null;
      };

      while (i < lines.length) {
        const nextBullet = BULLET.exec(lines[i]);
        const nextOrdered = ORDERED.exec(lines[i]);
        const match = isOrdered ? nextOrdered : nextBullet;
        // Ein Wechsel der Aufzaehlungsart beginnt eine neue Liste.
        if ((isOrdered && nextBullet) || (!isOrdered && nextOrdered)) break;

        if (match) {
          flush();
          const task = TASK.exec(match[3]);
          if (task) {
            itemChecked = task[1].toLowerCase() === "x";
            itemLines.push(task[2]);
          } else {
            itemLines.push(match[3]);
          }
          i += 1;
          continue;
        }
        // Folgezeile eines Punktes: alles, was nicht leer ist und keinen
        // eigenen Block beginnt, haengt am laufenden Punkt.
        if (itemLines.length > 0 && lines[i].trim() !== "" && !startsBlock(lines[i])) {
          itemLines.push(lines[i].trim());
          i += 1;
          continue;
        }
        break;
      }
      flush();
      blocks.push({ kind: "list", ordered: isOrdered, start, items });
      continue;
    }

    // Absatz: laeuft bis zur naechsten Leerzeile oder bis ein Block beginnt.
    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}

/** Nur diese Schemata werden zu einem Link. Alles andere -- allen voran
 *  `javascript:` -- bleibt als Text stehen. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)[^\s]+$/i;
const AUTOLINK = /^https?:\/\/[^\s<>()]+/i;
/** Satzzeichen am Ende gehoeren zum Satz, nicht zur Adresse. */
const TRAILING = /[.,;:!?]+$/;

function safeHref(raw: string): string | null {
  const href = raw.trim();
  return SAFE_HREF.test(href) ? href : null;
}

/** Ein Zeichen, das links/rechts einer Betonung stehen darf, ohne dass ein
 *  `_` mitten im Wort (`snake_case`) als Kursivschrift gilt. */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);
}

/** Betonungen und Linkbeschriftungen rufen `parseInline` erneut auf. Ohne
 *  Deckel reisst ein Text aus lauter `[` den Stack -- und das mitten im
 *  Rendern, wo ein geworfener Fehler die ganze Ansicht kostet. */
const MAX_INLINE_DEPTH = 8;

/** Wie weit ein `[` nach seiner schliessenden Klammer sucht. Ohne Fenster
 *  sucht jedes `[` bis zum Textende; bei `"[".repeat(100000)` sind das zehn
 *  Sekunden, in denen die Oberflaeche steht. Beschriftung und Adresse eines
 *  Links sind kurz, das Fenster kostet also nichts Echtes. */
const LINK_SPAN = 1000;

/** Zerlegt eine Zeile in Textstuecke. */
export function parseInline(source: string): Inline[] {
  return parseInlines(source, 0);
}

function parseInlines(source: string, depth: number): Inline[] {
  // Zu tief: der Rest bleibt als Text stehen, statt zu werfen.
  if (depth > MAX_INLINE_DEPTH) return source === "" ? [] : [{ kind: "text", text: source }];
  const out: Inline[] = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (buffer !== "") {
      out.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  while (i < source.length) {
    const ch = source[i];

    // Maskierung: `\*` ist ein Sternchen, kein Betonungszeichen.
    if (ch === "\\" && i + 1 < source.length && /[\\`*_~[\]()#>-]/.test(source[i + 1])) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }

    if (ch === "\n") {
      flush();
      out.push({ kind: "break" });
      i += 1;
      continue;
    }

    // Code hat Vorrang vor allem anderen: was zwischen Backticks steht, wird
    // nicht weiter gedeutet.
    if (ch === "`") {
      // Der Zweig steht hinter `ch === "`"`, ein Treffer ist also sicher --
      // trotzdem als Wert gefuehrt, wie alles andere in diesem Modul auch.
      const run = /^`+/.exec(source.slice(i))?.[0] ?? "`";
      const close = source.indexOf(run, i + run.length);
      if (close !== -1) {
        flush();
        out.push({ kind: "code", text: stripOneSpace(source.slice(i + run.length, close)) });
        i = close + run.length;
        continue;
      }
    }

    if (ch === "[") {
      const link = matchLink(source, i, depth);
      if (link) {
        flush();
        out.push(link.node);
        i = link.end;
        continue;
      }
    }

    if (ch === "h" || ch === "H") {
      const auto = AUTOLINK.exec(source.slice(i));
      if (auto) {
        const url = auto[0].replace(TRAILING, "");
        const href = safeHref(url);
        if (href) {
          flush();
          out.push({ kind: "link", href, children: [{ kind: "text", text: url }] });
          i += url.length;
          continue;
        }
      }
    }

    const emphasis = matchEmphasis(source, i, depth);
    if (emphasis) {
      flush();
      out.push(emphasis.node);
      i = emphasis.end;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out;
}

/** Ein Code-Stueck behaelt seinen Weissraum; nur das eine Leerzeichen, das
 *  die Backticks vom Inhalt trennt, faellt weg (`` ` a ` `` -> `a`). */
function stripOneSpace(text: string): string {
  if (text.length > 1 && text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "") {
    return text.slice(1, -1);
  }
  return text;
}

/** `[Text](adresse)` ab Position `start`. */
function matchLink(source: string, start: number, depth: number): { node: Inline; end: number } | null {
  const labelLimit = Math.min(source.length, start + LINK_SPAN);
  let open = 0;
  let close = -1;
  for (let j = start; j < labelLimit; j += 1) {
    if (source[j] === "\\") {
      j += 1;
      continue;
    }
    if (source[j] === "[") open += 1;
    else if (source[j] === "]") {
      open -= 1;
      if (open === 0) {
        close = j;
        break;
      }
    }
  }
  if (close === -1 || source[close + 1] !== "(") return null;

  // Klammern in der Adresse gehoeren zur Adresse, solange sie sich paaren:
  // `[a](https://e.org/x(y))` zeigt sonst auf `https://e.org/x(y`.
  const urlLimit = Math.min(source.length, close + 2 + LINK_SPAN);
  let nested = 0;
  let end = -1;
  for (let j = close + 2; j < urlLimit; j += 1) {
    const c = source[j];
    if (c === "(") nested += 1;
    else if (c === ")") {
      if (nested === 0) {
        end = j;
        break;
      }
      nested -= 1;
    }
  }
  if (end === -1) return null;

  const href = safeHref(source.slice(close + 2, end));
  // Unbekanntes Schema: der Text bleibt sichtbar, samt Klammern -- so sieht
  // man, dass da etwas stand, statt dass es stumm verschwindet.
  if (!href) return null;

  // Leere Beschriftung: die Adresse selbst ist die Beschriftung. Ein Link ohne
  // Kindknoten rendert nichts und waere spurlos verschwunden.
  const label = source.slice(start + 1, close);
  const children = label === "" ? [{ kind: "text" as const, text: href }] : parseInlines(label, depth + 1);
  return { node: { kind: "link", href, children }, end: end + 1 };
}

const MARKERS: { marker: string; kind: "strong" | "em" | "del" }[] = [
  { marker: "***", kind: "strong" },
  { marker: "**", kind: "strong" },
  { marker: "__", kind: "strong" },
  { marker: "~~", kind: "del" },
  { marker: "*", kind: "em" },
  { marker: "_", kind: "em" },
];

/** `**fett**`, `*kursiv*`, `~~gestrichen~~` ab Position `start`. */
function matchEmphasis(
  source: string,
  start: number,
  depth: number,
): { node: Inline; end: number } | null {
  for (const { marker, kind } of MARKERS) {
    if (!source.startsWith(marker, start)) continue;
    // `_` nur an Wortgrenzen, damit `snake_case_namen` heil bleiben.
    if (marker.startsWith("_") && isWordChar(source[start - 1])) continue;

    const from = start + marker.length;
    let close = source.indexOf(marker, from);
    while (close !== -1) {
      const after = source[close + marker.length];
      if (marker.startsWith("_") && isWordChar(after)) {
        close = source.indexOf(marker, close + marker.length);
        continue;
      }
      break;
    }
    if (close === -1 || close === from) continue;

    const inner = source.slice(from, close);
    // Kein Umbruch quer durch eine Betonung: ein einzelnes `*` am Zeilenanfang
    // wuerde sonst den halben Text kursiv setzen.
    if (inner.includes("\n")) continue;

    const children = parseInlines(inner, depth + 1);
    return {
      // `***x***` ist beides: fett und kursiv. Nur `strong` zu nehmen liesse
      // die Kursivschrift still verschwinden.
      node:
        marker === "***"
          ? { kind: "strong", children: [{ kind: "em", children }] }
          : { kind, children },
      end: close + marker.length,
    };
  }
  return null;
}
