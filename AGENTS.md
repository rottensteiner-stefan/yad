# YAD — AI Agent Instructions & Guidelines

**Context:** YAD (Yet Another Dungeon) is a retro first-person grid-crawler dungeon game built on top of Small World Machine.
It is a **standalone project** consuming the engine as a versioned package (pinned GitHub release URL in `package.json`), exactly as a third party would.

## 1. Project Structure

```text
yad/
├── .agents/                      # Local agent working material (git-ignored)
│   ├── MEMORY.md                 # Architecture memory & invariants
│   ├── BACKLOG.md                # Chronological append-only task journal
│   ├── skills/                   # Local agent skills (coding-guide, collaborate, etc.)
│   └── scratches/                # Temporary scratch scripts
├── docs/                         # Documentation & specifications
│   ├── log.md                    # Living dev log (primary session memory)
│   ├── concept-dossier.html      # Visual concept & design dossier
│   ├── adr/                      # Architecture Decision Records
│   └── REFERENCES.md             # Third-party asset credits & licenses
├── public/                       # Standalone runtime assets (served as-is)
│   ├── assets/                   # Dungeon pack, levels, sounds, textures, fonts
│   └── favicon.webp              # Game icon
├── src/                          # Game source code
│   ├── core/                     # Game mechanics (Map, Player, Hud, Weapons, Enemies)
│   ├── enums/                    # Game-specific enumerations
│   ├── types/                    # Vite and TypeScript environment shims
│   ├── App.ts                    # Main game bootstrapping & lifecycle
│   └── index.html                # Vite entry point
├── tests/                        # Test suite
│   ├── setup.ts                  # Vitest browser environment mocks
│   └── core/                     # Unit and behavior tests
├── AGENTS.md                     # Agent guidance and workflow instructions
├── CLAUDE.md                     # Legacy agent pointer
├── app.json                      # ADR 0001 (vormals Engine-ADR 0041) game manifest
├── package.json                  # Pinned engine release dependency
├── tsconfig.json                 # Strict TypeScript configuration
└── vite.config.ts                # Vite & Vitest configuration
```

## 2. Hard Architectural Rules

- **Engine Boundary:** Import only from `@small-world-machine/engine`. No deep imports, no engine source paths, never edit `node_modules`. Missing engine capabilities must be added to the engine repo, released, and taken in by bumping the release URL.
- **Strict TypeScript:** Explicit types and access modifiers, **no `any`**.
- **Zero-GC Hot Paths:** Frame loops (`update(dt)`) must not allocate heap memory. Pool scratch vectors and reuse TypedArrays.
- **Right-Handed Coordinate System:** `+X = Right`, `+Y = Up`, `+Z = Backward` (`-Z = Forward/Front`).
- **Simplicity:** No preemptive abstraction. Fail fast at subsystem intake, never in intermediate property setters.
- **Asset Independence:** `public/` contains only game-specific assets and fonts (Dungeon, VT323). Do not introduce engine tooling styles or fonts.

## 3. Workflow & Verification

- **Language Standard:** User chat is in German. All documentation, `.agents/MEMORY.md`, `.agents/BACKLOG.md`, code comments, and commit messages are in **compact, high-density technical English**.
- **Surgical Edits:** Use surgical replacements for existing files. Never rewrite intact files.
- **Verification Commands:**
  - `npm run typecheck`: Type check via `tsc --noEmit`.
  - `npm test`: Run test suite via Vitest.
  - `npm run build`: Production client bundle via Vite.
- **Git Cadence:** Commit when a milestone or feature is cohesively rounded off. Commit message must be a unique quote without prefixes.

## 4. Project Memory

- `docs/log.md`: Living dev log. Read latest entries at session start, append an entry at session end.
- `docs/concept-dossier.html`: Visual concept & design spec.
- `docs/adr/`: Architecture Decision Records (ADRs).
- `docs/REFERENCES.md`: Complete asset credits (DooM font, textures, sound effects).
- `.agents/MEMORY.md`: Local persistent architecture memory.
- `.agents/BACKLOG.md`: Chronological task backlog.
- `../CLAUDE.md` (workspace folder, outside this repo — local-only, may be missing on a fresh clone): Shared context for the Small World Machine repo family (engine, standalone app repos, `small-world-machine-assets`) and cross-repo rules. Not this repo's own `CLAUDE.md`; this `AGENTS.md` takes precedence on conflict.

## 5. Local Skills

Detailed coding standards, formatting, and multi-agent protocols are located under `.agents/skills/`:
- `coding-guide`: Game application TypeScript templates, guard clauses, engine boundary rules, and zero-allocation hot-path rules.
- `changelog`: Poetic quote commit standards and CHANGELOG.md formatting rules.
- `collaborate`: Multi-agent problem-solving and deliberation protocol with parallel sub-agents (`collab.mjs`).
- `deslop`: Anti-AI-slop filter and code cleanup.
- `maintain-references`: Documenting third-party assets, audio, and licenses in `docs/REFERENCES.md`.
- `check-compiler-errors`: Typecheck diagnostics and compiler error summaries.
- `vision-image`: "Synthetic eyes" for text-only models to inspect screenshots, dungeon rendering, and textures.
- `thermo-nuclear-code-quality-review-revised`: Strict maintainability, abstraction quality, and anti-spaghetti audit.
- `reset-vite`: Frees occupied Vite ports (`npm run kill:vite`).
- `session-mailbox`: Coordination between concurrent agent sessions in the same working tree (`mailbox.mjs`).
