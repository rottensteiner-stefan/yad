# Log — YAD

> Development log for the YAD app.
>
> Entry 1 dates back to the engine monorepo era: `scripts/check-showcases.js`, `AbstractShowcase.ts`, and the CI smoke test live in the engine repo. Standalone gates: `npm run typecheck`, `npm test`, `npm run build`.

---

## 1. Renderer Override Matching Showcases; Smoke Test Covers YAD Across All Three Backends (2026-10-13)

- **Trigger:** In the CI smoke test, `yad` was the only check failing outside the WebGPU legs (`[WebGPU Device Lost]`, `Instance dropped error in getCompilationInfo`). Root cause: `App` inherits directly from `SmallWorldMachine` and did not read `?rendererType=`; on a GPU-less runner, `yad` picked the "best" renderer (software WebGPU) and hit the same error as the showcase WebGPU legs. Verified by probe: without override `yad` runs on WebGPU; with `WEB_GL1`/`WEB_GL2`/`WEB_GPU` it uses the requested backend.
- **Change:** `App` reads `?rendererType=` via `getRendererTypeFromQuery()` (now exported from `AbstractShowcase.ts`), keeping default behavior without query params unchanged. `scripts/check-showcases.js` checks `yad` under WebGL1, WebGL2, and WebGPU (previously only once with the default renderer). With `SHOWCASE_SKIP_WEBGPU=1` (CI), GL1 and GL2 remain active.
- **Verification:** All three backends OK locally (Metal GPU). Not yet run on a real CI runner; the software WebGPU errors themselves (across all WebGPU legs in the runner) are an environment limitation and not fixed here.

## 2. Visual Concept Dossier Created (2026-10-21)

- **Trigger:** Per the app docs convention (`.agents/notes/app-docs-convention.md`), YAD lacked a detailed visual concept dossier.
- **Change:** Authored `docs/concept-dossier.html`:
  - Hero highlighting retro VGA 320×200 focus and multi-backend support (WebGPU, WebGL2, WebGL1).
  - Design pillars: 90s grid crawler, ASCII `LevelBuilder` (`level1.txt`), dynamic lava simulation (`FluidSurfaceMaterial`), discrete tank navigation (`GridMovementBehavior`).
  - Texture & color bible: swatches for Blood Red, Molten Lava, Dungeon Brick, Toxic Slime, Castle Slate, and CRT Void.
  - Interactive level architecture diagram with complete ASCII symbol legend (`W`, `G`, `+`, `P`, `E`, `~`, `b`, `l`, `1/2/3`, `O`).
  - Technical engine integration table (`FPSCameraController`, `BoundingBox`, texture streaming, `QuantizeElement`).
  - Status & roadmap (next steps: turn-based combat, fog of war, dynamic item pickups).
- **Verification:** Verified standalone in browser and via Vite at `http://localhost:5173/docs/concept-dossier.html`.

## 3. DevContainer Configuration Added for PhpStorm (2026-11-05)

- **Trigger:** Enable fully isolated app development inside a DevContainer via PhpStorm IDE.
- **Change:**
  - Created `.devcontainer/Dockerfile` based on `mcr.microsoft.com/devcontainers/typescript-node:24-bookworm` (Debian glibc for JetBrains Remote Backend, non-root `node` user, `git`, `curl`, `procps`).
  - Configured `.devcontainer/devcontainer.json` with automatic port forwarding (5173 for Vite dev server, 4173 for preview), `postCreateCommand: "npm install"`, and JetBrains backend metadata (`customizations.jetbrains.backend: "PhpStorm"`).
- **Verification:** Local Dockerfile build succeeded.

## 4. Release 0.1.1: Dependencies and Engine Updated to Latest Versions (2026-11-22)

- **Trigger:** Modernize all package and development tool dependencies to latest stable versions.
- **Change:**
  - `@small-world-machine/engine`: Updated to `0.128.0` (`packages-0.128.0`).
  - `typescript`: Upgraded from `^6.0.3` to `^7.0.2`.
  - `vite`: Upgraded from `^8.2.0` to `^8.3.8`.
  - `vitest`: Upgraded from `^5.0.5` to `^5.1.1`.
  - `@types/node`: Upgraded from `^26.1.2` to `^26.6.6`.
  - `@webgpu/types`: Upgraded from `^0.1.71` to `^0.1.74`.
- **Verification:** `npm run typecheck`, `npm test`, and `npm run build` passed without errors.

## 5. Thermonuclear Refactoring & Architectural Hardening (2026-11-22)

- **Trigger:** Address findings from the thermonuclear code-quality review (SRP violations, hot-path heap allocations, O(N) scene scanning, leaking enemy state logic).
- **Change:**
  - `WeaponView.ts`: Extracted from `Hud.ts`. Weapon bobbing and recoil render directly in the 2D canvas context without DOM style-string allocations (zero-GC hot path).
  - `Hud.ts`: Reduced to pure status-bar logic; eliminated duplicate `Events.SHOOT` listener and DOM thrashing.
  - `HazardGrid`: Added to `LevelBuilder.ts`, replacing linear $O(N)$ scene-object checks in `Controller.update()` with discrete $O(1)$ grid lookups.
  - `EnemyBehavior.kill()`: Encapsulated kill logic (squash, positioning, audio, behavior cleanup) inside `EnemyBehavior`; `Controller.ts` no longer mutates external nodes directly.
  - `SpriteAtlas.ts`: Scratch-canvas reuse instead of allocating hundreds of throwaway DOM canvases.
  - `Events.ts`: Introduced strict payload contracts (`PickupPayload`, `DamagePayload`, `WeaponPayload`) and fixed `itemType` field collision.
  - Instanced walls in `LevelBuilder.ts`: Reuse a scratch `Matrix4` instead of per-tile heap allocations.
  - Test suite: Added Vitest coverage for `WeaponView`, `Hud`, `Controller`, `HazardGrid`, and `Events` (13/13 tests green).
- **Verification:** `npm run typecheck`, `npm test` (13/13 passed), `npm run build` passed.

## 6. PBR Ambient Brightness (`1/pi` & `ACES_FILMIC`) & Pistol Overlay Fixed (2026-11-22)

- **Trigger:** After updating the engine to `0.128.0`, the scene was far too dark for two reasons: (1) ADR 0063 divides PBR ambient irradiance by $\pi$, (2) `ToneMappingMode.DEFAULT` switched from `ACES_FILMIC` to `PBR_NEUTRAL` (subtracting up to `0.04` in shadows, crushing ceilings and bricks to black under `QuantizeElement`). Additionally, the pistol sprite was missing because `WeaponView` resolved relative `./assets/...` URLs from `/src/index.html` (returning SPA HTML fallback instead of WebP).
- **Change:**
  - `src/App.ts`: Set `AmbientLight.intensity` to `Math.PI` (yielding unit ambient response under `1/pi` normalization) and forced `ToneMappingElement.mode = ToneMappingMode.ACES_FILMIC` so dark dungeon textures are not clipped prior to 8-step quantization.
  - `src/core/WeaponView.ts`: Switched sprite paths to `/assets/dungeon_pack/sprites/*.webp` and ensured redraw to frame `0` at end of firing animation even when `bobPhase` is stationary.
  - `tests/core/WeaponView.test.ts`: Added regression test for sprite URL and end-of-shot redraw.
- **Verification:** `npm run typecheck`, `npm test` (14/14 passed), `npm run build`, and WebGL2 Puppeteer screenshots (`yad_pi_front`, `yad_pi_corridor`, `yad_pi_torch`) verified.

## 7. Retro "Game Settings" Overlay Added (2026-11-22)

- **Trigger:** Add a Doom-inspired in-game settings menu ("Game Settings") for brightness, volume, FOV, and retro/control options.
- **Change:**
  - `src/core/GameSettings.ts`: Typed `GameSettingsData`, bounds sanitization, and `localStorage` persistence (`yad_game_settings`).
  - `src/core/SettingsMenu.ts`: Doom-style stone-frame overlay (`GAME SETTINGS`) on a virtual `640x400` layer over `#retro-screen` (corner rivets, skull cursor, Dungeon font, yellow focus highlight, blue slider thumbs/checkboxes/arrows, `[ESC] SETTINGS` badge) with mouse and keyboard navigation (`Escape`, arrow keys/WASD, `Enter`/`Space`, `RESET`).
  - `src/App.ts`, `src/core/behaviors/Controller.ts`, `src/core/behaviors/EnemyBehavior.ts`, `src/core/LevelBuilder.ts`: Live bindings for `Field of View`, `Retro Quantize`, `Tank Controls`, `Overall Brightness` (`ToneMappingElement.exposure`), `Level Brightness` (`AmbientLight.intensity`), `Master Volume`, `SFX Volume`, and `Music Volume` including clean gameplay pause while menu is open.
  - `tests/core/SettingsMenu.test.ts`: Unit and interaction tests for validation, persistence, and keyboard navigation.
- **Verification:** `npm run typecheck`, `npm test` (17/17 passed), `npm run build`, and Puppeteer screenshots (`yad_settings_closed`, `yad_settings_open`, `yad_settings_bright`) verified.

## 8. Freedoom Asset Pipeline & ADR-0058 Compliance (2026-11-22)

- **Trigger:** Clarify asset provenance and establish a clean open-source licensing baseline. Existing textures, sprites, and sounds historically originated from Freedoom but were mislabeled as id Software assets and lacked local RAW sources.
- **Change:**
  - `raw/freedoom/`: Sourced uncompressed RAW assets (PNGs, WAVs, `COPYING.adoc`, `CREDITS`) directly from the Freedoom project.
  - Google Drive backup: Archived under `Small-World-Machine/yad/raw/freedoom/` per ADR 0058 with SHA-256 `MANIFEST.txt` covering all 57 RAW files.
  - Build/bake: Converted all sprites and textures losslessly via `cwebp -lossless -q 100` to `public/assets/dungeon_pack/`.
  - `dungeonguy.webp`: Assembled pixel-accurate 48×360 vertical strip from the 6 original Freedoom status-bar frames (`stfst00`–`stfst40`, `stfdead0`).
  - `src/core/SpriteAtlas.ts`: Extended `sliceFaceSprites` with direct strip-slicing logic for clean vertical sprite strips.
  - Audio: Adopted official Freedoom WAVs for doors, gunfire, hits, switches, and enemy cues.
  - `docs/REFERENCES.md`: Documented full Freedoom attribution, 3-clause BSD license, and ADR-0058 storage locations.
  - Test suite: Added `tests/core/SpriteAtlas.test.ts` covering `sliceFaceSprites` (18/18 tests green).
- **Verification:** `npm run typecheck`, `npm test` (18/18 passed), `npm run build` passed.

## 9. Original Freedoom UI Graphics, Menu Audio & Extended Game Settings (2026-11-22)

- **Trigger:** Replace CSS menu widgets in `SettingsMenu` with authentic Freedoom `0.13.0` UI sprites from `raw/freedoom-0.13.0-source.zip` and add gameplay-relevant settings plus authentic HUD/audio elements.
- **Change:**
  - `public/assets/dungeon_pack/ui/*.webp`: Extracted from `raw/freedoom-0.13.0-source.zip` (`raw/freedoom/graphics/`) and converted losslessly via `cwebp -lossless`: 9-slice borders (`brdr_tl`–`brdr_br`), thermometer sliders (`m_therml`, `m_thermm`, `m_thermr`, `m_thermo`), selector boxes (`m_lsleft`, `m_lscntr`, `m_lsrght`), animated skull cursor (`m_skull1`, `m_skull2`), `pause.webp`, and keycard sprites (`stkeys0`–`stkeys2`).
  - `public/assets/sounds/menu_*.wav`: Added menu cues (`dsswtchn.wav` → `menu_open.wav`, `dsswtchx.wav` → `menu_close.wav`, `dspstop.wav` → `menu_move.wav`); updated `raw/freedoom/MANIFEST.txt` (SHA-256) and `docs/REFERENCES.md`.
  - `src/core/SettingsMenu.ts`: Switched borders and controls entirely to pixel-accurate Freedoom UI sprites (280 ms skull animation, `ceil3_5.webp` backdrop, `RESTART` button, `onSound` callbacks).
  - `src/core/GameSettings.ts`, `src/core/WeaponView.ts`, `src/App.ts`: Added `Crosshair` (`off`/`dot`/`cross`), `View Bobbing`, and `Reverb Level` wired live to `WeaponView` and `AudioSystem.setReverbLevel()`.
  - `src/core/Hud.ts`: Keycard slots (`0, 2, 4`) now use Freedoom sprites `stkeys0.webp`–`stkeys2.webp`.
  - `tests/core/SettingsMenu.test.ts`: Expanded coverage for `crosshair`, `viewBobbing`, `reverbLevel`, and `onSound` cues.
- **Verification:** `npm run typecheck`, `npm test` (18/18 passed), `npm run build`, and Puppeteer visual inspection of Freedoom UI (`yad_settings_open`) passed.

## 10. Binary Doom WAD Loader & Playable Freedoom E1M1 (2026-11-22)

- **Trigger:** Load authentic Doom `.wad` levels (`freedoom-0.13.0/levels/e1m1.wad`) including angled walls, stairs, doors, lifts, sector lighting, and `THINGS` directly inside YAD.
- **Change:**
  - `src/core/wad/WadParser.ts`: Pure binary IWAD/PWAD parser (`THINGS`, `LINEDEFS`, `SIDEDEFS`, `VERTEXES`, `SEGS`, `SSECTORS`, `NODES`, `SECTORS`).
  - `src/core/wad/WadPhysics.ts`: $O(\log N)$ BSP sector height lookup, spatially hashed zero-GC 2D linedef circle-sliding collision (including steps up to `24` Doom units), dynamic doors (`special 1/2/26/27/28/117`, incl. Blue Keycard), lifts (`62/88`), floor damage (`Nukage`), and 2D wall occlusion (`raycastWallDistance`).
  - `src/core/wad/WadLevelBuilder.ts`: Reconstructs convex subsector polygons via BSP half-plane clipping + `SEGS` trimming (`682/682`), UV-accurate linedef walls (`xOffset`/`yOffset`/`DONT_PEG_*`), sky ceilings (`SKY1`), animated door/lift nodes, and thing spawning (enemies, weapons, ammo, keycards, props, lights).
  - `public/assets/wad/`: `e1m1.wad`, `e1m1_manifest.json`, plus 114 wall textures composited from `textures.cfg` + `patches/`, 44 flats, and 39 thing sprites as lossless WebPs.
  - `src/core/behaviors/Controller.ts`, `src/core/behaviors/EnemyBehavior.ts`, `src/core/Hud.ts`, `src/core/GameSettings.ts`, `src/core/SettingsMenu.ts`, `src/App.ts`: WAD integration including `E` Use key, line-of-sight enemy awakening, and `Level: DOOM E1M1 / YAD GRID` switcher (plus `?level=grid|e1m1`).
  - `tests/core/wad/WadParser.test.ts`: Tests for lump parsing, BSP subsector triangulation, height resolution, and wall raycasts.
- **Verification:** `npm run typecheck`, `npm test` (22/22 passed), `npm run build`, and WebGL2 Puppeteer verification (`e1m1_spawn`, `e1m1_walk`, `e1m1_settings`) passed cleanly.

## 11. Full Weapon Arsenal (1–6 + Chainsaw), Split Ammo & All 6 Keycards/Skull Keys (2026-11-22)

- **Trigger:** Expand combat to all classic Doom weapons (`Fist`, `Chainsaw`, `Pistol`, `Shotgun`, `Chaingun`, `Rocket Launcher`, `Plasma Rifle`) and all 6 keycards and skull keys (`blue`, `yellow`, `red`, `blue_skull`, `yellow_skull`, `red_skull`) across both Doom WAD (`e1m1`) and Classic Grid (`level1.txt`).
- **Change:**
  - `src/core/WeaponConfig.ts`: Central weapon registry (`WEAPONS`, `AMMO_MAX`, `resolveWeaponForSlot()`, `KEY_SLOT_ENTRIES`) including pellet spread, range, splash radius (`Rocket Launcher`), cooldowns, and muzzle-flash offsets.
  - `src/core/WeaponView.ts`: Expanded weapon canvas to full `320x168` retro viewport (prevents clipping wide/tall sprites such as `pungb0`, `sawga0`, `shtgc0`, `plsfa0`); preloaded all 7 Freedoom sprite sets including plasma flash overlay (`plsfa0`/`plsfb0`).
  - `src/core/Hud.ts`: Split ammo reserves (`BULL`, `SHEL`, `RCKT`, `CELL`), dynamic `ARMS` slots `1–6` (yellow = active, white = owned, gray = locked), hidden main ammo readout for melee weapons, and full `3x2` key grid (`stkeys0.webp`–`stkeys5.webp`; skull keys also unlock matching WAD doors).
  - `src/core/behaviors/Controller.ts` & `src/core/behaviors/EnemyBehavior.ts`: Multi-weapon selection via digits `1–6` (with tap-latching across low framerates and `Chainsaw <-> Fist` toggle on slot `1`), ammo checks & automatic weapon fallback, firing via Space or pointer-locked left click, shotgun pellet spread, zero-GC rocket splash damage, and enemy HP scaling (`takeDamage`).
  - `src/core/wad/WadLevelBuilder.ts`, `src/core/LevelBuilder.ts`, `src/App.ts`, `public/assets/levels/level1.txt`: Added all 7 weapons, 4 ammo types, and 6 keys as pickups; integrated lossless Freedoom sprites and combat sounds (`punch`, `saw_up`, `saw_hit`, `shotgun`, `rocket`, `plasma`, `weapon_pickup`) and documented them in `docs/REFERENCES.md` and `raw/freedoom/MANIFEST.txt`.
  - `src/core/SettingsMenu.ts`: Fixed bug in `Level` selector (now updates `_settings.level` instead of overwriting `_settings.crosshair`).
- **Verification:** `npm run typecheck`, `npm test` (26/26 passed), `npm run build`, and full WebGL2 Puppeteer visual inspection of all 7 weapons (with muzzle flashes) and all 6 HUD keys passed.

## 12. Full Freedoom `0.13.0` Soundscape & Level Soundtracks (2026-11-22)

- **Trigger:** Upgrade audio coverage to the full Freedoom `0.13.0` soundscape including monster-specific sight/pain/active/death cues, world SFX (explosions, lifts, switches, door closing, locked doors, player death), and level soundtracks rendered from the original MIDI tracks.
- **Change:**
  - `public/assets/music/e1m1.m4a` & `grid.m4a`: Rendered Freedoom MIDI tracks `d_e1m1.mid` and `d_e1m2.mid` offline via macOS CoreAudio DLS General MIDI (`gs_instruments.dls`) and encoded to AAC `.m4a` (`afconvert -f m4af -d aac -b 96000`).
  - `public/assets/sounds/`: Added 17 Freedoom `0.13.0` WAVs (`explosion`, `player_death`, `locked`, `lift`, `switch`, `door_close`, `pos_sight`, `pos_pain`, `spos_sight`, `spos_death`, `imp_sight`, `imp_active`, `imp_death`, `demon_sight`, `demon_pain`, `demon_active`, `demon_death`) and updated `raw/freedoom/MANIFEST.txt`.
  - `src/core/behaviors/EnemyBehavior.ts`, `src/core/wad/WadLevelBuilder.ts`, `src/core/LevelBuilder.ts`: Wired per-monster sound profiles (`sightSound`, `painSound`, `activeSound`, `deathSound`) including line-of-sight awakening cue (`sightSound`).
  - `src/core/wad/WadPhysics.ts` & `src/core/behaviors/Controller.ts`: Integrated `lift`, `door_close`, `locked`, `switch`, and spatial rocket `explosion` cues.
  - `src/App.ts`: Preloaded all SFX (including fixing `secret_door` → `/assets/sounds/secret_door.wav`), started level music via `audio.playMusic("level_music", true, 0.5)` (with drone fallback) on first click or keydown (live-controlled by `Music Volume`), and triggered `player_death` on transition to `health <= 0`.
  - `tests/core/behaviors/EnemyBehavior.test.ts` & `tests/core/wad/WadParser.test.ts`: Added unit tests for per-monster audio cues and WAD mover cues (`locked`, `door`, `door_close`, `lift`, `switch`).
  - `docs/REFERENCES.md`: Documented new Freedoom SFX and rendered MIDI soundtracks.
- **Verification:** `npm run typecheck`, `npm test`, `npm run build`, and WebGL2 Puppeteer verification for `?level=e1m1` and `?level=grid` (0 console/network errors, all audio & music files HTTP 200 and decodable).

## 13. Selectable Internal 3D Render Resolution in Game Settings (2026-11-22)

- **Trigger:** Fixed `320x200` retro resolution appears very blocky on large displays; allow users to switch between original DOS pixels and crisper rendering without altering HUD or menu proportions.
- **Change:**
  - `src/core/GameSettings.ts`: Added `RenderResolution` (`320x200`, `640x400`, `960x600`, `1280x800`), `RESOLUTION_OPTIONS`, `RESOLUTION_DIMENSIONS`, default `"320x200"`, and `normalizeResolution()`.
  - `src/core/SettingsMenu.ts`: Added `Resolution` selector at top of the menu panel (including readout labels `1X DOS`, `2X CRISPY`, `3X`, `4X`).
  - `src/App.ts`: `_applyRenderResolution()` dynamically resizes the WebGL/WebGPU backbuffer to the selected resolution while preserving the `320x200` viewport layout (live switching without page reload).
  - `tests/core/SettingsMenu.test.ts`: Expanded sanitization, persistence, and keyboard-navigation tests for `resolution`.
- **Verification:** `npm run typecheck`, `npm test`, `npm run build`, and WebGL2 Puppeteer visual inspection (live switching `320x200` → `640x400` → `1280x800` including menu layout check).

## 14. Documentation, ADR & Manifest Cleanup (2026-11-22)

- **Trigger:** All files under `docs/` contained leftover German prose and copied monorepo ADRs unrelated to YAD (`SavegameStore`/`ViennaMapModal`, Xiaomi Redmi 13C quality-tier audits, Maker/glTF references), alongside stale entry paths in `app.json` and `README.md`.
- **Change:**
  - `docs/`: Translated all remaining German content in `log.md`, `concept-dossier.html`, `REFERENCES.md`, and `adr/` cleanly into English.
  - `docs/adr/`: Replaced the 4 copied monorepo ADRs with 4 concise, YAD-specific ADRs (`0001-standalone-app-boundary`, `0002-retro-render-pipeline-and-zero-gc-hot-paths`, `0003-doom-wad-loader-and-dual-level-architecture`, `0004-freedoom-open-assets-and-local-provenance`) plus a slim `index.md`.
  - `docs/concept-dossier.html`, `app.json`, `README.md`, `AGENTS.md`: Updated status/roadmap, fixed `entry`/`code.module` pointers (`src/index.html`, `./src/App.ts`), and aligned engine version references (`0.128.0`).
- **Verification:** Scanned `docs/` for leftover German phrases/umlauts (`CLEAN`) and verified `npm run typecheck`, `npm test`, and `npm run build`.

## 15. Concept Dossier Alignment & v0.3.0 Release (2026-11-22)

- **Trigger:** Finalize `docs/concept-dossier.html` parity with current WAD, 7-weapon/6-key, Freedoom soundscape, and selectable render-resolution features, then cut release `v0.3.0`.
- **Change:**
  - `docs/concept-dossier.html`: Replaced stale sample-app badge, fixed-320x200 phrasing, and outdated ASCII grid excerpt/legend (`T` lava, `~` slime, `3–7` weapons, `a` shells, `k/y/r/K/Y/R` keys); added WAD pipeline summary and expanded subsystem table (`WadParser`, `WadLevelBuilder`, `WadPhysics`, `ZoomController`, `ToneMappingElement`, `AudioSystem`, `WeaponView`).
  - `package.json`, `package-lock.json`, `app.json`, `CHANGELOG.md`: Bumped version to `0.3.0` and added `0.3.0` release notes.
- **Verification:** `npm run typecheck`, `npm test` (9/9 files, 28/28 tests), and `npm run build` passed.

## 16. Engine Dependency Upgrade to 0.129.0 (2026-11-24)

- **Trigger:** Update `@small-world-machine/engine` to the latest release (`packages-0.129.0`).
- **Change:**
  - `package.json` & `package-lock.json`: Bumped `@small-world-machine/engine` from `0.128.0` to `0.129.0` via GitHub release tarball URL.
  - `app.json`: Updated `engine` compatibility constraint to `>=0.129.0`.
  - `README.md`: Updated engine release reference to `packages-0.129.0`.
- **Verification:** `npm run typecheck`, `npm test` (9/9 test files, 28/28 tests green), and `npm run build` passed.

## 17. Project Makefile Added (2026-11-24)

- **Trigger:** Provide parity with sibling app *The Whisper* by adding a dedicated `Makefile` for developer workflow (`dev`, `start`, `restart`, `kill`, `check`, `typecheck`, `test`, `build`, `clean`).
- **Change:**
  - `Makefile`: Added targets for starting/restarting the dev server (`restart` invokes `kill` before starting Vite), killing blocked ports via `npm run kill:vite`, sequential verification gate (`make check`), test runners, and build/cleanup targets with colorized `help`.
  - `README.md`: Documented all `make` targets alongside direct `npm` invocations.
- **Verification:** Verified `make help`, `make kill`, and `make check` (all 3 gates passed).

## 18. Engine 0.129.2 Upgrade & Release v0.3.1 (2026-11-24)

- **Trigger:** Sync standalone `yad` release `0.3.1` with engine release `packages-0.129.2`.
- **Change:**
  - `package.json`, `package-lock.json`, `app.json`, `README.md`: Upgraded `@small-world-machine/engine` to `packages-0.129.2`, bumped app version to `0.3.1`, and updated `app.json` `engine` floor to `>=0.129.2`.
  - `CHANGELOG.md`: Added `[0.3.1]` release notes covering the `Makefile` workflow and `packages-0.129.2` upgrade.
- **Verification:** `npm run typecheck`, `npm test`, and `npm run build` passed.

## 19. Engine 0.129.3 Upgrade & Release v0.3.2 (2026-11-27)

- **Trigger:** Sync standalone `yad` release `0.3.2` with engine release `packages-0.129.3`.
- **Change:**
  - `package.json`, `package-lock.json`, `app.json`, `README.md`: Upgraded `@small-world-machine/engine` to `packages-0.129.3`, bumped app version to `0.3.2`, and updated `app.json` `engine` floor to `>=0.129.3`.
  - `CHANGELOG.md`: Added `[0.3.2]` release notes.
- **Verification:** `npm run typecheck`, `npm test`, and `npm run build` passed.
