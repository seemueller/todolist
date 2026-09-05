//! Umrechnung zwischen `HH:MM` und dem Viertelstunden-Index eines Tages.
//!
//! Spiegelt `timeToSlot` und `slotToLabel` aus `src/timeSlots.ts`: ein Slot ist
//! eine Viertelstunde seit Mitternacht, also `slot = hour * 4 + minute / 15`,
//! und 09:00 ist Slot 36.
//!
//! Ein Unterschied zum Frontend ist Absicht und liegt eine Ebene hoeher:
//! `timeToSlot` bekommt bereits geprueft Zahlen und rundet mit `Math.floor`
//! stillschweigend ab. Hier kommt ein vom Modell frei getippter String an, und
//! eine stillschweigend verschobene Buchung waere schlimmer als eine Absage --
//! darum wird "09:07" abgelehnt statt auf 09:00 gerundet. Die Arithmetik selbst
//! ist identisch.
//!
//! Fehlertexte gehen ueber MCP direkt an den Leser und sind darum deutsch.

use super::echo::quoted;

/// Minuten je Slot; `SLOT_MINUTES` in `src/timeSlots.ts`.
pub const SLOT_MINUTES: i64 = 15;
/// Slots je Stunde; `SLOTS_PER_HOUR` in `src/timeSlots.ts`.
pub const SLOTS_PER_HOUR: i64 = 60 / SLOT_MINUTES;
/// Slots eines vollen Tages; `SLOTS_PER_DAY` in `src/timeSlots.ts`.
pub const SLOTS_PER_DAY: i64 = 24 * SLOTS_PER_HOUR;

/// Zwei ASCII-Ziffern zu einer Zahl. Bewusst eng: "9" oder "+9" sind keine
/// Uhrzeit, und `str::parse` wuerde beides durchlassen.
fn two_digits(part: &str) -> Option<i64> {
    if part.len() != 2 || !part.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    part.parse::<i64>().ok()
}

/// Die erlaubten Minuten als "00, 15, 30 oder 45".
///
/// Abgeleitet aus `SLOT_MINUTES` statt hingeschrieben, damit Meldung und
/// Rechnung nicht auseinanderlaufen koennen.
fn quarter_minutes() -> String {
    let mut minutes: Vec<String> = Vec::new();
    let mut minute = 0;
    while minute < 60 {
        minutes.push(format!("{minute:02}"));
        minute += SLOT_MINUTES;
    }
    match minutes.split_last() {
        Some((last, rest)) if !rest.is_empty() => format!("{} oder {last}", rest.join(", ")),
        _ => minutes.join(", "),
    }
}

/// Slot-Index fuer eine Uhrzeit `HH:MM`.
///
/// Akzeptiert ausschliesslich zwei zweistellige, durch genau einen Doppelpunkt
/// getrennte Zahlen, mit Stunde 0-23, Minute 0-59 und einer Minute auf einer
/// vollen Viertelstunde.
pub fn parse_slot(time: &str) -> Result<i64, String> {
    let Some((hours, minutes)) = time.split_once(':') else {
        return Err(format!(
            "{} ist keine Uhrzeit im Format HH:MM",
            quoted(time)
        ));
    };
    let (Some(hour), Some(minute)) = (two_digits(hours), two_digits(minutes)) else {
        return Err(format!(
            "{} ist keine Uhrzeit im Format HH:MM",
            quoted(time)
        ));
    };
    if hour > 23 {
        return Err(format!("{} liegt nicht innerhalb eines Tages", quoted(time)));
    }
    if minute > 59 {
        return Err(format!("{} hat keine gueltige Minute", quoted(time)));
    }
    if minute % SLOT_MINUTES != 0 {
        // Die vier Minuten stehen zwar in der Feldbeschreibung -- aber diese
        // Meldung ist genau das, was der Aufrufer sieht, wenn ihm die
        // Beschreibung nicht geholfen hat. Sie hier zu wiederholen ist der
        // Unterschied zwischen einem naechsten Versuch und einer Schleife aus
        // geratenen Uhrzeiten.
        return Err(format!(
            "{} liegt nicht auf einer Viertelstunde; die Minute muss {} sein.",
            quoted(time),
            quarter_minutes()
        ));
    }
    Ok(hour * SLOTS_PER_HOUR + minute / SLOT_MINUTES)
}

/// "09:00" fuer den Slot-Index 36.
///
/// 96 ist erlaubt und ergibt "24:00": das Ende eines Blocks ist ausschliesslich,
/// eine Buchung bis Mitternacht endet also bei Slot 96. Ausserhalb von 0..=96
/// wird geklemmt, damit die Funktion niemals panickt -- so ein Wert entsteht nur
/// aus einem Fehler weiter oben, und ein stiller Rueckgabewert ist dort immer
/// noch besser als ein Tool, das gar nicht antwortet.
pub fn slot_label(slot: i64) -> String {
    let slot = slot.clamp(0, SLOTS_PER_DAY);
    let hour = slot / SLOTS_PER_HOUR;
    let minute = (slot % SLOTS_PER_HOUR) * SLOT_MINUTES;
    format!("{hour:02}:{minute:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_a_time_to_a_slot_index() {
        assert_eq!(parse_slot("00:00"), Ok(0));
        assert_eq!(parse_slot("09:00"), Ok(36));
        assert_eq!(parse_slot("09:15"), Ok(37));
        assert_eq!(parse_slot("23:45"), Ok(95));
    }

    #[test]
    fn rejects_times_that_are_not_on_a_quarter_hour() {
        assert!(parse_slot("09:07").is_err());
    }

    /// Die Absage ist das, was der Aufrufer sieht, wenn die Feldbeschreibung
    /// ihm nicht geholfen hat. Sie muss die vier Minuten nennen, sonst
    /// probiert er es mit der naechsten geratenen Uhrzeit noch einmal.
    #[test]
    fn the_quarter_hour_error_names_the_four_valid_minutes() {
        let message = parse_slot("09:07").expect_err("09:07 is not a quarter hour");
        for minute in ["00", "15", "30", "45"] {
            assert!(
                message.contains(minute),
                "the message should name {minute}, got: {message}"
            );
        }
    }

    #[test]
    fn rejects_malformed_and_out_of_range_times() {
        for bad in ["", "9:00", "09", "09:60", "24:00", "aa:bb", "-1:00"] {
            assert!(parse_slot(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn renders_a_slot_back_to_a_time() {
        assert_eq!(slot_label(36), "09:00");
        assert_eq!(slot_label(95), "23:45");
    }

    #[test]
    fn the_exclusive_end_of_a_full_day_is_24_00() {
        assert_eq!(slot_label(SLOTS_PER_DAY), "24:00");
    }

    #[test]
    fn a_nonsensical_slot_is_clamped_instead_of_panicking() {
        assert_eq!(slot_label(-1), "00:00");
        assert_eq!(slot_label(i64::MIN), "00:00");
        assert_eq!(slot_label(i64::MAX), "24:00");
    }

    /// Die Arithmetik muss dieselbe sein wie in `timeToSlot`.
    #[test]
    fn every_quarter_hour_of_the_day_round_trips() {
        for slot in 0..SLOTS_PER_DAY {
            assert_eq!(parse_slot(&slot_label(slot)), Ok(slot));
        }
    }

    /// Die Uhrzeit kommt als freier String vom Modell und wird in jeder Absage
    /// zitiert. Ein megabytelanges "from" darf daraus keine megabytelange
    /// Meldung machen -- die vier Minuten muss sie trotzdem noch nennen.
    #[test]
    fn an_over_long_time_is_shortened_but_still_explained() {
        let message = parse_slot(&"1".repeat(200_000)).expect_err("not a time");

        assert!(
            message.chars().count() < 400,
            "got {} chars",
            message.chars().count()
        );
        assert!(message.contains("gekuerzt"), "got: {message}");
        assert!(message.contains("HH:MM"), "got: {message}");
    }
}
