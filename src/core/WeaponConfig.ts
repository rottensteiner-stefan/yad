export type AmmoType = "bull" | "shel" | "rckt" | "cell";

export type WeaponId =
  | "fist"
  | "chainsaw"
  | "pistol"
  | "shotgun"
  | "chaingun"
  | "rocket"
  | "plasma";

export type KeyId =
  | "blue"
  | "yellow"
  | "red"
  | "blue_skull"
  | "yellow_skull"
  | "red_skull";

export type KeyColor = "blue" | "yellow" | "red";

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly slot: number;
  readonly name: string;
  readonly ammoType: AmmoType | null;
  readonly ammoPerShot: number;
  readonly cooldownMs: number;
  readonly animDurationMs: number;
  readonly damage: number;
  readonly pellets: number;
  readonly spreadRad: number;
  readonly range: number;
  readonly splashRadius: number;
  readonly sound: string;
  readonly frames: readonly string[];
  readonly flashFrames: readonly string[];
  readonly flashOffsetX: number;
  readonly flashOffsetY: number;
  readonly flashOverlay: boolean;
}

export const AMMO_MAX: Readonly<Record<AmmoType, number>> = {
  bull: 200,
  shel: 50,
  rckt: 50,
  cell: 300,
};

export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  fist: {
    id: "fist",
    slot: 1,
    name: "Fist",
    ammoType: null,
    ammoPerShot: 0,
    cooldownMs: 420,
    animDurationMs: 360,
    damage: 15,
    pellets: 1,
    spreadRad: 0,
    range: 2.6,
    splashRadius: 0,
    sound: "punch",
    frames: ["punga0", "pungb0", "pungc0", "pungd0", "pungc0"],
    flashFrames: [],
    flashOffsetX: 0,
    flashOffsetY: 0,
    flashOverlay: false,
  },
  chainsaw: {
    id: "chainsaw",
    slot: 1,
    name: "Chainsaw",
    ammoType: null,
    ammoPerShot: 0,
    cooldownMs: 140,
    animDurationMs: 140,
    damage: 18,
    pellets: 1,
    spreadRad: 0.02,
    range: 2.8,
    splashRadius: 0,
    sound: "saw_hit",
    frames: ["sawga0", "sawgc0", "sawgd0", "sawgb0"],
    flashFrames: [],
    flashOffsetX: 0,
    flashOffsetY: 0,
    flashOverlay: false,
  },
  pistol: {
    id: "pistol",
    slot: 2,
    name: "Pistol",
    ammoType: "bull",
    ammoPerShot: 1,
    cooldownMs: 420,
    animDurationMs: 400,
    damage: 15,
    pellets: 1,
    spreadRad: 0,
    range: 200,
    splashRadius: 0,
    sound: "shoot",
    frames: ["pisga0", "pisgb0", "pisgc0", "pisgd0", "pisge0"],
    flashFrames: ["pisfa0"],
    flashOffsetX: -10,
    flashOffsetY: 20,
    flashOverlay: false,
  },
  shotgun: {
    id: "shotgun",
    slot: 3,
    name: "Shotgun",
    ammoType: "shel",
    ammoPerShot: 1,
    cooldownMs: 780,
    animDurationMs: 740,
    damage: 12,
    pellets: 6,
    spreadRad: 0.085,
    range: 140,
    splashRadius: 0,
    sound: "shotgun",
    frames: ["shtga0", "shtgb0", "shtgc0", "shtgd0", "shtgc0"],
    flashFrames: ["shtfa0", "shtfb0"],
    flashOffsetX: 0,
    flashOffsetY: 32,
    flashOverlay: false,
  },
  chaingun: {
    id: "chaingun",
    slot: 4,
    name: "Chaingun",
    ammoType: "bull",
    ammoPerShot: 1,
    cooldownMs: 120,
    animDurationMs: 120,
    damage: 15,
    pellets: 1,
    spreadRad: 0.035,
    range: 200,
    splashRadius: 0,
    sound: "shoot",
    frames: ["chgga0", "chggb0", "chgga0", "chggb0"],
    flashFrames: ["chgfa0", "chgfb0"],
    flashOffsetX: 0,
    flashOffsetY: 18,
    flashOverlay: false,
  },
  rocket: {
    id: "rocket",
    slot: 5,
    name: "Rocket Launcher",
    ammoType: "rckt",
    ammoPerShot: 1,
    cooldownMs: 650,
    animDurationMs: 560,
    damage: 100,
    pellets: 1,
    spreadRad: 0,
    range: 220,
    splashRadius: 5.5,
    sound: "rocket",
    frames: ["misga0", "misgb0", "misgb0", "misga0"],
    flashFrames: ["misfa0", "misfb0", "misfc0", "misfd0"],
    flashOffsetX: 0,
    flashOffsetY: 36,
    flashOverlay: false,
  },
  plasma: {
    id: "plasma",
    slot: 6,
    name: "Plasma Rifle",
    ammoType: "cell",
    ammoPerShot: 1,
    cooldownMs: 125,
    animDurationMs: 125,
    damage: 32,
    pellets: 1,
    spreadRad: 0.015,
    range: 200,
    splashRadius: 0,
    sound: "plasma",
    frames: ["plsga0", "plsgb0", "plsga0"],
    flashFrames: ["plsfa0", "plsfb0"],
    flashOffsetX: 0,
    flashOffsetY: 0,
    flashOverlay: true,
  },
};

export const SLOT_DEFAULT_WEAPON: Readonly<Record<number, WeaponId>> = {
  1: "fist",
  2: "pistol",
  3: "shotgun",
  4: "chaingun",
  5: "rocket",
  6: "plasma",
};

/**
 * Resolves which weapon to equip when pressing a weapon slot `1..6`.
 * Slot 1 cycles between Chainsaw and Fist when both are owned.
 */
export function resolveWeaponForSlot(
  slot: number,
  owned: ReadonlySet<WeaponId>,
  current: WeaponId,
): WeaponId | undefined {
  if (slot === 1) {
    if (owned.has("chainsaw")) {
      if (current === "chainsaw") return "fist";
      return "chainsaw";
    }
    return owned.has("fist") ? "fist" : undefined;
  }
  const id = SLOT_DEFAULT_WEAPON[slot];
  if (!id || !owned.has(id)) return undefined;
  return id;
}

export const KEY_SLOT_ENTRIES: readonly { id: KeyId; icon: string }[] = [
  { id: "blue", icon: "/assets/dungeon_pack/ui/stkeys0.webp" },
  { id: "blue_skull", icon: "/assets/dungeon_pack/ui/stkeys3.webp" },
  { id: "yellow", icon: "/assets/dungeon_pack/ui/stkeys1.webp" },
  { id: "yellow_skull", icon: "/assets/dungeon_pack/ui/stkeys4.webp" },
  { id: "red", icon: "/assets/dungeon_pack/ui/stkeys2.webp" },
  { id: "red_skull", icon: "/assets/dungeon_pack/ui/stkeys5.webp" },
];
