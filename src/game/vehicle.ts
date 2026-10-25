import type { Object3D } from 'three';

/** Advance tyre rotation by road travel in metres. */
export function spinWheels(wheels: Object3D[], travel: number): void {
  for (const wheel of wheels) wheel.rotateX(-travel / 0.4);
}
