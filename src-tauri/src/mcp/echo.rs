//! Der abgelehnte Wert in einer Fehlermeldung.
//!
//! Fast jede Absage zitiert das, was der Aufrufer geschickt hat -- das ist der
//! Unterschied zwischen "Datum ungueltig" und einer Meldung, aus der er sieht,
//! wo der Tippfehler steckt. Ungebremst ist genau das aber ein Verstaerker:
//! die Anfrage darf 4 MiB gross sein, und ein 4 MiB langes `due_before` kaeme
//! als 4 MiB lange Fehlermeldung zurueck ins Kontextfenster des Modells.
//!
//! Darum geht jeder zitierte Wert durch `quoted`. Eine Laengengrenze am Eingang
//! je Feld waere die Alternative gewesen; gekappt wird aber lieber an der einen
//! Stelle, an der zitiert wird, als an jedem Feld einzeln -- so kann ein neues
//! Feld die Regel nicht vergessen.

/// Hoechstlaenge eines zitierten Werts, in Zeichen (nicht Bytes -- sonst haette
/// ein deutscher Text nur die halbe Laenge).
///
/// Bewusst oberhalb des laengsten Werts, den ein Tool ueberhaupt annimmt und
/// wieder zitiert: das ist mit `MAX_CATEGORY_CHARS` ein Kategoriename mit 100
/// Zeichen. Ein Wert, der eine echte Absicht ausdrueckt -- ein Datum, eine
/// Uhrzeit, ein Status, ein Kategoriename -- kommt also immer ungekuerzt
/// zurueck; gekuerzt wird nur, was ohnehin kein sinnvoller Wert mehr ist.
pub const MAX_ECHO_CHARS: usize = 120;

/// Zitiert einen vom Aufrufer geschickten Wert fuer eine Fehlermeldung.
///
/// Ergibt `"wert"`, und fuer einen zu langen Wert `"anfang…" (gekuerzt)`. Der
/// Zusatz steht dabei ausserhalb der Anfuehrungszeichen und ist ausgeschrieben:
/// ein blosses Auslassungszeichen koennte auch Teil der Eingabe gewesen sein,
/// und dann suchte der Aufrufer den Fehler in einem Wert, den er nie geschickt
/// hat.
pub fn quoted(value: &str) -> String {
    let mut shortened: String = value.chars().take(MAX_ECHO_CHARS).collect();
    if value.chars().nth(MAX_ECHO_CHARS).is_none() {
        return format!("\"{shortened}\"");
    }
    shortened.push('…');
    format!("\"{shortened}\" (gekuerzt)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_a_short_value_unchanged() {
        assert_eq!(quoted("2026-02-30"), "\"2026-02-30\"");
        assert_eq!(quoted(""), "\"\"");
    }

    /// Ein Kategoriename darf 100 Zeichen lang sein und muss darum vollstaendig
    /// zurueckkommen -- sonst kaeme der Aufrufer nicht darauf, dass er ihn nur
    /// falsch geschrieben hat.
    #[test]
    fn a_value_of_the_longest_legal_length_is_not_shortened() {
        let name = "ä".repeat(100);
        assert_eq!(quoted(&name), format!("\"{name}\""));
    }

    #[test]
    fn shortens_an_over_long_value_and_says_so() {
        let value = "x".repeat(1_000_000);
        let message = quoted(&value);

        assert!(message.chars().count() < MAX_ECHO_CHARS + 40);
        assert!(message.contains("gekuerzt"), "got: {message}");
        assert!(message.starts_with("\"xxxx"));
    }

    /// Gezaehlt werden Zeichen. Wuerde nach Bytes geschnitten, koennte der
    /// Schnitt mitten in einem Mehrbytezeichen landen.
    #[test]
    fn counts_characters_not_bytes() {
        let value = "ü".repeat(MAX_ECHO_CHARS + 1);
        let message = quoted(&value);

        assert!(message.contains("gekuerzt"));
        assert_eq!(message.matches('ü').count(), MAX_ECHO_CHARS);
    }
}
