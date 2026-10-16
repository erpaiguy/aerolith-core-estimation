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

fn user_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err("No file was chosen".into());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Choose a full path".into());
    }
    Ok(path)
}

const MAX_USER_BYTES: usize = 64 * 1024 * 1024;

fn limit_len(len: usize) -> Result<(), String> {
    if len > MAX_USER_BYTES {
        return Err("File is too large to write".into());
    }
    Ok(())
}

/// PowerShell reads the path from the environment, so a name cannot be reparsed as a command.
#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn literal_powershell(script: &str, path: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        script,
    ]);
    cmd.env("BIDCRAFT_PATH", path);
    cmd
}

fn safe_pdf_name(name: &str) -> Result<String, String> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim();
    let without = base
        .strip_suffix(".pdf")
        .or_else(|| base.strip_suffix(".PDF"))
        .unwrap_or(base);
    let stem: String = without
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if stem.is_empty() {
        return Err("PDF name was rejected".into());
    }
    Ok(format!("{stem}.pdf"))
}

fn approved_https(url: &str) -> Result<String, String> {
    let url = url.trim();
    if url.len() > 2048 {
        return Err("Link is too long".into());
    }
    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| "Only https links can be opened".to_string())?;
    if rest.chars().any(|c| {
        c.is_whitespace()
            || c.is_control()
            || matches!(c, '"' | '\'' | '`' | '&' | '|' | ';' | '\\' | '<' | '>')
    }) {
        return Err("Link was rejected".into());
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains('@') || host.contains(':') {
        return Err("Link was rejected".into());
    }
    let host = host.to_ascii_lowercase();
    if host != "www.theaerolithcore.com" && host != "theaerolithcore.com" {
        return Err("That site is not opened from Bid Craft".into());
    }
    Ok(url.to_string())
}

#[tauri::command]
fn write_user_file(path: String, data: Vec<u8>) -> Result<String, String> {
    limit_len(data.len())?;
    let path = user_path(&path)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(display_path(&path))
}

#[tauri::command]
fn write_temp_pdf(name: String, data: Vec<u8>) -> Result<String, String> {
    limit_len(data.len())?;
    let file = std::env::temp_dir().join(safe_pdf_name(&name)?);
    std::fs::write(&file, data).map_err(|e| e.to_string())?;
    Ok(display_path(&file))
}

#[tauri::command]
fn open_https(url: String) -> Result<(), String> {
    let url = approved_https(&url)?;
    spawn_detached(&mut open_command(&url))
}

#[tauri::command]
fn open_user_file(path: String) -> Result<(), String> {
    let path = user_path(&path)?;
    spawn_detached(&mut open_command(path.to_string_lossy().as_ref()))
}

#[tauri::command]
fn print_user_file(path: String) -> Result<(), String> {
    let path = user_path(&path)?;
    let text = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        return spawn_detached(&mut literal_powershell(
            "Start-Process -LiteralPath $env:BIDCRAFT_PATH -Verb Print",
            &text,
        ));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = text;
        Err("System print from a saved PDF is used on Windows. Print opens the dialog directly.".into())
    }
}

fn open_command(path: &str) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        return literal_powershell("Start-Process -LiteralPath $env:BIDCRAFT_PATH", path);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(path);
        cmd
    }
}

fn spawn_detached(cmd: &mut std::process::Command) -> Result<(), String> {
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            write_aero,
            read_aero,
            default_projects_dir,
            write_tenant_catalog,
            read_tenant_catalog,
            write_user_file,
            write_temp_pdf,
            open_user_file,
            print_user_file,
            open_https
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bid Craft");
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
    fn pdf_name_cannot_escape_the_temp_directory() {
        assert!(safe_pdf_name("..").is_err());
        assert!(safe_pdf_name("../secret").is_err() || safe_pdf_name("../secret").unwrap() == "secret.pdf");
        assert_eq!(safe_pdf_name(r"..\..\windows\system.ini").unwrap(), "systemini.pdf");
        let name = safe_pdf_name("offer.pdf").unwrap();
        assert_eq!(name, "offer.pdf");
        assert!(!name.contains(".."));
    }

    #[test]
    fn powershell_keeps_the_path_out_of_the_command_line() {
        let path = r"C:\bids\a & calc.exe.pdf";
        let cmd = literal_powershell("Start-Process -LiteralPath $env:BIDCRAFT_PATH", path);
        let args: Vec<String> = cmd.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert!(args.iter().all(|arg| !arg.contains(path) && !arg.contains('&')));
        let env = cmd
            .get_envs()
            .find(|(key, _)| key == "BIDCRAFT_PATH")
            .and_then(|(_, value)| value)
            .map(|value| value.to_string_lossy().into_owned());
        assert_eq!(env.as_deref(), Some(path));
    }

    #[test]
    fn https_links_stay_on_the_publisher_site() {
        assert!(approved_https("https://www.theaerolithcore.com/account").is_ok());
        assert!(approved_https("https://theaerolithcore.com/pricing").is_ok());
        assert!(approved_https("http://www.theaerolithcore.com").is_err());
        assert!(approved_https("https://evil.example/account").is_err());
        assert!(approved_https("https://www.theaerolithcore.com/account?x=1&y=2").is_err());
        assert!(approved_https("https://user@www.theaerolithcore.com").is_err());
    }

    #[test]
    fn user_file_rejects_an_oversized_payload() {
        assert!(limit_len(MAX_USER_BYTES).is_ok());
        assert!(limit_len(MAX_USER_BYTES + 1).is_err());
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
