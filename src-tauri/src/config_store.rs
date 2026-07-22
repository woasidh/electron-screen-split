use crate::model::AppConfig;
use atomic_write_file::AtomicWriteFile;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct ConfigStore {
    target: PathBuf,
    legacy_candidates: Vec<PathBuf>,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub config: AppConfig,
    pub warning: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigStoreError {
    #[error("configuration I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("configuration serialization failed: {0}")]
    Serialize(#[from] serde_json::Error),
}

impl ConfigStore {
    pub fn new(target: PathBuf, legacy_candidates: Vec<PathBuf>) -> Self {
        Self {
            target,
            legacy_candidates,
        }
    }

    pub fn load(&self) -> LoadResult {
        if self.target.exists() {
            return self.load_path(&self.target);
        }

        let mut migration_warning = None;
        for candidate in &self.legacy_candidates {
            if !candidate.is_file() {
                continue;
            }

            let loaded = self.load_path(candidate);
            if loaded.warning.is_none() {
                if let Err(error) = self.save(&loaded.config) {
                    return LoadResult {
                        config: loaded.config,
                        warning: Some(format!("기존 설정을 이전하지 못했습니다: {error}")),
                    };
                }
                return loaded;
            }
            migration_warning = loaded.warning;
        }

        LoadResult {
            config: AppConfig::default(),
            warning: migration_warning,
        }
    }

    pub fn save(&self, config: &AppConfig) -> Result<AppConfig, ConfigStoreError> {
        let normalized = config.normalized();
        let parent = self.target.parent().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "configuration path has no parent",
            )
        })?;
        fs::create_dir_all(parent)?;

        let mut file = AtomicWriteFile::open(&self.target)?;
        serde_json::to_writer_pretty(&mut file, &normalized)?;
        file.write_all(b"\n")?;
        file.as_file().sync_all()?;
        file.commit()?;
        Ok(normalized)
    }

    fn load_path(&self, path: &std::path::Path) -> LoadResult {
        match fs::read(path)
            .map_err(|error| error.to_string())
            .and_then(|bytes| {
                serde_json::from_slice::<AppConfig>(&bytes).map_err(|error| error.to_string())
            }) {
            Ok(config) => LoadResult {
                config: config.normalized(),
                warning: None,
            },
            Err(error) => LoadResult {
                config: AppConfig::default(),
                warning: Some(format!(
                    "설정 파일을 읽지 못해 기본값을 사용합니다: {error}"
                )),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn write_config(path: &Path, zoom: f64) {
        let mut config = AppConfig::default();
        config.slots[0].zoom = zoom;
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, serde_json::to_vec(&config).unwrap()).unwrap();
    }

    #[test]
    fn saves_and_reloads_normalized_config_atomically() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("new/config.json");
        let store = ConfigStore::new(target.clone(), vec![]);
        let mut config = AppConfig::default();
        config.slots[2].zoom = 1.25;

        store.save(&config).unwrap();

        assert_eq!(store.load().config.slots[2].zoom, 1.25);
        assert!(!target.with_extension("json.tmp").exists());
    }

    #[test]
    fn migrates_legacy_once_without_deleting_source() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = temp.path().join("legacy/config.json");
        let target = temp.path().join("new/config.json");
        write_config(&legacy, 1.4);
        let store = ConfigStore::new(target.clone(), vec![legacy.clone()]);

        assert_eq!(store.load().config.slots[0].zoom, 1.4);
        assert!(legacy.exists());
        assert!(target.exists());

        write_config(&legacy, 0.6);
        assert_eq!(store.load().config.slots[0].zoom, 1.4);
    }

    #[test]
    fn malformed_config_returns_default_with_warning() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("new/config.json");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, b"not json").unwrap();

        let result = ConfigStore::new(target, vec![]).load();

        assert_eq!(result.config, AppConfig::default());
        assert!(result.warning.is_some());
    }
}
