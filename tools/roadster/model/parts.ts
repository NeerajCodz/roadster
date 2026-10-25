// Per-material geometry lists. Detail builders push their parts here; index.ts merges each list into one
// mesh so the model stays inside the mesh budget.
import type * as THREE from 'three';

export interface Parts {
  black: THREE.BufferGeometry[];
  carbon: THREE.BufferGeometry[];
  chrome: THREE.BufferGeometry[];
  /** Polished bronze titanium (the stowed wing outline). */
  bronze: THREE.BufferGeometry[];
  /** Dark titanium (the Caliper material): fan-outlet cone hubs, merged with the brake calipers. */
  titanium: THREE.BufferGeometry[];
  nozzle: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
  brake: THREE.BufferGeometry[];
  head: THREE.BufferGeometry[];
  marker: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  interior: THREE.BufferGeometry[];
  seat: THREE.BufferGeometry[];
}

export function createParts(): Parts {
  return {
    black: [], carbon: [], chrome: [], bronze: [], titanium: [], nozzle: [], glow: [], brake: [], head: [], marker: [], trim: [], glass: [],
    interior: [], seat: [],
  };
}
