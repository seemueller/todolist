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

// Wird erst von den Tools in Task 3 benutzt.
#![allow(dead_code)]

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

/// Slot-Index fuer eine Uhrzeit `HH:MM`.
///
/// Akzeptiert ausschliesslich zwei zweistellige, durch genau einen Doppelpunkt
/// getrennte Zahlen, mit Stunde 0-23, Minute 0-59 und einer Minute auf einer
/// vollen Viertelstunde.
pub fn parse_slot(time: &str) -> Result<i64, String> {
    let Some((hours, minutes)) = time.split_once(':') else {
        return Err(format!("\"{time}\" ist keine Uhrzeit im Format HH:MM"));
    };
    let (Some(hour), Some(minute)) = (two_digits(hours), two_digits(minutes)) else {
        return Err(format!("\"{time}\" ist keine Uhrzeit im Format HH:MM"));
    };
    if hour > 23 {
        return Err(format!("{time} liegt nicht innerhalb eines Tages"));
    }
    if minute > 59 {
        return Err(format!("{time} hat keine gueltige Minute"));
    }
    if minute % SLOT_MINUTES != 0 {
        return Err(format!("{time} liegt nicht auf einer Viertelstunde"));
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
}
