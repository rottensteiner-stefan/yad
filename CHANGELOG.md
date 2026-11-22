# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-22

### "Light is meaningful only in relation to darkness." - Louis Kahn

- **Features:**
  - Added a Doom-inspired **Game Settings** overlay (`SettingsMenu` + `GameSettings`) inside the virtual `640x400` `#retro-screen` layer with `localStorage` persistence (`yad_game_settings`), mouse/keyboard navigation, `RESTART`, `RESET`, and `[ESC] SETTINGS` badge.
  - Wired live settings for `Field of View`, `Crosshair` (`off` / `dot` / `cross`), `Retro Quantize`, `Tank Controls`, `View Bobbing`, `Overall Brightness`, `Level Brightness`, `Master Volume`, `SFX Volume`, `Music Volume`, and `Reverb Level`.
  - Replaced CSS menu primitives with genuine Freedoom `0.13.0` UI sprites (`public/assets/dungeon_pack/ui/*.webp`: 9-slice border `brdr_*`, thermometer sliders `m_therm*`, selector boxes `m_ls*`, animated skull cursor `m_skull1`/`m_skull2`, `pause`, keycards `stkeys0`–`stkeys2`) and menu audio cues (`menu_open.wav`, `menu_close.wav`, `menu_move.wav`).
  - Upgraded `Hud` keycard slots (`0, 2, 4`) and `dungeonguy.webp` face strip (`48x360` 6-frame vertical strip) plus sound effects (`door`, `enemy_*`, `hurt`, `pickup`, `secret*`, `shoot`) to verified Freedoom `0.13.0` assets.
  - Added pixel crosshair rendering (`off`, `dot`, `cross`) and `viewBobbing` toggle to `WeaponView`.
- **Architecture & Bugfixes:**
  - Restored PBR scene brightness under engine `0.128.0` by normalizing `AmbientLight.intensity` to `Math.PI` (compensating ADR 0063 `1/pi` irradiance division) and locking `ToneMappingElement.mode` to `ToneMappingMode.ACES_FILMIC`.
  - Fixed missing pistol overlay (`WeaponView` now loads `/assets/dungeon_pack/sprites/*.webp` from root) and forced frame-`0` redraw at shoot-animation end.
  - Extracted `WeaponView` from `Hud` with zero-GC 2D canvas drawing, introduced `O(1)` `HazardGrid` lookups in `LevelBuilder`, encapsulated `EnemyBehavior.kill()`, added `SpriteAtlas.sliceFaceSprites` vertical-strip slicing, and paused player/enemy/lava simulation while `SettingsMenu` is open.
- **Housekeeping & Docs:**
  - Established full Freedoom `0.13.0` asset provenance & ADR-0058 documentation in `docs/REFERENCES.md` and `docs/log.md` (Entries 5–9).
  - Expanded Vitest coverage to 8 test files (18 tests) covering `SettingsMenu`, `SpriteAtlas`, `WeaponView`, `Hud`, `Controller`, `EnemyBehavior`, `HazardGrid`, and `Events`.

## [0.1.1] - 2026-11-22

### "Change is the end result of all true learning." - Leo Buscaglia

- **Architecture & Bugfixes:**
  - Upgraded `@small-world-machine/engine` to release `0.128.0` (`packages-0.128.0`).
  - Adapted raycasting candidate queries in `Controller.ts` for readonly scene object collections.
- **Housekeeping & Docs:**
  - Modernized devDependencies to latest releases: TypeScript `^7.0.2`, Vite `^8.3.8`, Vitest `^5.1.1`, `@types/node` `^26.6.6`, `@webgpu/types` `^0.1.74`.

## [0.1.0] - 2026-11-05

### "In a dark time, the eye begins to see." - Theodore Roethke

- **Features:**
  - Initial standalone release of YAD (Yet Another Dungeon), a retro first-person grid crawler.
  - Hybrid 2.5D/3D sprite rendering with retro HUD and audio soundscape.
- **Architecture & Bugfixes:**
  - Standalone project decoupling from the Small World Machine monorepo.
  - Pure package dependency on `@small-world-machine/engine` via GitHub release URL.
  - Strict TypeScript configuration, zero-GC hot paths, and separated root `tests/` harness.
- **Housekeeping & Docs:**
  - Standardized project layout: `src/`, `public/`, `tests/`, `docs/`, `AGENTS.md`.
  - Removed unused engine CSS and font bundles in favor of game-specific assets and local fonts.
