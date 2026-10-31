/** Positive state direction is world-right; a rightward roof roll rotates negative Z. */
export function rollVisualAngle(direction: number, remaining: number, duration: number): number {
  if (
    !Number.isFinite(remaining) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    remaining <= 0 ||
    remaining >= duration
  )
    return 0;
  return -Math.sign(direction) * (1 - remaining / duration) * Math.PI * 2;
}
