const fs = require("node:fs");
const path = require("node:path");

const { SLOT_COUNT } = require("./layout");

const DEFAULT_URLS = [
  "https://robot.delisys.net",
  "https://m.site.naver.com/1JYMi",
  "https://robot.delisys.net",
  "https://secon.robotics-lab.net",
];

function getDefaultConfig() {
  return {
    version: 1,
    slots: DEFAULT_URLS.map((url) => ({
      enabled: true,
      url,
      zoom: 1,
    })),
  };
}

function clampZoom(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.round(Math.min(1.5, Math.max(0.5, numericValue)) * 100) / 100;
}

function normalizeSlot(input, fallback) {
  const source = input && typeof input === "object" ? input : fallback;
  return {
    enabled: source.enabled !== false,
    url: typeof source.url === "string" ? source.url.trim().slice(0, 2048) : fallback.url,
    zoom: clampZoom(source.zoom),
  };
}

function normalizeConfig(input) {
  const fallback = getDefaultConfig();
  const sourceSlots = Array.isArray(input?.slots) ? input.slots : [];
  const slots = Array.from({ length: SLOT_COUNT }, (_, index) =>
    normalizeSlot(sourceSlots[index], fallback.slots[index]),
  );

  return { version: 1, slots };
}

function isSafeRemoteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getConfigIssues(config) {
  return normalizeConfig(config).slots.flatMap((slot, index) => {
    if (!slot.enabled || isSafeRemoteUrl(slot.url)) return [];
    return [{ index, message: `화면 ${index + 1}의 URL을 확인해 주세요.` }];
  });
}

class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.config = getDefaultConfig();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.config = normalizeConfig(saved);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn("설정 파일을 읽지 못해 기본값을 사용합니다.", error.message);
      }
      this.config = getDefaultConfig();
    }

    return this.get();
  }

  get() {
    return structuredClone(this.config);
  }

  save(nextConfig) {
    this.config = normalizeConfig(nextConfig);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`, "utf8");
    return this.get();
  }
}

module.exports = {
  ConfigStore,
  clampZoom,
  getConfigIssues,
  getDefaultConfig,
  isSafeRemoteUrl,
  normalizeConfig,
};
