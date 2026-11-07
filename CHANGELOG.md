# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
