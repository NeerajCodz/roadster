export type TrafficFamily =
  | 'sedan'
  | 'hatch'
  | 'suv'
  | 'van'
  | 'pickup'
  | 'sports'
  | 'wagon'
  | 'truck'
  | 'bus'
  | 'carrier'
  | 'tanker'
  | 'flatbed'
  | 'semi';
export type TrafficLivery = 'none' | 'taxi' | 'police' | 'ambulance' | 'fire' | 'school' | 'parcel';
export interface TrafficVehicleSpec {
  readonly id: string;
  readonly name: string;
  readonly family: TrafficFamily;
  readonly livery: TrafficLivery;
  readonly width: number;
  readonly height: number;
  readonly length: number;
  readonly wheelRadius: number;
  /** Axle positions along Z in metres. The front of every vehicle faces -Z. */
  readonly axles: readonly number[];
  readonly cruiseSpeed: number;
  readonly weight: number;
}

function vehicle(
  id: string,
  name: string,
  family: TrafficFamily,
  width: number,
  height: number,
  length: number,
  wheelRadius: number,
  cruiseSpeed: number,
  weight: number,
  livery: TrafficLivery = 'none',
  axles: readonly number[] = [-length * 0.3, length * 0.3],
): TrafficVehicleSpec {
  return Object.freeze({
    id,
    name,
    family,
    width,
    height,
    length,
    wheelRadius,
    cruiseSpeed,
    weight,
    livery,
    axles: Object.freeze([...axles]),
  });
}

/** The first nine numeric variants retain their original vehicle identities. */
export const TRAFFIC_CATALOG: readonly TrafficVehicleSpec[] = Object.freeze([
  vehicle('sedan', 'City Sedan', 'sedan', 1.9, 1.43, 4.64, 0.33, 25, 20),
  vehicle('hatch', 'Compact Hatchback', 'hatch', 1.82, 1.47, 4.04, 0.31, 24, 16),
  vehicle('suv', 'Family SUV', 'suv', 2.0, 1.82, 4.94, 0.39, 23, 16),
  vehicle('taxi', 'Metro Taxi', 'sedan', 1.92, 1.63, 4.74, 0.34, 24, 5, 'taxi'),
  vehicle('van', 'Cargo Van', 'van', 2.06, 2.2, 5.34, 0.39, 21, 10),
  vehicle('pickup', 'Crew Cab Pickup', 'pickup', 2.02, 1.77, 5.58, 0.4, 23, 10),
  vehicle('boxtruck', 'Box Truck', 'truck', 2.43, 3, 8.14, 0.49, 17, 4, 'none', [-2.5, 2.5, 3.12]),
  vehicle('bus', 'City Bus', 'bus', 2.6, 3.16, 12.22, 0.5, 19, 2, 'none', [-3.85, 3.6]),
  vehicle(
    'carrier',
    'Vehicle Transporter',
    'carrier',
    2.61,
    3.9,
    16.12,
    0.5,
    16,
    1,
    'none',
    [-6.1, -2.8, 4.4, 5.7],
  ),
  vehicle('coupe', 'Sport Coupe', 'sports', 1.94, 1.3, 4.46, 0.34, 32, 5),
  vehicle('wagon', 'Touring Estate', 'wagon', 1.9, 1.5, 4.86, 0.34, 26, 8),
  vehicle('minivan', 'People Carrier', 'van', 1.96, 1.83, 5.12, 0.35, 23, 8),
  vehicle('executive', 'Executive Saloon', 'sedan', 1.98, 1.46, 5.15, 0.36, 29, 6),
  vehicle('crossover', 'Compact Crossover', 'suv', 1.85, 1.66, 4.38, 0.35, 25, 10),
  vehicle('offroad', 'Trail 4×4', 'suv', 2.02, 1.98, 4.62, 0.43, 21, 4),
  vehicle('ambulance', 'Ambulance', 'van', 2.16, 2.75, 6.2, 0.4, 26, 1, 'ambulance'),
  vehicle('police', 'Highway Patrol', 'sedan', 1.94, 1.58, 4.92, 0.35, 28, 1, 'police'),
  vehicle('fire', 'Fire Engine', 'truck', 2.45, 3.12, 8.4, 0.51, 19, 1, 'fire', [-2.6, 2.3, 3.12]),
  vehicle('school', 'School Bus', 'bus', 2.45, 3.12, 9.4, 0.49, 18, 1, 'school', [-2.9, 2.7]),
  vehicle('courier', 'Parcel Van', 'van', 2.06, 2.18, 5.6, 0.39, 22, 4, 'parcel'),
  vehicle(
    'delivery',
    'Delivery Truck',
    'truck',
    2.35,
    3.04,
    7.2,
    0.45,
    20,
    3,
    'parcel',
    [-2.05, 2.1],
  ),
  vehicle(
    'tanker',
    'Fuel Tanker',
    'tanker',
    2.5,
    3.4,
    12.5,
    0.51,
    16,
    1,
    'none',
    [-4.8, -1.9, 3.5, 4.5],
  ),
  vehicle(
    'flatbed',
    'Flatbed Utility',
    'flatbed',
    2.44,
    2.7,
    8.6,
    0.49,
    18,
    2,
    'none',
    [-2.7, 2.4, 3.15],
  ),
  vehicle(
    'semi',
    'Articulated Freight',
    'semi',
    2.55,
    3.65,
    15.2,
    0.53,
    17,
    2,
    'none',
    [-5.85, -2.9, -1.9, 4.7, 5.7],
  ),
]);

export const TRAFFIC_PAINTS = Object.freeze([
  { name: 'Pearl White', color: '#dddcd4' },
  { name: 'Silver', color: '#a6adb0' },
  { name: 'Graphite', color: '#484e50' },
  { name: 'Obsidian', color: '#242a2d' },
  { name: 'Atlantic Blue', color: '#355772' },
  { name: 'Deep Red', color: '#873a35' },
  { name: 'Olive', color: '#687260' },
  { name: 'Sandstone', color: '#a99b7d' },
]);

const COLLISION_BOUNDS = TRAFFIC_CATALOG.map(({ width, height, length }) =>
  Object.freeze({ width, height, length }),
);

function trafficIndex(variant: number): number {
  if (Number.isInteger(variant) && variant >= 0 && variant < TRAFFIC_CATALOG.length) return variant;
  const index = Number.isFinite(variant) ? Math.trunc(variant) : 0;
  return ((index % TRAFFIC_CATALOG.length) + TRAFFIC_CATALOG.length) % TRAFFIC_CATALOG.length;
}
export function trafficSpec(variant: number): TrafficVehicleSpec {
  return TRAFFIC_CATALOG[trafficIndex(variant)];
}
export function trafficBounds(variant: number) {
  return COLLISION_BOUNDS[trafficIndex(variant)];
}
export function isCommercial(spec: TrafficVehicleSpec): boolean {
  return ['truck', 'bus', 'carrier', 'tanker', 'flatbed', 'semi'].includes(spec.family);
}
