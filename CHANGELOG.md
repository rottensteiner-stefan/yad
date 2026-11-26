# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] - 2026-11-27

### "Step by step and the thing is done." - Charles Atlas

- **Architecture & Bugfixes:**
  - Upgraded `@small-world-machine/engine` from `packages-0.129.2` to `packages-0.129.3` and raised `app.json` engine floor to `>=0.129.3`.

## [0.3.1] - 2026-11-24

### "Speak clearly, if you speak at all; carve every word before you let it fall." - Oliver Wendell Holmes

- **Features:**
  - Added root `Makefile` (`dev`, `start`, `restart`, `kill`, `check`, `typecheck`, `test`, `build`, `clean`) and documented targets in `README.md`.
- **Architecture & Bugfixes:**
  - Upgraded `@small-world-machine/engine` from `packages-0.129.0` to `packages-0.129.2` (incorporating `0.129.1` WGSL `@invariant` depth-prepass clip parity + Noir curve calibration and `0.129.2` asset-kit validation/docs updates) and raised `app.json` engine floor to `>=0.129.2`.

## [0.3.0] - 2026-11-22

### "The details are not the details. They make the design." - Charles Eames

- **Features:**
  - Added binary Doom WAD loader and BSP physics (`src/core/wad/WadParser.ts`, `WadLevelBuilder.ts`, `WadPhysics.ts`) with playable Freedoom `E1M1` (`public/assets/wad/e1m1.wad`, subsector triangulation, linedef doors, lifts, switches, nukeage hazards, sky ceiling, `E` Use key, and `Level: DOOM E1M1 / YAD GRID` selector plus `?level=e1m1|grid`).
  - Expanded combat to the full 7-weapon arsenal (`Fist`, `Chainsaw`, `Pistol`, `Shotgun`, `Chaingun`, `Rocket Launcher`, `Plasma Rifle`) with split ammo (`BULL`, `SHEL`, `RCKT`, `CELL`), `ARMS` HUD slots `1–6`, shotgun spread, rocket splash damage, and all 6 keycards/skull keys (`k/y/r/K/Y/R`, `stkeys0.webp`–`stkeys5.webp`).
  - Integrated the full Freedoom `0.13.0` soundscape (35 preloaded SFX incl. per-monster sight/pain/active/death cues, `lift`, `door_close`, `locked`, `switch`, `explosion`, `player_death`) and rendered MIDI level soundtracks (`public/assets/music/e1m1.m4a`, `grid.m4a`).
  - Added live selectable internal 3D render resolution (`320x200` `1X DOS`, `640x400` `2X CRISPY`, `960x600` `3X`, `1280x800` `4X`) in `GameSettings` and `SettingsMenu` while preserving the `320x200` HUD/menu viewport.
- **Architecture & Bugfixes:**
  - Fixed `SettingsMenu` `Level` selector overwriting `crosshair` instead of `level`, fixed `secret_door` SFX root path, and ensured zero-GC rocket splash & spatially hashed 2D linedef collision.
  - Expanded `WeaponView` overlay to full `320x168` viewport with muzzle-flash alignment and automatic fallback when ammo runs dry.
- **Housekeeping & Docs:**
  - Translated all documentation under `docs/` (`log.md`, `concept-dossier.html`, `REFERENCES.md`, `adr/`) cleanly to English and refreshed `docs/concept-dossier.html` for WAD, 7-weapon, 6-key, and render-resolution parity.
  - Replaced copied monorepo ADRs with 4 concise YAD-specific ADRs (`0001`–`0004`) plus `docs/adr/index.md`, and fixed `app.json` (`entry`, `code.module`, `engine >=0.128.0`), `README.md`, and `AGENTS.md`.
  - Expanded Vitest suite to 9 test files (28 tests) including `WadParser.test.ts` and new monster/mover/resolution coverage.

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
