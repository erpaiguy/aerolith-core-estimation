use std::path::{Path, PathBuf};

#[tauri::command]
fn write_aero(path: String, data: Vec<u8>) -> Result<String, String> {
    let path = resolve_aero_path(&path)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let tmp = path.with_extension("aero.tmp");
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    if path.exists() {
        let bak = path.with_extension("aero.bak");
        let _ = std::fs::remove_file(&bak);
        std::fs::rename(&path, &bak).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| {
            let _ = std::fs::rename(&bak, &path);
            e.to_string()
        })?;
        let _ = std::fs::remove_file(&bak);
    } else {
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    }
    if !path.is_file() {
        return Err(format!("Save finished but the file was not found at {}", path.display()));
    }
    Ok(display_path(&path))
}

#[tauri::command]
fn read_aero(path: String) -> Result<Vec<u8>, String> {
    let path = resolve_aero_path(&path)?;
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn default_projects_dir(tenant_id: Option<String>) -> Result<String, String> {
    let dir = projects_dir(tenant_id.as_deref())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(display_path(&dir))
}

fn aerolith_root() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not find the user profile folder".to_string())?;
    Ok(Path::new(&home).join("Documents").join("Aerolith"))
}

fn sanitize_tenant_id(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() || trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\')
    {
        return Err("Invalid tenant id".into());
    }
    let safe: String = trimmed
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if safe.is_empty() {
        return Err("Invalid tenant id".into());
    }
    Ok(safe)
}

fn projects_dir(tenant_id: Option<&str>) -> Result<PathBuf, String> {
    let root = aerolith_root()?;
    match tenant_id {
        Some(id) if !id.trim().is_empty() => {
            let safe = sanitize_tenant_id(id)?;
            Ok(root.join("Tenants").join(safe).join("Projects"))
        }
        _ => Ok(root.join("Projects")),
    }
}

fn masters_dir(tenant_id: &str) -> Result<PathBuf, String> {
    let safe = sanitize_tenant_id(tenant_id)?;
    Ok(aerolith_root()?.join("Tenants").join(safe).join("Masters"))
}

#[tauri::command]
fn write_tenant_catalog(tenant_id: String, json: String) -> Result<String, String> {
    if json.len() > 8_000_000 {
        return Err("Catalog is too large to save".into());
    }
    let dir = masters_dir(&tenant_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("catalog.json");
    std::fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(display_path(&path))
}

#[tauri::command]
fn read_tenant_catalog(tenant_id: String) -> Result<Option<String>, String> {
    let path = masters_dir(&tenant_id)?.join("catalog.json");
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

fn with_aero_ext(path: &Path) -> PathBuf {
    if path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("aero"))
    {
        path.to_path_buf()
    } else {
        let mut s = path.as_os_str().to_os_string();
        s.push(".aero");
        PathBuf::from(s)
    }
}

fn resolve_aero_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err("No save path was chosen".into());
    }
    let chosen = PathBuf::from(trimmed);
    let path = if chosen.is_absolute() {
        with_aero_ext(&chosen)
    } else {
        projects_dir(None)?.join(with_aero_ext(&chosen))
    };
    Ok(path)
}

fn display_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_aero,
            read_aero,
            default_projects_dir,
            write_tenant_catalog,
            read_tenant_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aerolith Core");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_aero() -> String {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("aerolith-core-{n}.aero"))
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn rejects_empty_path() {
        assert!(write_aero("".into(), b"x".to_vec()).is_err());
    }

    #[test]
    fn appends_aero_extension() {
        let dir = std::env::temp_dir();
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let stem = dir.join(format!("aerolith-core-{n}"));
        let written = write_aero(stem.to_string_lossy().into_owned(), b"aerolith-sqlite".to_vec())
            .unwrap();
        assert!(written.to_lowercase().ends_with(".aero"));
        assert_eq!(std::fs::read(&written).unwrap(), b"aerolith-sqlite");
        let _ = std::fs::remove_file(written);
    }

    #[test]
    fn writes_and_reads_aero_bytes() {
        let path = temp_aero();
        let written = write_aero(path.clone(), b"aerolith-sqlite".to_vec()).unwrap();
        let back = read_aero(written.clone()).unwrap();
        assert_eq!(back, b"aerolith-sqlite");
        let _ = std::fs::remove_file(written);
    }

    #[test]
    fn default_projects_dir_exists() {
        let dir = default_projects_dir(None).unwrap();
        assert!(dir.ends_with("Aerolith\\Projects") || dir.ends_with("Aerolith/Projects"));
        assert!(std::path::Path::new(&dir).is_dir());
    }

    #[test]
    fn tenant_projects_dir_is_shared_workspace() {
        let dir = default_projects_dir(Some("t-demo".into())).unwrap();
        assert!(dir.contains("Tenants"));
        assert!(dir.contains("t-demo"));
        assert!(dir.ends_with("Projects") || dir.ends_with("Projects\\") || dir.ends_with("Projects/"));
        assert!(std::path::Path::new(&dir).is_dir());
    }

    #[test]
    fn tenant_id_rejects_path_escape() {
        assert!(default_projects_dir(Some("../evil".into())).is_err());
    }

    #[test]
    fn writes_and_reads_tenant_catalog() {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let id = format!("t-test-{n}");
        let json = r#"{"version":2,"units":[],"categories":[],"vendors":[]}"#;
        let path = write_tenant_catalog(id.clone(), json.into()).unwrap();
        assert!(path.contains("Masters"));
        assert!(path.to_lowercase().ends_with("catalog.json"));
        let back = read_tenant_catalog(id.clone()).unwrap().unwrap();
        assert!(back.contains("\"version\":2"));
        let _ = std::fs::remove_file(path);
    }
}
