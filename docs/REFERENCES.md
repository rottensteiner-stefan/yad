# References & Credits

Sources, authors and licenses of third-party assets used in this project.

### Dungeon Font (Yet Another Dungeon HUD)

- **File:** `public/assets/fonts/Dungeon.woff2`
- **Source:** [DooM Font on DaFont](https://www.dafont.com/doom.font)
- **Usage:** Used to render the iconic red numbers and UI text in YAD (Yet Another Dungeon). A huge thanks to the unknown author who originally created and shared this authentic font replica (embedded in the repo as WOFF2)!
  _Note: While the project uses the name "Yet Another Dungeon" (YAD), its aesthetic is deeply inspired by the legendary DOOM (1993)._

### Retro Dungeon Texture, Sprite & Sound Pack (Freedoom)

- **Files:** `public/assets/dungeon_pack/` (textures & sprites), `public/assets/sounds/` (audio effects)
- **Source:** [Freedoom Project](https://freedoom.github.io/) / [GitHub Repository](https://github.com/freedoom/freedoom) (Commit `e61c4f86722259ba9f410567156d958c712584a2`)
- **License:** [Modified 3-clause BSD License](https://github.com/freedoom/freedoom/blob/master/COPYING.adoc) (Free & Open Source Software, Permissive).
- **Authors & Contributors:** Full contributor list preserved in `raw/freedoom/CREDITS` (including contributors to sprites, textures, sounds, and flats).
- **RAW Storage & Provenance (ADR 0058):**
  - **Local Staging:** `raw/freedoom/` (git-ignored, contains original uncompressed PNGs, WAVs, license and credits).
  - **Durable Backup:** Google Drive `Small-World-Machine/yad/raw/freedoom/` accompanied by `MANIFEST.txt` with SHA-256 hashes.
  - **Derivation:** Lossless WebP conversion via `cwebp -lossless -q 100`. Face atlas `dungeonguy.webp` assembled from individual status bar face frames (`stfst00`–`stfst40`, `stfdead0`).
  - **UI Chrome & Menu Audio (`0.13.0`):** `public/assets/dungeon_pack/ui/` (`brdr_*`, `m_therm*`, `m_ls*`, `m_skull1`, `m_skull2`, `pause`, `stkeys0..5`) and `public/assets/sounds/menu_{open,close,move}.wav` (`dsswtchn`, `dsswtchx`, `dspstop`) derived from `raw/freedoom-0.13.0-source.zip`.
  - **Weapons, Pickups & Combat Audio (`0.13.0`):** First-person and world pickup sprites for Fist (`pung*`), Chainsaw (`sawg*`, `csawa0`), Pistol (`pisg*`), Shotgun (`shtg*`, `shtf*`, `shota0`), Chaingun (`chgg*`, `chgf*`, `mguna0`), Rocket Launcher (`misg*`, `misf*`, `launa0`), Plasma Rifle (`plsg*`, `plsf*`, `plasa0`), Keycards & Skull Keys (`{b,y,r}key*`, `{b,y,r}sku*`), plus combat/pickup sounds (`punch.wav`, `saw_up.wav`, `saw_hit.wav`, `shotgun.wav`, `rocket.wav`, `plasma.wav`, `weapon_pickup.wav`) derived from `raw/freedoom-0.13.0-source.zip`.
  - **WAD Map & Composited Textures (`0.13.0`):** `public/assets/wad/e1m1.wad`, `public/assets/wad/e1m1_manifest.json`, and lossless WebP textures/flats/sprites (`public/assets/wad/{textures,flats,sprites}/`) composited from `raw/freedoom-0.13.0-source.zip` (`levels/e1m1.wad`, `lumps/textures/textures.cfg`, `patches/`, `flats/`, `sprites/`).
  - **Full Soundscape & Soundtrack (`0.13.0`):**
    - `public/assets/sounds/` (enemy cues `pos_sight`, `pos_pain`, `spos_sight`, `spos_death`, `imp_sight`, `imp_active`, `imp_death`, `demon_sight`, `demon_pain`, `demon_active`, `demon_death`, plus `explosion`, `player_death`, `locked`, `lift`, `switch`, `door_close`, `secret_door`) copied from Freedoom `0.13.0` `sounds/ds*.wav`.
    - `public/assets/music/e1m1.m4a` (`musics/d_e1m1.mid`) and `public/assets/music/grid.m4a` (`musics/d_e1m2.mid`), offline-rendered via macOS CoreAudio `kAudioUnitSubType_DLSSynth` (`gs_instruments.dls` General MIDI bank) and encoded to AAC (`96 kbps` M4A via `afconvert`).

