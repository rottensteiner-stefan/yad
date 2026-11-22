# ADR 0002: Retro Render Pipeline & Zero-GC Hot Paths

> **Status:** Accepted

## Context

YAD targets authentic 1993 DOS aesthetics (`320×200` 16:10 proportions, crisp nearest-neighbor scaling, 256-color look) at a locked 60 FPS on consumer GPUs across WebGPU, WebGL2, and WebGL1.

## Decision

1. **Fixed 16:10 Virtual Viewport + Selectable Internal Resolution:** `#retro-screen` locks layout proportions at `320×200` (with a `32 px` bottom HUD bar and `320×168` 3D/weapon area) scaled to fit the window with `image-rendering: pixelated`. The 3D renderer backbuffer defaults to `320×200` (`1X DOS`) and scales live between `320×200`, `640×400`, `960×600`, and `1280×800` via Game Settings without altering HUD proportions.
2. **Tone Mapping & Color Quantization:** `AmbientLight` uses `Math.PI * levelBrightness` (compensating for the engine's `1/π` PBR irradiance normalization), `ToneMappingElement` forces `ACES_FILMIC` to preserve shadow detail, and `QuantizeElement` applies optional 8-step per-channel quantization.
3. **Zero-GC Frame Loops:** Hot paths (`App.update`, `Controller.update`, `EnemyBehavior.update`, `WadPhysics`, `WeaponView.update`) allocate no heap objects per frame — scratch vectors (`MathPool`, preallocated `Vector3D`), `Uint32Array` visit stamps, and direct 2D canvas transforms replace per-frame allocations and DOM style thrashing.

## Consequences

- Switching internal resolution is instantaneous and never shifts UI hitboxes or HUD scaling.
- Frame pacing stays free of garbage-collection stutters even on mobile/integrated GPUs.
