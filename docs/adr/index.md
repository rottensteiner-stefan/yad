# Architecture Decision Records (ADRs)

Concise architectural decisions governing **YAD (Yet Another Dungeon)** as a standalone game built on `@small-world-machine/engine`.

## Index

- **[ADR 0001: Standalone Engine Boundary & App-First Gameplay](./0001-standalone-app-boundary.md)** — Strict `@small-world-machine/engine` package boundary, `app.json` manifest, and keeping genre gameplay code inside `src/`.
- **[ADR 0002: Retro Render Pipeline & Zero-GC Hot Paths](./0002-retro-render-pipeline-and-zero-gc-hot-paths.md)** — Selectable `320×200`–`1280×800` pixelated retro viewport, `ACES_FILMIC` + 8-step `QuantizeElement`, and zero-allocation frame loops.
- **[ADR 0003: Dual-Level Architecture & Pure Binary Doom WAD Loader](./0003-doom-wad-loader-and-dual-level-architecture.md)** — Supporting both ASCII grid maps (`level1.txt`) and pure TypeScript binary `.wad` parsing + BSP physics (`e1m1.wad`).
- **[ADR 0004: Freedoom Open Assets & Offline Provenance](./0004-freedoom-open-assets-and-local-provenance.md)** — Local BSD-licensed Freedoom `0.13.0` textures, sprites, SFX, and pre-rendered MIDI soundtracks with zero external runtime fetches.

> *Engine-internal ADRs (such as quality tiers, renderer internals, and multi-app schemas) live in the upstream Small World Machine repository.*
