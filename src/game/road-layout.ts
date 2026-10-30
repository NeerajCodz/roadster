import { LANE_WIDTH, roadFor, type RoadModeId } from './run-settings';

/** Repeated scenery and its physical bounds must share this layout. */
export const GANTRY_LAYOUT = {
  repeatLength: 1000,
  firstDistance: 100,
  spacing: 200,
  count: 5,
  // The 12m panel leaves a narrow real gap beside a 2.23m car in an outer lane.
  panel: { width: 12, height: 3.25, depth: 0.18, y: 11.3 },
  beam: { width: 24, height: 0.4, depth: 0.4, y: 13 },
} as const;

export const PLAYER_BODY = { width: 2.23, height: 1.12, length: 4.3 } as const;

/** Preserve the outside-lane flight gaps as the carriageway gets narrower. */
export function gantryFor(mode: RoadModeId) {
  const lanes = roadFor(mode).lanes.length;
  return {
    ...GANTRY_LAYOUT,
    panel: { ...GANTRY_LAYOUT.panel, width: lanes * LANE_WIDTH - 6 },
    beam: { ...GANTRY_LAYOUT.beam, width: lanes * LANE_WIDTH + 6 },
  };
}
