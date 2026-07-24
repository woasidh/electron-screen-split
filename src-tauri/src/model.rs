use url::Url;

pub const SLOT_COUNT: usize = 4;
pub const CONFIG_VERSION: u8 = 1;

const DEFAULT_URLS: [&str; SLOT_COUNT] = [
    "https://robot.delisys.net",
    "https://m.site.naver.com/1JYMi",
    "https://robot.delisys.net",
    "https://secon.robotics-lab.net",
];

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlotConfig {
    pub enabled: bool,
    pub url: String,
    pub zoom: f64,
    #[serde(default)]
    pub login_extension: bool,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u8,
    pub slots: Vec<SlotConfig>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            slots: DEFAULT_URLS
                .iter()
                .map(|url| SlotConfig {
                    enabled: true,
                    url: (*url).to_owned(),
                    zoom: 1.0,
                    login_extension: false,
                })
                .collect(),
        }
    }
}

impl AppConfig {
    pub fn normalize(slots: Vec<SlotConfig>) -> Self {
        let defaults = Self::default();
        let slots = (0..SLOT_COUNT)
            .map(|index| {
                let fallback = &defaults.slots[index];
                let source = slots.get(index).unwrap_or(fallback);
                SlotConfig {
                    enabled: source.enabled,
                    url: source.url.trim().chars().take(2048).collect(),
                    zoom: normalize_zoom(source.zoom),
                    login_extension: source.login_extension,
                }
            })
            .collect();

        Self {
            version: CONFIG_VERSION,
            slots,
        }
    }

    pub fn normalized(&self) -> Self {
        Self::normalize(self.slots.clone())
    }

    pub fn issues(&self) -> Vec<String> {
        self.normalized()
            .slots
            .iter()
            .enumerate()
            .filter(|(_, slot)| slot.enabled && !is_safe_remote_url(&slot.url))
            .map(|(index, _)| format!("화면 {}의 URL을 확인해 주세요.", index + 1))
            .collect()
    }
}

fn normalize_zoom(zoom: f64) -> f64 {
    if !zoom.is_finite() {
        return 1.0;
    }

    (zoom.clamp(0.1, 2.0) * 100.0).round() / 100.0
}

pub fn is_safe_remote_url(value: &str) -> bool {
    Url::parse(value)
        .map(|url| matches!(url.scheme(), "http" | "https"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_produces_four_slots_and_clamps_zoom() {
        let config = AppConfig::normalize(vec![SlotConfig {
            enabled: true,
            url: " https://example.com ".into(),
            zoom: 9.0,
            login_extension: true,
        }]);

        assert_eq!(config.slots.len(), 4);
        assert_eq!(config.slots[0].url, "https://example.com");
        assert_eq!(config.slots[0].zoom, 2.0);
        assert!(config.slots[0].login_extension);
    }

    #[test]
    fn normalize_clamps_zoom_to_supported_range() {
        let slots = [9.0, -9.0]
            .into_iter()
            .map(|zoom| SlotConfig {
                enabled: true,
                url: "https://example.com".into(),
                zoom,
                login_extension: false,
            })
            .collect();

        let config = AppConfig::normalize(slots);

        assert_eq!(config.slots[0].zoom, 2.0);
        assert_eq!(config.slots[1].zoom, 0.1);
    }

    #[test]
    fn enabled_slots_require_http_or_https() {
        let mut config = AppConfig::default();
        config.slots[0].url = "file:///etc/passwd".into();

        assert_eq!(config.issues(), vec!["화면 1의 URL을 확인해 주세요."]);
    }
}
