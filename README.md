# YAD — Yet Another Dungeon

A retro first-person dungeon crawler (Freedoom `E1M1` WAD + classic ASCII grid, 7 weapons, 6 keycards/skull keys, Freedoom SFX &amp; soundtrack, live Game Settings). A standalone project: it **uses** [Small World Machine](https://github.com/rottensteiner-stefan/small-world-machine) like any third party would, as a versioned npm package through its public API only. This repo contains no engine source.

## Engine Dependency

`@small-world-machine/engine` is installed from the engine repo's GitHub release (URL dependency in `package.json`, currently `packages-0.129.0`). Import from the package root only; never from internal paths. If the project needs something the public API does not expose, update the engine, cut a new release, point the URL in `package.json` at it, and run `npm install && npm run typecheck && npm test`.

## Setup

```sh
git clone <this repo>
git lfs pull
npm install
```

## Commands

Commands can be invoked either via `make` or directly via `npm`:

| Make Target | NPM Equivalent | Purpose |
| :--- | :--- | :--- |
| `make dev` / `make start` | `npm run dev` | Start Vite dev server |
| `make restart` | — | Kill blocked Vite ports and restart dev server |
| `make kill` | `npm run kill:vite` | Terminate processes on Vite ports (5173–5185) |
| `make check` | — | Run all gates sequentially (`typecheck`, `test`, `build`) |
| `make typecheck` | `npm run typecheck` | `tsc --noEmit` over `src/**` and `tests/**` |
| `make test` | `npm test` | Vitest run (`tests/**/*.test.ts`) |
| `make test-watch` | `npm run test:watch` | Vitest interactive watch mode |
| `make build` | `npm run build` | Production bundle into `dist/` |
| `make preview` | `npm run preview` | Preview production build |
| `make clean` | — | Remove `dist/` build artifacts |
| `make fclean` | — | Remove `dist/` and `node_modules/` |


## Layout

- `src/` — game code: `App.ts`, `Events.ts`, `index.html`, `core/` (WAD parser/physics/builder, ASCII `LevelBuilder`, `Hud`, `WeaponConfig`/`WeaponView`, `GameSettings`/`SettingsMenu`, `behaviors/`), `enums/`, `types/`
- `tests/` — Vitest suite (`setup.ts`, `core/`)
- `public/` — standalone runtime assets: `assets/dungeon_pack/`, `assets/wad/`, `assets/levels/`, `assets/textures/`, `assets/sounds/`, `assets/music/`, `assets/fonts/`
- `docs/` — `log.md` (living dev log), `concept-dossier.html`, `adr/` (YAD ADRs), `REFERENCES.md` (asset credits)
- `app.json` — app manifest
