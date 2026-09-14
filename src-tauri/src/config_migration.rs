//! Einmalige Uebernahme des App-Verzeichnisses aus der Zeit vor der Umbenennung
//! von `com.roomote.todolist` auf `com.seemueller.todolist`. Tauri leitet
//! `app_config_dir()` direkt aus dem Bundle-Identifier ab, darum zeigt eine
//! bereits installierte Instanz nach dem Update auf ein leeres Verzeichnis und
//! wuerde eine frische, leere Datenbank anlegen.

use std::fs;
use std::io;
use std::path::Path;

/// Bundle-Identifier vor der Umbenennung. Tauri haengt ihn an
/// `dirs::config_dir()`, das Ergebnis ist der Pfad, unter dem produktive
/// Instanzen ihre Datenbank liegen haben.
const LEGACY_IDENTIFIER: &str = "com.roomote.todolist";
const CURRENT_IDENTIFIER: &str = "com.seemueller.todolist";
const DB_FILE: &str = "todolist.db";

/// Kopiert die Datenbank der Alt-Installation in das neue Config-Verzeichnis,
/// falls dort noch keine liegt. Kopie statt Verschieben: ein Rollback auf eine
/// aeltere Version findet seine Daten sonst nicht mehr, und ein auf halber
/// Strecke abgebrochenes Verschieben koennte sie ganz verlieren.
///
/// Gibt `true` zurueck, wenn tatsaechlich uebernommen wurde.
fn migrate_legacy_config_dir(old: &Path, new: &Path) -> io::Result<bool> {
    if !old.join(DB_FILE).is_file() || new.join(DB_FILE).exists() {
        return Ok(false);
    }

    fs::create_dir_all(new)?;
    for entry in fs::read_dir(old)? {
        let entry = entry?;
        let name = entry.file_name();
        // `-shm` beschreibt den Zustand eines laufenden Prozesses und wird aus
        // dem `-wal` neu aufgebaut; eine mitkopierte Fassung waere veraltet.
        if name.to_string_lossy().ends_with("-shm") {
            continue;
        }
        if entry.file_type()?.is_file() {
            fs::copy(entry.path(), new.join(&name))?;
        }
    }

    Ok(true)
}

/// Fuehrt die Uebernahme auf den echten Config-Verzeichnissen dieses Systems
/// aus. Muss vor dem ersten `Database.load` des Frontends laufen, sonst legt
/// tauri-plugin-sql bereits eine leere Datenbank an und die Uebernahme greift
/// nicht mehr.
pub fn migrate_legacy_config_dir_in_place() {
    let Some(base) = dirs::config_dir() else {
        return;
    };
    let old = base.join(LEGACY_IDENTIFIER);
    let new = base.join(CURRENT_IDENTIFIER);

    match migrate_legacy_config_dir(&old, &new) {
        Ok(true) => eprintln!(
            "config: Datenbank aus {} uebernommen",
            old.display()
        ),
        Ok(false) => {}
        Err(err) => eprintln!(
            "config: Uebernahme aus {} fehlgeschlagen: {err}",
            old.display()
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    fn write(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent dir");
        }
        let mut f = File::create(path).expect("create file");
        f.write_all(content.as_bytes()).expect("write file");
    }

    #[test]
    fn uebernimmt_datenbank_aus_altem_verzeichnis() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let old = tmp.path().join("com.roomote.todolist");
        let new = tmp.path().join("com.seemueller.todolist");
        write(&old.join("todolist.db"), "alte-daten");

        let migrated = migrate_legacy_config_dir(&old, &new).expect("migration");

        assert!(migrated, "Migration muss stattgefunden haben");
        assert_eq!(
            fs::read_to_string(new.join("todolist.db")).expect("neue db"),
            "alte-daten"
        );
    }

    #[test]
    fn laesst_altes_verzeichnis_unangetastet() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let old = tmp.path().join("com.roomote.todolist");
        let new = tmp.path().join("com.seemueller.todolist");
        write(&old.join("todolist.db"), "alte-daten");

        migrate_legacy_config_dir(&old, &new).expect("migration");

        assert!(
            old.join("todolist.db").exists(),
            "Kopie statt Verschieben: ein Rollback auf die alte Version muss \
             die Daten noch finden"
        );
    }

    #[test]
    fn nimmt_das_write_ahead_log_mit() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let old = tmp.path().join("com.roomote.todolist");
        let new = tmp.path().join("com.seemueller.todolist");
        write(&old.join("todolist.db"), "alte-daten");
        write(&old.join("todolist.db-wal"), "nicht-eingecheckte-commits");

        migrate_legacy_config_dir(&old, &new).expect("migration");

        assert_eq!(
            fs::read_to_string(new.join("todolist.db-wal")).expect("neues wal"),
            "nicht-eingecheckte-commits"
        );
    }

    #[test]
    fn laesst_das_shared_memory_file_liegen() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let old = tmp.path().join("com.roomote.todolist");
        let new = tmp.path().join("com.seemueller.todolist");
        write(&old.join("todolist.db"), "alte-daten");
        write(&old.join("todolist.db-shm"), "veralteter-index");

        migrate_legacy_config_dir(&old, &new).expect("migration");

        assert!(
            !new.join("todolist.db-shm").exists(),
            "-shm gehoert zum laufenden Prozess und wird aus dem -wal neu \
             aufgebaut; mitkopiert waere es nur ein veralteter Index"
        );
    }

    #[test]
    fn ruehrt_eine_bestehende_neue_datenbank_nicht_an() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let old = tmp.path().join("com.roomote.todolist");
        let new = tmp.path().join("com.seemueller.todolist");
        write(&old.join("todolist.db"), "alte-daten");
        write(&new.join("todolist.db"), "bereits-benutzt");

        let migrated = migrate_legacy_config_dir(&old, &new).expect("migration");

        assert!(!migrated, "bestehende Daten duerfen nicht ueberschrieben werden");
        assert_eq!(
            fs::read_to_string(new.join("todolist.db")).expect("neue db"),
            "bereits-benutzt"
        );
    }

    #[test]
    fn tut_nichts_ohne_altes_verzeichnis() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let old = tmp.path().join("com.roomote.todolist");
        let new = tmp.path().join("com.seemueller.todolist");

        let migrated = migrate_legacy_config_dir(&old, &new).expect("migration");

        assert!(!migrated);
        assert!(!new.exists(), "eine Neuinstallation legt das Verzeichnis selbst an");
    }
}
