# ADR 0004: Freedoom Open Assets & Offline Provenance

> **Status:** Accepted

## Context

All visual and audio assets must be cleanly licensed, self-contained under `public/`, and decoupled from engine tooling styles/fonts or runtime network dependencies.

## Decision

1. **Open-Source Freedoom `0.13.0` Baseline:** Textures, flats, HUD/UI chrome, weapon/monster/item sprites, and SFX originate from the Freedoom project (Modified 3-clause BSD License), with SHA-256 provenance recorded in `raw/freedoom/MANIFEST.txt` (git-ignored) and full credits in `docs/REFERENCES.md`.
2. **Offline Bake Pipeline:** Sprites, composited WAD textures, and UI borders are converted offline to lossless WebP (`cwebp -lossless -q 100`). Freedoom MIDI music (`d_e1m1.mid`, `d_e1m2.mid`) is pre-rendered offline via General MIDI (`gs_instruments.dls`) into AAC `.m4a` (`96 kbps`) so browsers decode it natively via `AudioContext.decodeAudioData()` with no runtime MIDI/SoundFont bloat.
3. **Self-Contained Runtime Assets:** Only game-specific fonts (`Dungeon.woff2`, `VT323-Regular.woff2`) and game media live in `public/`; zero external CDNs or engine editor assets are loaded at runtime.

## Consequences

- Every asset in `public/` is legally redistributable, reproducible from `raw/`, and fast to load offline or in headless CI.
