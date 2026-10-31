export type RampKind = 'straight' | 'roll-left' | 'roll-right';
export const RAMP_KINDS: readonly RampKind[] = Object.freeze([
  'straight',
  'roll-left',
  'roll-right',
]);
export const RAMP_LAYOUT = Object.freeze({
  width: 3.1,
  length: 8,
  entryHeight: 0.045,
  straightRise: 1.65,
  rollRise: 1.95,
  bankAngle: 0.85,
  deckThickness: 0.1,
  launchSpeed: 12.4,
  rollLaunchSpeed: 14.4,
  rollDuration: 1,
});
export const normalizeRampKind = (value: unknown): RampKind =>
  RAMP_KINDS.includes(value as RampKind) ? (value as RampKind) : 'straight';
export function sampleRamp(kind: RampKind, progress: number, lateral = 0) {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const u = Math.max(-1, Math.min(1, Number.isFinite(lateral) ? lateral : 0));
  const rise = kind === 'straight' ? RAMP_LAYOUT.straightRise : RAMP_LAYOUT.rollRise;
  const bank =
    (kind === 'roll-left' ? 1 : kind === 'roll-right' ? -1 : 0) * RAMP_LAYOUT.bankAngle * t * t;
  const across = (u * RAMP_LAYOUT.width) / 2;
  return {
    x: across * Math.cos(bank),
    y: RAMP_LAYOUT.entryHeight + rise * t * t + across * Math.sin(bank),
    z: RAMP_LAYOUT.length / 2 - t * RAMP_LAYOUT.length,
    bank,
    pitch: Math.atan2(2 * rise * t, RAMP_LAYOUT.length),
  };
}
export const rampBounds = (kind: RampKind) => ({
  width: 3.3,
  length: 8.2,
  height: kind === 'straight' ? 1.9 : 3.4,
});
