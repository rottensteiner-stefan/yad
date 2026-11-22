# ADR 0001: Standalone Engine Boundary & App-First Gameplay

> **Status:** Accepted

## Context

YAD is a standalone game consuming `@small-world-machine/engine` via a pinned GitHub release URL in `package.json`, identical to any third-party consumer.

## Decision

1. **Strict Public Package Boundary:** Source files in `src/` and `tests/` import exclusively from `@small-world-machine/engine`. Deep imports, workspace path aliases, and editing `node_modules/` are forbidden. If a needed capability is missing in the engine, it is implemented, released, and adopted via a dependency bump.
2. **Genre Code Stays in `src/`:** Dungeon-specific gameplay (multi-weapon combat, Doom HUD, `SettingsMenu`, `WadParser`/`WadPhysics`, `HazardGrid`, `EnemyBehavior`) lives strictly inside YAD rather than being pushed prematurely into the general-purpose engine core.
3. **Lightweight App Manifest & Settings:** `app.json` identifies the standalone application (`id`, `version`, `entry`, `code.module`), while user preferences (`GameSettingsData`) persist locally via `localStorage` (`yad_game_settings`) with strict schema sanitization.

## Consequences

- Engine upgrades remain clean, versioned, and testable without cross-repo coupling.
- YAD can iterate rapidly on Doom-specific mechanics without stabilizing them as public engine APIs.
