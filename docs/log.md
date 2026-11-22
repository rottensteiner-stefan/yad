# Log — YAD

> Entwicklungslog für die YAD App.
>
> Eintrag 1 stammt aus der Engine-Monorepo-Zeit: `scripts/check-showcases.js`, `AbstractShowcase.ts` und der CI-Smoke-Test liegen im Engine-Repo. Standalone-Gates: `npm run typecheck`, `npm test`, `npm run build`.

---

## 1. Renderer-Override wie bei den Showcases; Smoke-Test prüft YAD unter allen drei Backends (2026-10-13)

- **Anlass:** Im CI-Smoke-Test schlug `yad` als einziger Check außerhalb der WebGPU-Legs fehl (`[WebGPU Device Lost]`, `Instance dropped error in getCompilationInfo`). Ursache: `App` erbt direkt von `SmallWorldMachine` und kannte kein `?rendererType=`; im Runner ohne GPU nahm `yad` deshalb den „besten" Renderer, also WebGPU (Software), und lief in denselben Fehler wie die WebGPU-Legs der Showcases. Per Probe bestätigt: ohne Override läuft `yad` auf WebGPU, mit `WEB_GL1`/`WEB_GL2`/`WEB_GPU` auf dem verlangten Backend.
- **Änderung:** `App` liest `?rendererType=` über `getRendererTypeFromQuery()` (jetzt aus `AbstractShowcase.ts` exportiert), Standardverhalten ohne Parameter unverändert. `scripts/check-showcases.js` prüft `yad` unter WebGL1, WebGL2 und WebGPU (vorher einmal mit dem Standard-Renderer). Mit `SHOWCASE_SKIP_WEBGPU=1` (CI) bleiben GL1 und GL2.
- **Verifikation:** lokal alle drei Backends OK (Metal-GPU). Auf einem echten Runner noch nicht gelaufen; die WebGPU-Software-Fehler selbst (alle WebGPU-Legs im Runner) sind eine Umgebungsgrenze und hier nicht behoben.

## 2. Visuelles Konzept-Dossier erstellt (2026-10-21)

- **Anlass:** Gemäß App-Docs-Konvention (`.agents/notes/app-docs-convention.md`) fehlte für YAD ein detailliertes visuelles Konzept-Dossier.
- **Änderung:** `docs/concept-dossier.html` ausgearbeitet:
  - Hero mit Retro-VGA-320x200-Fokus und Multi-Backend-Unterstützung (WebGPU, WebGL2, WebGL1).
  - Design-Säulen: 90er-Jahre Grid-Crawler, ASCII-LevelBuilder (`level1.txt`), dynamische Lavasimulation (`FluidSurfaceMaterial`), diskrete Panzersteuerung (`GridMovementBehavior`).
  - Textur- & Farb-Bibel: Farbfelder für Blood Red, Molten Lava, Dungeon Brick, Toxic Slime, Castle Slate und CRT Void.
  - Interaktives Level-Architektur-Diagramm mit vollständiger ASCII-Symbollegende (`W`, `G`, `+`, `P`, `E`, `~`, `b`, `l`, `1/2/3`, `O`).
  - Technische Engine-Integrationstabelle (`FPSCameraController`, `BoundingBox`, Textur-Streaming, QuantizeElement).
  - Status & Roadmap (Next Steps: Turn-based Combat, Fog of War, dynamische Item-Pickups).
- **Verifikation:** Standalone im Browser und über Vite unter `http://localhost:5173/docs/concept-dossier.html` geprüft.

## 3. DevContainer-Konfiguration für PhpStorm hinzugefügt (2026-11-05)

- **Anlass:** Entwicklung der Anwendung soll vollständig isoliert in einem DevContainer über die IDE PhpStorm ausgeführt werden können.
- **Änderung:**
  - `.devcontainer/Dockerfile` auf Basis von `mcr.microsoft.com/devcontainers/typescript-node:24-bookworm` (Debian-basiert mit glibc für JetBrains Remote Backend, non-root User `node`, git, curl, procps) erstellt.
  - `.devcontainer/devcontainer.json` mit automatischem Port-Forwarding (5173 für Vite Dev-Server, 4173 für Preview), `postCreateCommand: "npm install"` und JetBrains-Backend-Spezifikation (`customizations.jetbrains.backend: "PhpStorm"`) konfiguriert.
- **Verifikation:** Dockerfile-Build lokal erfolgreich verifiziert.

## 4. Release 0.1.1: Abhängigkeiten und Engine auf neuesten Stand aktualisiert (2026-11-22)

- **Anlass:** Modernisierung aller Paket- und Entwicklungstools auf die neuesten stabilen Versionen.
- **Änderung:**
  - `@small-world-machine/engine`: Auf aktuellem Stand `0.128.0` (`packages-0.128.0`).
  - `typescript`: Upgrade von `^6.0.3` auf `^7.0.2`.
  - `vite`: Upgrade von `^8.2.0` auf `^8.3.8`.
  - `vitest`: Upgrade von `^5.0.5` auf `^5.1.1`.
  - `@types/node`: Upgrade von `^26.1.2` auf `^26.6.6`.
  - `@webgpu/types`: Upgrade von `^0.1.71` auf `^0.1.74`.
- **Verifikation:** `npm run typecheck`, `npm test` und `npm run build` fehlerfrei ausgeführt.

## 5. Thermonukleares Refactoring & Architektur-Härtung (2026-11-22)

- **Anlass:** Funde aus dem thermonuklearen Code-Quality-Review adressieren (SRP-Verletzungen, Hot-Path-Heap-Allokationen, O(N)-Szenen-Scanning, Leckage von Gegnerlogik).
- **Änderung:**
  - `WeaponView.ts`: Aus `Hud.ts` extrahiert. Waffen-Bobbing und Recoil laufen ohne DOM-Style-String-Allokationen direkt im 2D-Canvas-Kontext (Zero-GC Hot Path).
  - `Hud.ts`: Auf reine Statusbar-Logik reduziert, doppelter `Events.SHOOT`-Listener und DOM-Thrashing beseitigt.
  - `HazardGrid`: In `LevelBuilder.ts` eingeführt; ersetzt die lineare $O(N)$-Szene-Objekt-Prüfung im `Controller.update()` durch diskrete $O(1)$-Grid-Lookups.
  - `EnemyBehavior.kill()`: Tötungslogik (Squash, Position, Audio, Behavior-Cleanup) sauber im Enemy gekapselt; `Controller.ts` mutiert keine fremden Objekt-Nodes mehr direkt.
  - `SpriteAtlas.ts`: Scratch-Canvas-Wiederverwendung statt hunderten Einweg-DOM-Canvases.
  - `Events.ts`: Strikte Typverträge (`PickupPayload`, `DamagePayload`, `WeaponPayload`) eingeführt und `itemType`-Kollision behoben.
  - Instanzierte Wände in `LevelBuilder.ts`: Wiederverwendung einer Scratch-`Matrix4` statt Heap-Allokation pro Wand-Tile.
  - Testsuite: Umfassende Vitest-Tests für `WeaponView`, `Hud`, `Controller`, `HazardGrid` und `Events` ergänzt (13 Tests, alle grün).
- **Verifikation:** `npm run typecheck`, `npm test` (13/13 bestanden), `npm run build` erfolgreich.

## 6. PBR Ambient-Helligkeit (`1/pi` & `ACES_FILMIC`) & Pistolen-Overlay korrigiert (2026-11-22)

- **Anlass:** Nach dem Engine-Update auf `0.128.0` war die Szenerie aus zwei Gründen deutlich zu dunkel: (1) ADR 0063 teilt PBR-Ambient-Irradiance durch $\pi$, (2) `ToneMappingMode.DEFAULT` wechselte von `ACES_FILMIC` auf `PBR_NEUTRAL` (subtrahiert bis `0.04` in dunklen Bereichen, wodurch Decke und Ziegel unter `QuantizeElement` auf Schwarz fielen). Zudem fehlte die Pistole, weil `WeaponView` relative `./assets/...`-Pfade von `/src/index.html` aus auflöste (SPA-Fallback statt WebP).
- **Änderung:**
  - `src/App.ts`: `AmbientLight.intensity` auf `Math.PI` gesetzt (ergibt `1.0` Ambient-Basis unter `1/pi`-Normalisierung) und `ToneMappingElement.mode` explizit auf `ToneMappingMode.ACES_FILMIC` gestellt, damit dunkle Dungeon-Texturen vor der 8-Stufen-Quantisierung nicht abgeschnitten werden.
  - `src/core/WeaponView.ts`: Sprite-Pfade auf `/assets/dungeon_pack/sprites/*.webp` umgestellt und Redraw auf Frame `0` beim Ende der Schussanimation auch bei stehendem `bobPhase` sichergestellt.
  - `tests/core/WeaponView.test.ts`: Regressionstest für Sprite-Pfad und Schussende-Redraw ergänzt.
- **Verifikation:** `npm run typecheck`, `npm test` (14/14 bestanden), `npm run build` sowie Puppeteer-Screenshots unter WebGL2 (`yad_pi_front`, `yad_pi_corridor`, `yad_pi_torch`) geprüft.

## 7. Retro „Game Settings“-Overlay hinzugefügt (2026-11-22)

- **Anlass:** Wunsch nach einem Doom-inspirierten In-Game-Einstellungsmenü („Game Settings“) für Helligkeit, Lautstärke, FOV und Retro-/Steuerungsoptionen.
- **Änderung:**
  - `src/core/GameSettings.ts`: Typisierte `GameSettingsData`, Bounds-Sanitizing und `localStorage`-Persistenz (`yad_game_settings`).
  - `src/core/SettingsMenu.ts`: Doom-artiges Stone-Frame-Overlay (`GAME SETTINGS`) im virtuellen `640x400`-Layer auf `#retro-screen` (Ecknieten, Totenkopf-Emblem, Dungeon-Font, gelbe Fokus-Markierung, blaue Slider-Thumbs/Checkboxen/Pfeile, `[ESC] SETTINGS`-Badge) mit Maus- und Tastaturnavigation (`Escape`, Pfeiltasten/WASD, `Enter`/`Space`, `RESET`).
  - `src/App.ts`, `src/core/behaviors/Controller.ts`, `src/core/behaviors/EnemyBehavior.ts`, `src/core/LevelBuilder.ts`: Live-Anbindung für `Field of View`, `Retro Quantize`, `Tank Controls`, `Overall Brightness` (`ToneMappingElement.exposure`), `Level Brightness` (`AmbientLight.intensity`), `Master Volume`, `SFX Volume` und `Music Volume` inkl. sauberer Spielpause bei geöffnetem Menü.
  - `tests/core/SettingsMenu.test.ts`: Unit- und Interaktionstests für Validierung, Persistenz und Tastaturnavigation.
- **Verifikation:** `npm run typecheck`, `npm test` (17/17 bestanden), `npm run build` sowie Puppeteer-Screenshots (`yad_settings_closed`, `yad_settings_open`, `yad_settings_bright`) geprüft.

## 8. Freedoom Asset-Pipeline & ADR-0058-Konformität (2026-11-22)

- **Anlass:** Klärung der Asset-Provenienz und rechtssichere Open-Source-Basis. Die bisherigen Texturen, Sprites und Sounds basierten historisch auf Freedoom, waren jedoch fälschlicherweise als id-Software-Originale deklariert und besaßen keine RAW-Quellen im Projekt.
- **Änderung:**
  - `raw/freedoom/`: Vollständige unkomprimierte RAW-Quellen (PNGs, WAVs, `COPYING.adoc`, `CREDITS`) direkt vom Freedoom-Projekt bezogen.
  - Google-Drive-Backup: Gemäß ADR 0058 nach `Small-World-Machine/yad/raw/freedoom/` gesichert und `MANIFEST.txt` mit SHA-256-Prüfsummen für alle 57 RAW-Dateien generiert.
  - Build/Bake: Alle Sprites und Texturen verlustfrei per `cwebp -lossless -q 100` nach `public/assets/dungeon_pack/` gebacken.
  - `dungeonguy.webp`: Aus den 6 originalen Freedoom-Statusbar-Frames (`stfst00`–`stfst40`, `stfdead0`) als pixelgenauer 48x360-Strip zusammengesetzt.
  - `src/core/SpriteAtlas.ts`: `sliceFaceSprites` um direkte Slice-Logik für saubere vertikale Sprite-Strips erweitert.
  - Sounds: Offizielle Freedoom-WAVs für Türen, Schüsse, Treffer, Schalter und Gegnergeräusche übernommen.
  - `docs/REFERENCES.md`: Vollständige Freedoom-Quellenangabe, BSD-Lizenz und ADR-0058-Speicherorte dokumentiert.
  - Testsuite: `tests/core/SpriteAtlas.test.ts` für `sliceFaceSprites` ergänzt (18/18 Tests grün).
- **Verifikation:** `npm run typecheck`, `npm test` (18/18 bestanden), `npm run build` fehlerfrei.

## 9. Originale Freedoom-UI-Grafiken, Menü-Audio & erweiterte Game Settings (2026-11-22)

- **Anlass:** Ersatz der CSS-Menüelemente in `SettingsMenu` durch echte Freedoom-`0.13.0`-UI-Sprites aus `raw/freedoom-0.13.0-source.zip` sowie Ergänzung weiterer spielrelevanter Einstellungen und authentischer HUD-/Audio-Elemente.
- **Änderung:**
  - `public/assets/dungeon_pack/ui/*.webp`: Aus `raw/freedoom-0.13.0-source.zip` extrahiert (`raw/freedoom/graphics/`) und verlustfrei per `cwebp -lossless` konvertiert: 9-Slice-Rahmen (`brdr_tl`–`brdr_br`), Thermometer-Slider (`m_therml`, `m_thermm`, `m_thermr`, `m_thermo`), Auswahlboxen (`m_lsleft`, `m_lscntr`, `m_lsrght`), animierter Skull-Cursor (`m_skull1`, `m_skull2`), `pause.webp` sowie Schlüsselkarten-Sprites (`stkeys0`–`stkeys2`).
  - `public/assets/sounds/menu_*.wav`: Menü-Sounds (`dsswtchn.wav` -> `menu_open.wav`, `dsswtchx.wav` -> `menu_close.wav`, `dspstop.wav` -> `menu_move.wav`) ergänzt; `raw/freedoom/MANIFEST.txt` (SHA-256) und `docs/REFERENCES.md` aktualisiert.
  - `src/core/SettingsMenu.ts`: CSS-Rahmen/Controls vollständig auf pixelgenaue Freedoom-UI-Sprites umgestellt (inkl. 280-ms-Skull-Animation, `ceil3_5.webp`-Hintergrund, `RESTART`-Aktion und `onSound`-Callbacks).
  - `src/core/GameSettings.ts`, `src/core/WeaponView.ts`, `src/App.ts`: Einstellungen um `Crosshair` (`off` / `dot` / `cross`), `View Bobbing` und `Reverb Level` erweitert und live an `WeaponView` bzw. `AudioSystem.setReverbLevel()` angebunden.
  - `src/core/Hud.ts`: Schlüsselkarten-Slots (`0, 2, 4`) nutzen nun die Freedoom-Sprites `stkeys0.webp`–`stkeys2.webp`.
  - `tests/core/SettingsMenu.test.ts`: Tests um `crosshair`, `viewBobbing`, `reverbLevel` und `onSound`-Cues erweitert.
- **Verifikation:** `npm run typecheck`, `npm test` (18/18 bestanden), `npm run build` sowie Puppeteer-Sichtprüfung der Freedoom-UI (`yad_settings_open`) erfolgreich.

