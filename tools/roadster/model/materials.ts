// Material palette. Names follow the contract in tools/roadster/DESIGN.md: exactly one material
// matches /paint/i (CarPaint), emissive reds are BrakeLight, the nose bar is Headlight, and the white
// aero disc is WheelFace (the game's rim paint recolours it). Reflection strength is set through colour,
// metalness, roughness and specular only: envMapIntensity is replaced by scene.environmentIntensity at
// render time and is not part of glTF.
import * as THREE from 'three';

export interface Materials {
  paint: THREE.MeshPhysicalMaterial;
  black: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  carbon: THREE.MeshPhysicalMaterial;
  chrome: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  nozzle: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  brake: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  marker: THREE.MeshStandardMaterial;
  tire: THREE.MeshPhysicalMaterial;
  wheelFace: THREE.MeshPhysicalMaterial;
  spoke: THREE.MeshStandardMaterial;
  wheelDark: THREE.MeshPhysicalMaterial;
  vane: THREE.MeshStandardMaterial;
  caliper: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  seat: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
}

/**
 * 2x2 twill carbon weave tile (128 px): alternating light / dark tows with a soft sheen across each tow.
 * The texture is the albedo, so the weave stays near-black; index.ts adds tri-planar UVs to the carbon mesh.
 */
function carbonTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 128, cells = 8, c = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      // 2x2 twill: the over/under pattern shifts by one cell per row.
      const horizontal = ((i + j) >> 1) % 2 === 0;
      const g = horizontal ? ctx.createLinearGradient(0, j * c, 0, (j + 1) * c) : ctx.createLinearGradient(i * c, 0, (i + 1) * c, 0);
      const [hi, lo] = horizontal ? ['#0f1114', '#060709'] : ['#0b0c0f', '#040506'];
      g.addColorStop(0, lo); g.addColorStop(0.5, hi); g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.fillRect(i * c, j * c, c, c);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Glass reflectance: gold tint of the reflections (linear RGB, red = 1) and their strength. */
const GLASS_TINT = [1, 0.48, 0.14];
const GLASS_F90 = 0.05;
/** Glass body colour: near-black smoky bronze, so the reflections carry the look. */
const GLASS_BASE = '#100a06';

export function createMaterials(paint = '#eae8e2'): Materials {
  const carbonMap = carbonTexture();
  return {
    // Satin pearl / anodised warm off-white: soft broad reflections, light clearcoat.
    paint: new THREE.MeshPhysicalMaterial({
      name: 'CarPaint', color: paint, metalness: 0.12, roughness: 0.33, clearcoat: 0.55, clearcoatRoughness: 0.18,
    }),
    // Dielectric gloss black. The rough base layer smears the warm sky over every grazing panel (brown sills,
    // copper lower corners), so its specular is nearly off. The gloss comes from a thin clearcoat whose highlights
    // trace the edges of the fascia, legs, sills and the diffuser frame's chamfers; the coat reflects everything at
    // grazing angles (its F90 is 1), so it stays light: a stronger coat brings the warm smears back.
    black: new THREE.MeshPhysicalMaterial({
      name: 'GlossBlack', color: '#08090c', metalness: 0, roughness: 0.35, specularIntensity: 0.03, clearcoat: 0.25,
      clearcoatRoughness: 0.1,
    }),
    // Dark smoky bronze canopy, opaque from outside. With metalness 0, three.js (and KHR_materials_specular)
    // reflect F0 = min(0.04 * specularColor, 1) * specularIntensity at normal incidence and an untinted
    // F90 = specularIntensity at grazing angles. A gold specularColor at the clamp with a low intensity keeps
    // the mirror-sharp reflections warm and dark, so the sky shows as a gold gradient instead of washing the
    // glass out to caramel. The untinted F90 would still turn grazing panes (the windshield seen from low down)
    // blue-grey; a warm sheen, which grows toward grazing angles, keeps them bronze.
    // The specularColor is over 1 on purpose (KHR_materials_specular allows it); importers that clamp it to 1,
    // such as Blender's, show neutral reflections instead of gold ones.
    // In the studio views (RoomEnvironment) panes that mirror a light panel still clip to cream: any glossy dark
    // glass does that there. Judge the glass in the game-light views (hero, low, chase, garage).
    glass: new THREE.MeshPhysicalMaterial({
      name: 'Glass', color: GLASS_BASE, metalness: 0, roughness: 0.03, specularIntensity: GLASS_F90,
      specularColor: new THREE.Color().setRGB(GLASS_TINT[0] / 0.04, GLASS_TINT[1] / 0.04, GLASS_TINT[2] / 0.04),
      sheen: 1, sheenColor: '#4a2c12', sheenRoughness: 0.3,
    }),
    // Satin near-black carbon twill: no metalness and a very low dielectric specular (F90 = 0.05), so the flat
    // fins, the slot vents and the headlight pockets never mirror the warm sky or the studio lights at grazing
    // angles (brown planks, grey slots). The albedo stays very dark too: anything lighter turns brown in the warm
    // low sun. Without a DOM (Node builds) there is no weave texture and the colour carries it.
    carbon: new THREE.MeshPhysicalMaterial({
      name: 'Carbon', color: carbonMap ? '#ffffff' : '#141416', map: carbonMap, metalness: 0, roughness: 0.45,
      specularIntensity: 0.05,
    }),
    // Polished titanium: thruster rims.
    chrome: new THREE.MeshStandardMaterial({ name: 'Chrome', color: '#e9e7e2', metalness: 1, roughness: 0.1 }),
    // Polished bronze titanium: the stowed wing's outline in the deck, a warm metal line that shows on white paint.
    bronze: new THREE.MeshStandardMaterial({ name: 'BronzeTrim', color: '#b08a5a', metalness: 1, roughness: 0.2 }),
    // Dark bronze thruster throats: chrome ring, dark throat, then only the faint warm glow at the bottom.
    nozzle: new THREE.MeshStandardMaterial({ name: 'ThrusterNozzle', color: '#4a2f1b', metalness: 1, roughness: 0.5 }),
    glow: new THREE.MeshStandardMaterial({
      name: 'ThrusterGlow', color: '#1e0d06', emissive: '#ff7a33', emissiveIntensity: 0.15, metalness: 0.3, roughness: 0.5,
    }),
    brake: new THREE.MeshStandardMaterial({
      name: 'BrakeLight', color: '#2a0000', emissive: '#c00000', emissiveIntensity: 2.5, roughness: 0.35,
    }),
    // Cool white LEDs: a moderate intensity keeps the blue tint after tone mapping, so the lamps read as lit
    // against the warm white paint instead of clipping to the same white.
    head: new THREE.MeshStandardMaterial({
      name: 'Headlight', color: '#1b2230', emissive: '#bcd6ff', emissiveIntensity: 1.6, roughness: 0.3,
    }),
    marker: new THREE.MeshStandardMaterial({
      name: 'SideMarker', color: '#7a3c00', emissive: '#ff8a10', emissiveIntensity: 1.4, roughness: 0.3,
    }),
    // Plain black rubber: a low specular keeps the sidewalls from greying in the warm sky.
    tire: new THREE.MeshPhysicalMaterial({ name: 'Tire', color: '#0d0d0e', roughness: 0.88, metalness: 0, specularIntensity: 0.35 }),
    wheelFace: new THREE.MeshPhysicalMaterial({
      name: 'WheelFace', color: '#ebe9e4', metalness: 0.15, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.15,
    }),
    spoke: new THREE.MeshStandardMaterial({ name: 'WheelSpoke', color: '#d4d2cd', metalness: 1, roughness: 0.2 }),
    // Dark spoke interiors, hub dome and brake discs: dielectric with a very low specular (as Carbon), so the
    // warm sky cannot tint them brown and each spoke reads as a dark blade between its titanium edges.
    wheelDark: new THREE.MeshPhysicalMaterial({
      name: 'WheelDark', color: '#0c0d0f', metalness: 0, roughness: 0.55, specularIntensity: 0.12,
    }),
    // Dark bronze inner vane: only half metallic, so it stays a hint of bronze instead of an orange stripe.
    vane: new THREE.MeshStandardMaterial({ name: 'WheelVane', color: '#30200f', metalness: 0.4, roughness: 0.5 }),
    // Dark titanium: brake calipers and the cone hubs of the rear fan outlets.
    caliper: new THREE.MeshStandardMaterial({ name: 'Caliper', color: '#4a4c52', metalness: 0.8, roughness: 0.3 }),
    interior: new THREE.MeshStandardMaterial({ name: 'Interior', color: '#3a2a20', roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ name: 'Seat', color: '#e6e2da', roughness: 0.6, metalness: 0 }),
    trim: new THREE.MeshStandardMaterial({ name: 'Trim', color: '#8d8a85', roughness: 0.3, metalness: 0.9 }),
    plate: new THREE.MeshStandardMaterial({ name: 'Plate', color: '#ffffff', roughness: 0.45, metalness: 0 }),
  };
}
