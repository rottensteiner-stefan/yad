# References & Credits

Sources, authors and licenses of third-party assets used in this project.

### Dungeon Font (Yet Another Dungeon HUD)

- **File:** `public/assets/fonts/Dungeon.woff2`
- **Source:** [DooM Font auf DaFont](https://www.dafont.com/doom.font)
- **Usage:** Used to render the iconic red numbers and UI text in YAD (Yet Another Dungeon). A huge thanks to the unknown author who originally created and shared this authentic font replica (im Repo als WOFF2 eingebettet)!
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
  - **UI Chrome & Menu Audio (`0.13.0`):** `public/assets/dungeon_pack/ui/` (`brdr_*`, `m_therm*`, `m_ls*`, `m_skull1`, `m_skull2`, `pause`, `stkeys0..2`) and `public/assets/sounds/menu_{open,close,move}.wav` (`dsswtchn`, `dsswtchx`, `dspstop`) derived from `raw/freedoom-0.13.0-source.zip`.
