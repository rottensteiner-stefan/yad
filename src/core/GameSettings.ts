export const GAME_SETTINGS_STORAGE_KEY = "yad_game_settings";

export const FOV_OPTIONS: readonly number[] = [60, 75, 90, 105];

export type RenderResolution = "320x200" | "640x400" | "960x600" | "1280x800";
export const RESOLUTION_OPTIONS: readonly RenderResolution[] = [
  "320x200",
  "640x400",
  "960x600",
  "1280x800",
];
export const RESOLUTION_DIMENSIONS: Readonly<
  Record<RenderResolution, { width: number; height: number }>
> = {
  "320x200": { width: 320, height: 200 },
  "640x400": { width: 640, height: 400 },
  "960x600": { width: 960, height: 600 },
  "1280x800": { width: 1280, height: 800 },
};

export type CrosshairMode = "off" | "dot" | "cross";
export const CROSSHAIR_OPTIONS: readonly CrosshairMode[] = ["off", "dot", "cross"];

export type LevelId = "e1m1" | "grid";
export const LEVEL_OPTIONS: readonly LevelId[] = ["e1m1", "grid"];

export interface GameSettingsData {
  resolution: RenderResolution;
  level: LevelId;
  fov: number;
  crosshair: CrosshairMode;
  retroQuantize: boolean;
  tankControls: boolean;
  viewBobbing: boolean;
  overallBrightness: number;
  levelBrightness: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  reverbLevel: number;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettingsData> = {
  resolution: "320x200",
  level: "e1m1",
  fov: 75,
  crosshair: "dot",
  retroQuantize: true,
  tankControls: true,
  viewBobbing: true,
  overallBrightness: 1.0,
  levelBrightness: 1.0,
  masterVolume: 0.8,
  sfxVolume: 1.0,
  musicVolume: 1.0,
  reverbLevel: 0.3,
};

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeResolution(value: unknown, fallback: RenderResolution): RenderResolution {
  if (typeof value === "string" && RESOLUTION_OPTIONS.includes(value as RenderResolution)) {
    return value as RenderResolution;
  }
  return fallback;
}

function normalizeFov(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (FOV_OPTIONS.includes(value)) {
    return value;
  }
  return fallback;
}

function normalizeCrosshair(value: unknown, fallback: CrosshairMode): CrosshairMode {
  if (value === "off" || value === "dot" || value === "cross") {
    return value;
  }
  return fallback;
}

function normalizeLevel(value: unknown, fallback: LevelId): LevelId {
  if (value === "e1m1" || value === "grid") {
    return value;
  }
  return fallback;
}

export function sanitizeGameSettings(raw: Partial<GameSettingsData> | null | undefined): GameSettingsData {
  const source = raw ?? {};
  return {
    resolution: normalizeResolution(source.resolution, DEFAULT_GAME_SETTINGS.resolution),
    level: normalizeLevel(source.level, DEFAULT_GAME_SETTINGS.level),
    fov: normalizeFov(source.fov, DEFAULT_GAME_SETTINGS.fov),
    crosshair: normalizeCrosshair(source.crosshair, DEFAULT_GAME_SETTINGS.crosshair),
    retroQuantize:
      typeof source.retroQuantize === "boolean"
        ? source.retroQuantize
        : DEFAULT_GAME_SETTINGS.retroQuantize,
    tankControls:
      typeof source.tankControls === "boolean"
        ? source.tankControls
        : DEFAULT_GAME_SETTINGS.tankControls,
    viewBobbing:
      typeof source.viewBobbing === "boolean"
        ? source.viewBobbing
        : DEFAULT_GAME_SETTINGS.viewBobbing,
    overallBrightness: clampRange(
      source.overallBrightness,
      0.5,
      2.0,
      DEFAULT_GAME_SETTINGS.overallBrightness,
    ),
    levelBrightness: clampRange(
      source.levelBrightness,
      0.5,
      2.0,
      DEFAULT_GAME_SETTINGS.levelBrightness,
    ),
    masterVolume: clampRange(source.masterVolume, 0.0, 1.0, DEFAULT_GAME_SETTINGS.masterVolume),
    sfxVolume: clampRange(source.sfxVolume, 0.0, 1.0, DEFAULT_GAME_SETTINGS.sfxVolume),
    musicVolume: clampRange(source.musicVolume, 0.0, 1.0, DEFAULT_GAME_SETTINGS.musicVolume),
    reverbLevel: clampRange(source.reverbLevel, 0.0, 1.0, DEFAULT_GAME_SETTINGS.reverbLevel),
  };
}

export function loadGameSettings(): GameSettingsData {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_GAME_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_GAME_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<GameSettingsData>;
    return sanitizeGameSettings(parsed);
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettingsData): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeGameSettings(settings)));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}
