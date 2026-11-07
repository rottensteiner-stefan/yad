# YAD — Yet Another Dungeon

A first-person grid-crawler (health, armor, weapons, enemies, doors, lava). A standalone project: it **uses**
[Small World Machine](https://github.com/rottensteiner-stefan/small-world-machine) like any third party would, as a
versioned npm package through its public API only. This repo contains no engine source.

## Engine dependency

`@small-world-machine/engine` is installed from the engine repo's GitHub release (URL dependency in `package.json`,
currently `packages-0.122.0`). Import from the package root only; never from internal paths. If the project needs something
the public API does not expose, change the engine and take a new release (point the URL in `package.json` at it,
`npm install`, `npm run typecheck && npm test`).

## Setup

```sh
git clone <this repo>
git lfs pull
npm install
```

## Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | `tsc --noEmit` over `src/**` and `tests/**` |
| `npm test` | Vitest, `tests/**/*.test.ts` |

## Layout

- `src/` — the game: `App.ts`, `Events.ts`, `index.ts`, `core/` (level builder, HUD, behaviors), `enums/`, `types/`, `index.html`
- `tests/` — Vitest suite (`setup.ts`, `core/`)
- `public/` — runtime assets (Git LFS): `assets/dungeon_pack/`, `assets/levels/`, `assets/textures/`, `assets/sounds/`, `assets/fonts/`, shared CSS
- `docs/` — `log.md` (living dev log), `concept-dossier.html`, `adr/` (ADRs), `REFERENCES.md` (asset credits)
- `app.json` — app manifest
