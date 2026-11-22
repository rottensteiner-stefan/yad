import type { AmmoType, KeyId, WeaponId } from "./core/WeaponConfig.js";

/**
 * Event names YAD dispatches on the shared `EventDispatcherImpl` bus, used to
 * decouple gameplay logic (Controller) from presentation (Hud, WeaponView).
 */
export const Events = {
  DAMAGE: "app:yad:damage",
  PICKUP: "app:yad:pickup",
  SHOOT: "app:yad:shoot",
  WEAPON: "app:yad:weapon",
  GAME_OVER: "app:yad:gameOver",
} as const;

export type PickupType = "armor" | "health" | "weapon" | "ammo" | "keycard";

export interface DamagePayload {
  amount: number;
}

export interface PickupPayload {
  itemType?: PickupType;
  type?: PickupType | string;
  amount: number;
  color?: KeyId | string;
  weaponId?: WeaponId;
  ammoType?: AmmoType;
}

export interface WeaponPayload {
  index: number;
  weaponId?: WeaponId;
}

export interface ShootPayload {
  weaponId?: WeaponId;
  ammoType?: AmmoType | null;
  ammoCost?: number;
}
