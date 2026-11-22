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
