import { Events } from "./Events.js";
import { LevelBuilder } from "./core/LevelBuilder.js";
import { parseWadMap } from "./core/wad/WadParser.js";
import { WadLevelBuilder } from "./core/wad/WadLevelBuilder.js";
import type { WadManifest } from "./core/wad/WadLevelBuilder.js";
import { Controller } from "./core/behaviors/Controller.js";
import { loadGameSettings, RESOLUTION_DIMENSIONS } from "./core/GameSettings.js";
import type { GameSettingsData, LevelId } from "./core/GameSettings.js";
import { Hud } from "./core/Hud.js";
import { SettingsMenu } from "./core/SettingsMenu.js";
import { WeaponView } from "./core/WeaponView.js";
import {
  AmbientLight,
  BoundingBox,
  CameraStrategyType,
  Color,
  DirectionalLight,
  getRendererTypeFromQuery,
  MathUtils,
  PerspectiveProjection,
  PostProcessingEffectType,
  QuantizeElement,
  SmallWorldMachine,
  TextLoader,
  Texture,
  ToneMappingMode,
  Vector3D,
  ZoomController,
} from "@small-world-machine/engine";
import type {
  FluidSurfaceMaterial,
  PointLight,
  ToneMappingElement,
} from "@small-world-machine/engine";

/**
 * YAD (Yet Another Dungeon)
 * Building a grid-based level from a text file.
 */
export class App extends SmallWorldMachine {
  constructor() {
    // Same `?rendererType=` override as every showcase, so the smoke test can pin the backend (CI has no GPU).
    const rendererType = getRendererTypeFromQuery();
    super(rendererType ? { fullscreen: false, rendererType } : { fullscreen: false });
  }

  private _time: number = 0;
  private _lavaMaterials: FluidSurfaceMaterial[] = [];
  private _lavaLights: PointLight[] = [];
  private _hud!: Hud;
  private _weaponView!: WeaponView;
  private _playerController!: Controller;
  private _ambientLight!: AmbientLight;
  private _projection!: PerspectiveProjection;
  private _toneMapping?: ToneMappingElement | undefined;
  private _quantize?: QuantizeElement;
  private _settings: GameSettingsData = loadGameSettings();
  private _activeLevel: LevelId = this._settings.level;
  private _urlLevelOverride = false;
  private _settingsMenu?: SettingsMenu;

  public get hud(): Hud {
    return this._hud;
  }

  public get weaponView(): WeaponView {
    return this._weaponView;
  }

  public get settingsMenu(): SettingsMenu | undefined {
    return this._settingsMenu;
  }

  /** @inheritdoc */
  protected override async setupScene(): Promise<void> {
    // 0. Force Exact 16:10 Retro Viewport with Pillarboxing & Configurable 3D Render Resolution
    window.addEventListener("resize", (): void => this._applyRenderResolution());
    this._applyRenderResolution();

    // 1. Camera Setup
    this._projection = new PerspectiveProjection({
      fov: MathUtils.degToRad(this._settings.fov),
      aspect: this.camera.aspect,
      near: 0.1,
      far: 500,
    });
    this.camera.projection = this._projection;
    this.camera.updateProjectionMatrix();
    this.camera.setStrategy(CameraStrategyType.FPS);
    this.camera.phi = 0; // Look straight ahead

    // 1.5 Global Lights (Engine 0.128.0 divides PBR ambient irradiance by pi, so Math.PI gives unit ambient response)
    this._ambientLight = new AmbientLight({
      color: Color.WHITE,
      intensity: Math.PI * this._settings.levelBrightness,
    });
    this.scene.add(this._ambientLight);
    const sun: DirectionalLight = new DirectionalLight({ color: Color.WHITE, intensity: 0.6 });
    sun.direction.set(-1, -1, -1).normalize();
    this.scene.add(sun);

    // 2. Resolve active level (?level=grid|e1m1 override or saved GameSettings.level)
    const params = new URLSearchParams(window.location.search);
    const queryLevel = params.get("level");
    if (queryLevel === "e1m1" || queryLevel === "grid") {
      this._activeLevel = queryLevel;
      this._urlLevelOverride = true;
    } else {
      this._activeLevel = this._settings.level;
      this._urlLevelOverride = false;
    }

    // 3. Load Freedoom Audio & Level Music
    const audio = this.audio;
    await Promise.all([
      audio.load("/assets/sounds/door.wav", "door"),
      audio.load("/assets/sounds/door_close.wav", "door_close"),
      audio.load("/assets/sounds/secret_door.wav", "secret_door"),
      audio.load("/assets/sounds/locked.wav", "locked"),
      audio.load("/assets/sounds/lift.wav", "lift"),
      audio.load("/assets/sounds/switch.wav", "switch"),
      audio.load("/assets/sounds/enemy_grunt.wav", "enemy_grunt"),
      audio.load("/assets/sounds/enemy_death.wav", "enemy_death"),
      audio.load("/assets/sounds/pos_sight.wav", "pos_sight"),
      audio.load("/assets/sounds/pos_pain.wav", "pos_pain"),
      audio.load("/assets/sounds/spos_sight.wav", "spos_sight"),
      audio.load("/assets/sounds/spos_death.wav", "spos_death"),
      audio.load("/assets/sounds/imp_sight.wav", "imp_sight"),
      audio.load("/assets/sounds/imp_active.wav", "imp_active"),
      audio.load("/assets/sounds/imp_death.wav", "imp_death"),
      audio.load("/assets/sounds/demon_sight.wav", "demon_sight"),
      audio.load("/assets/sounds/demon_pain.wav", "demon_pain"),
      audio.load("/assets/sounds/demon_active.wav", "demon_active"),
      audio.load("/assets/sounds/demon_death.wav", "demon_death"),
      audio.load("/assets/sounds/shoot.wav", "shoot"),
      audio.load("/assets/sounds/punch.wav", "punch"),
      audio.load("/assets/sounds/saw_up.wav", "saw_up"),
      audio.load("/assets/sounds/saw_hit.wav", "saw_hit"),
      audio.load("/assets/sounds/shotgun.wav", "shotgun"),
      audio.load("/assets/sounds/rocket.wav", "rocket"),
      audio.load("/assets/sounds/explosion.wav", "explosion"),
      audio.load("/assets/sounds/plasma.wav", "plasma"),
      audio.load("/assets/sounds/footstep.wav", "footstep"),
      audio.load("/assets/sounds/hurt.wav", "hurt"),
      audio.load("/assets/sounds/player_death.wav", "player_death"),
      audio.load("/assets/sounds/pickup.wav", "pickup"),
      audio.load("/assets/sounds/weapon_pickup.wav", "weapon_pickup"),
      audio.load("/assets/sounds/menu_open.wav", "menu_open"),
      audio.load("/assets/sounds/menu_close.wav", "menu_close"),
      audio.load("/assets/sounds/menu_move.wav", "menu_move"),
    ]);

    const musicUrl =
      this._activeLevel === "e1m1" ? "/assets/music/e1m1.m4a" : "/assets/music/grid.m4a";
    let musicLoaded = false;
    try {
      await audio.load(musicUrl, "level_music");
      musicLoaded = true;
    } catch (err: unknown) {
      console.warn("[YAD] Failed to load level music, falling back to ambient drone:", err);
    }

    // 4. Initialize Weapon View & HUD early so WAD doors/pickups can query keycards
    const retroScreen = document.getElementById("retro-screen") ?? document.body;
    this._weaponView = new WeaponView({
      parent: retroScreen,
      events: this.events,
    });
    this._hud = new Hud(this.events, this._weaponView);

    let octreeBoundsMin = new Vector3D(-200, -50, -200);
    let octreeBoundsMax = new Vector3D(200, 100, 200);

    if (this._activeLevel === "e1m1") {
      const [wadResp, manifestResp] = await Promise.all([
        fetch("/assets/wad/e1m1.wad"),
        fetch("/assets/wad/e1m1_manifest.json"),
      ]);
      if (!wadResp.ok) throw new Error(`Failed to fetch E1M1 WAD: ${wadResp.status}`);
      if (!manifestResp.ok) throw new Error(`Failed to fetch E1M1 manifest: ${manifestResp.status}`);

      const wadBuffer = await wadResp.arrayBuffer();
      const manifest = (await manifestResp.json()) as WadManifest;
      const map = parseWadMap(wadBuffer, "E1M1");

      const wadBuilder = new WadLevelBuilder();
      const wadResult = await wadBuilder.build(this.scene, map, manifest, {
        playerCamera: this.camera,
        audio: this.audio,
        events: this.events,
        isPaused: (): boolean => this._settingsMenu?.isOpen ?? false,
        hasKeycard: (color): boolean => this._hud.hasKeycard(color),
        onExit: (): void => window.location.reload(),
      });

      this.camera.position.copyFrom(wadResult.playerStart);
      this.camera.theta = wadResult.playerTheta;
      octreeBoundsMin = wadResult.boundsMin;
      octreeBoundsMax = wadResult.boundsMax;

      this._playerController = new Controller(this.events, {
        moveSpeed: 10.0,
        retroTankControls: this._settings.tankControls,
        scene: this.scene,
        input: this.input,
        audio: this.audio,
        wadPhysics: wadResult.physics,
        hasAmmo: (type): boolean => this._hud.getAmmo(type) > 0,
      });
    } else {
      // Classic YAD Grid Level
      const wallTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/textures/brbrick.webp", {
        flipY: true,
      });
      const floorTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/textures/flat1_1.webp", {
        flipY: true,
      });
      const ceilTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/textures/ceil3_5.webp", {
        flipY: true,
      });
      const slimeTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/textures/slime01.webp", {
        flipY: true,
      });
      const secretFloorTex: Texture = await Texture.fromUrl(
        "/assets/dungeon_pack/textures/flat5_4.webp",
        {
          flipY: true,
        },
      );
      const secretCeilTex: Texture = await Texture.fromUrl(
        "/assets/dungeon_pack/textures/ceil1_1.webp",
        {
          flipY: true,
        },
      );

      const lavaNoise: Texture = await Texture.fromUrl("/assets/textures/lava.webp", {
        flipY: true,
      });
      const lavaNorm: Texture = await Texture.fromUrl("/assets/textures/lava_normal.webp", {
        generateMipmaps: true,
      });

      const barrelTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/bar1a0.webp", {
        flipY: true,
      });
      const torchTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/firea0.webp", {
        flipY: true,
      });
      const doorTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/textures/door9_1.webp", {
        flipY: true,
      });
      const secretDoorTex: Texture = await Texture.fromUrl(
        "/assets/dungeon_pack/textures/brbrick.webp",
        {
          flipY: true,
        },
      );
      const enemyTex: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/possa1.webp", {
        flipY: true,
      });
      const itemTexArmor: Texture = await Texture.fromUrl(
        "/assets/dungeon_pack/sprites/bon2a0.webp",
        {
          flipY: true,
        },
      );
      const itemTexHealth: Texture = await Texture.fromUrl(
        "/assets/dungeon_pack/sprites/bon1a0.webp",
        {
          flipY: true,
        },
      );
      const itemTexShotgun: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/shota0.webp", { flipY: true });
      const itemTexChaingun: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/mguna0.webp", { flipY: true });
      const itemTexRocket: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/launa0.webp", { flipY: true });
      const itemTexPlasma: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/plasa0.webp", { flipY: true });
      const itemTexChainsaw: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/csawa0.webp", { flipY: true });
      const itemTexShellBox: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/sboxa0.webp", { flipY: true });
      const itemTexBlueKey: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/bkeya0.webp", { flipY: true });
      const itemTexYellowKey: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/ykeya0.webp", { flipY: true });
      const itemTexRedKey: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/rkeya0.webp", { flipY: true });
      const itemTexBlueSkull: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/bskua0.webp", { flipY: true });
      const itemTexYellowSkull: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/yskua0.webp", { flipY: true });
      const itemTexRedSkull: Texture = await Texture.fromUrl("/assets/dungeon_pack/sprites/rskua0.webp", { flipY: true });

      let mapData = localStorage.getItem("yad_custom_map");
      if (!mapData) {
        const loader: TextLoader = new TextLoader();
        mapData = await loader.load("/assets/levels/level1.txt");
      }

      const builder: LevelBuilder = new LevelBuilder();
      const { playerStart, lavaMaterials, lavaLights, hazardGrid } = await builder.build(
        this.scene,
        mapData,
        {
          floorTexture: floorTex,
          ceilingTexture: ceilTex,
          lavaNoiseMap: lavaNoise,
          lavaNormalMap: lavaNorm,
          playerCamera: this.camera,
          audio: this.audio,
          events: this.events,
          isPaused: (): boolean => this._settingsMenu?.isOpen ?? false,
          lavaFloorChars: ["T"],
          slimeFloorChars: ["~"],
          legend: {
            W: { type: "wall", texture: wallTex },
            G: { type: "wall", texture: wallTex },
            c: { type: "column", texture: wallTex },
            "+": { type: "door", texture: doorTex, doorSound: "door" },
            O: { type: "door", texture: secretDoorTex, doorSound: "secret_door" },
            P: { type: "playerSpawn" },
            b: { type: "sprite", texture: barrelTex, spriteScale: 1.5, spriteY: 0.8 },
            E: { type: "sprite", texture: enemyTex, spriteScale: 2.0, spriteY: 0.85, isEnemy: true },
            1: {
              type: "sprite",
              texture: itemTexHealth,
              spriteScale: 0.8,
              spriteY: 0.6,
              isItem: true,
              itemType: "health",
              bobbing: true,
            },
            2: {
              type: "sprite",
              texture: itemTexArmor,
              spriteScale: 0.8,
              spriteY: 0.6,
              isItem: true,
              itemType: "armor",
              bobbing: true,
            },
            3: {
              type: "sprite",
              texture: itemTexShotgun,
              spriteScale: 1.0,
              spriteY: 0.6,
              isItem: true,
              itemType: "weapon",
              weaponId: "shotgun",
              ammoType: "shel",
              itemAmount: 8,
              pickupSound: "weapon_pickup",
              bobbing: true,
            },
            4: {
              type: "sprite",
              texture: itemTexChaingun,
              spriteScale: 1.0,
              spriteY: 0.6,
              isItem: true,
              itemType: "weapon",
              weaponId: "chaingun",
              ammoType: "bull",
              itemAmount: 20,
              pickupSound: "weapon_pickup",
              bobbing: true,
            },
            5: {
              type: "sprite",
              texture: itemTexRocket,
              spriteScale: 1.0,
              spriteY: 0.6,
              isItem: true,
              itemType: "weapon",
              weaponId: "rocket",
              ammoType: "rckt",
              itemAmount: 4,
              pickupSound: "weapon_pickup",
              bobbing: true,
            },
            6: {
              type: "sprite",
              texture: itemTexPlasma,
              spriteScale: 1.0,
              spriteY: 0.6,
              isItem: true,
              itemType: "weapon",
              weaponId: "plasma",
              ammoType: "cell",
              itemAmount: 40,
              pickupSound: "weapon_pickup",
              bobbing: true,
            },
            7: {
              type: "sprite",
              texture: itemTexChainsaw,
              spriteScale: 1.0,
              spriteY: 0.6,
              isItem: true,
              itemType: "weapon",
              weaponId: "chainsaw",
              itemAmount: 0,
              pickupSound: "weapon_pickup",
              bobbing: true,
            },
            a: {
              type: "sprite",
              texture: itemTexShellBox,
              spriteScale: 0.8,
              spriteY: 0.55,
              isItem: true,
              itemType: "ammo",
              ammoType: "shel",
              itemAmount: 20,
              bobbing: true,
            },
            k: {
              type: "sprite",
              texture: itemTexBlueKey,
              spriteScale: 0.75,
              spriteY: 0.6,
              isItem: true,
              itemType: "keycard",
              itemColor: "blue",
              itemAmount: 1,
              bobbing: true,
            },
            y: {
              type: "sprite",
              texture: itemTexYellowKey,
              spriteScale: 0.75,
              spriteY: 0.6,
              isItem: true,
              itemType: "keycard",
              itemColor: "yellow",
              itemAmount: 1,
              bobbing: true,
            },
            r: {
              type: "sprite",
              texture: itemTexRedKey,
              spriteScale: 0.75,
              spriteY: 0.6,
              isItem: true,
              itemType: "keycard",
              itemColor: "red",
              itemAmount: 1,
              bobbing: true,
            },
            K: {
              type: "sprite",
              texture: itemTexBlueSkull,
              spriteScale: 0.75,
              spriteY: 0.6,
              isItem: true,
              itemType: "keycard",
              itemColor: "blue_skull",
              itemAmount: 1,
              bobbing: true,
            },
            Y: {
              type: "sprite",
              texture: itemTexYellowSkull,
              spriteScale: 0.75,
              spriteY: 0.6,
              isItem: true,
              itemType: "keycard",
              itemColor: "yellow_skull",
              itemAmount: 1,
              bobbing: true,
            },
            R: {
              type: "sprite",
              texture: itemTexRedSkull,
              spriteScale: 0.75,
              spriteY: 0.6,
              isItem: true,
              itemType: "keycard",
              itemColor: "red_skull",
              itemAmount: 1,
              bobbing: true,
            },
            l: {
              type: "sprite",
              texture: torchTex,
              spriteScale: 1.0,
              spriteY: 1.5,
              lightColor: new Color(1, 0.793, 0.481),
              lightIntensity: 3.0,
            },
            S: { type: "lavaBall" },
            "~": { type: "floor", texture: slimeTex, ceilingTexture: ceilTex },
            X: { type: "floor", texture: secretFloorTex, ceilingTexture: secretCeilTex },
          },
        },
      );

      this._lavaMaterials = lavaMaterials;
      this._lavaLights = lavaLights;
      this.camera.position.copyFrom(playerStart);

      this._playerController = new Controller(this.events, {
        moveSpeed: 10.0,
        retroTankControls: this._settings.tankControls,
        scene: this.scene,
        input: this.input,
        audio: this.audio,
        hazardGrid,
        hasAmmo: (type): boolean => this._hud.getAmmo(type) > 0,
      });
    }

    // Start Freedoom level soundtrack on first user gesture (with drone fallback)
    let musicStarted = false;
    const startMusicOnce = (): void => {
      if (musicStarted) return;
      musicStarted = true;
      audio.resume();
      if (musicLoaded) {
        audio.playMusic("level_music", true, 0.5);
      } else {
        audio.startDrone();
      }
    };
    document.addEventListener("click", startMusicOnce, { once: true });
    window.addEventListener("keydown", startMusicOnce, { once: true });

    let playerDead = false;
    this.events.addEventListener(Events.DAMAGE, (): void => {
      if (!playerDead && this._hud.health <= 0) {
        playerDead = true;
        this.audio.play("player_death", false, 0.8);
      }
    });

    // 5. Controllers
    this.camera.addBehavior(this._playerController);
    this.camera.addBehavior(new ZoomController({ input: this.input }));

    // 6. Final Scene Prep
    this.scene.update(); // Update all world matrices first
    this.scene.initOctrees(new BoundingBox(octreeBoundsMin, octreeBoundsMax));
    this.scene.updateStaticOctree();
    this.debug = false; // Disable visual debugging for collisions by default

    // 8. Apply Retro Color Banding (Quantization)
    if (this.renderer) {
      this.renderer.postProcessing.enabled = true;
      this._toneMapping = this.renderer.postProcessing.get<ToneMappingElement>(
        PostProcessingEffectType.TONE_MAPPING,
      );
      if (this._toneMapping) {
        this._toneMapping.mode = ToneMappingMode.ACES_FILMIC;
      }
      this._quantize = new QuantizeElement();
      this._quantize.enabled = this._settings.retroQuantize;
      this._quantize.steps = 8.0; // 8 levels per RGB channel (3-bit color approximation)
      this.renderer.postProcessing.add(this._quantize);
    }

    // 9. Initialize Doom-style Game Settings Overlay
    this._settingsMenu = new SettingsMenu({
      parent: retroScreen,
      initialSettings: this._settings,
      onChange: (next): void => this._applySettings(next),
      onSound: (kind): void => {
        if (this.audio.context.state === "running") {
          const cue =
            kind === "open" ? "menu_open" : kind === "close" ? "menu_close" : "menu_move";
          this.audio.play(cue, false, 0.55);
        }
      },
      onRestartLevel: (): void => {
        window.location.reload();
      },
      onOpenChange: (isOpen): void => {
        if (this._playerController) {
          this._playerController.enabled = !isOpen;
        }
        if (this._weaponView) {
          this._weaponView.setCrosshairMode(this._settings.crosshair, isOpen);
        }
        this.input.preventPointerLock = isOpen;
        if (isOpen && typeof document !== "undefined" && document.pointerLockElement) {
          document.exitPointerLock();
        }
      },
    });
    this._applySettings(this._settings);
  }

  private _applyRenderResolution(): void {
    const dims = RESOLUTION_DIMENSIONS[this._settings.resolution];
    this.camera.aspect = dims.width / dims.height;
    this.camera.updateProjectionMatrix();

    if (this.renderer) {
      const maxRatio = this.renderer.quality.maxPixelRatio ?? 2;
      const d = Math.min(window.devicePixelRatio || 1, maxRatio);
      this.renderer.setSize(dims.width / d, dims.height / d);
    }

    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.objectFit = "fill";
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.backgroundColor = "transparent";

    const retroScreen = document.getElementById("retro-screen");
    if (retroScreen) {
      const scale = Math.min(window.innerWidth / 320, window.innerHeight / 200);
      retroScreen.style.width = "320px";
      retroScreen.style.height = "200px";
      retroScreen.style.transform = `translate(-50%, -50%) scale(${scale})`;
      retroScreen.style.transformOrigin = "center center";
    }
  }

  private _applySettings(next: GameSettingsData): void {
    const levelChanged = next.level !== this._activeLevel;
    const resolutionChanged = next.resolution !== this._settings.resolution;
    this._settings = next;
    if (levelChanged && !this._urlLevelOverride) {
      window.location.reload();
      return;
    }
    if (resolutionChanged) {
      this._applyRenderResolution();
    }
    if (this._ambientLight) {
      this._ambientLight.intensity = Math.PI * next.levelBrightness;
    }
    if (this._toneMapping) {
      this._toneMapping.exposure = next.overallBrightness;
    }
    if (this._quantize) {
      this._quantize.enabled = next.retroQuantize;
    }
    if (this._projection) {
      this._projection.fov = MathUtils.degToRad(next.fov);
      this.camera.updateProjectionMatrix();
    }
    if (this._playerController) {
      this._playerController.retroTankControls = next.tankControls;
    }
    if (this._weaponView) {
      this._weaponView.viewBobbing = next.viewBobbing;
      this._weaponView.setCrosshairMode(next.crosshair, this._settingsMenu?.isOpen ?? false);
    }
    this.audio.setMasterVolume(next.masterVolume);
    this.audio.setSFXVolume(next.sfxVolume);
    this.audio.setMusicVolume(next.musicVolume);
    this.audio.setReverbLevel(next.reverbLevel);
  }

  /** @inheritdoc */
  protected override update(deltaTime: number): void {
    if (this._settingsMenu?.isOpen) {
      this.audio.updateListener(this.camera);
      return;
    }

    this._time += deltaTime;
    for (const mat of this._lavaMaterials) {
      mat.time = this._time;
    }
    for (let l = 0; l < this._lavaLights.length; l++) {
      const light = this._lavaLights[l]!;
      const pulse = Math.sin(this._time * 2.1 + l) * 0.5 + 0.5;
      light.intensity = 3.0 + pulse * 2.0;
    }

    if (this._weaponView && this._playerController) {
      this._weaponView.update(deltaTime, this._playerController.bobPhase);
    }

    this.audio.updateListener(this.camera);
  }
}

if (typeof window !== "undefined") {
  const app: App = new App();
  app.start().catch((err: unknown) => console.error("[YAD] Failed to start:", err));
}
