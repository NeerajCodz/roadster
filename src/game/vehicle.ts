import type { Object3D } from 'three';

/** Fallback tyre radius in metres for models that do not declare `userData.radius`. */
const DEFAULT_RADIUS = 0.4;

/**
 * Advance tyre rotation by road travel in metres. Player models are authored nose-forward (+Z) and
 * turned around to face the road (-Z), so a positive turn about the wheel's own axle rolls forward.
 */
export function spinWheels(wheels: Object3D[], travel: number): void {
  for (const wheel of wheels) wheel.rotateX(travel / (wheel.userData.radius ?? DEFAULT_RADIUS));
}
