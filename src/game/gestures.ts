import type { Controls } from './simulation';

export class GestureInput {
  private pointer: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    time: number;
    swiped: boolean;
    diving: boolean;
    double: boolean;
  } | null = null;
  private pulses: { action: keyof Controls; from: number; until: number }[] = [];
  private lastTap = { time: -Infinity, x: 0, y: 0 };
  private direction: 'rollLeft' | 'rollRight' = 'rollRight';

  begin(id: number, x: number, y: number, now: number): void {
    if (this.pointer) return;
    const double =
      now - this.lastTap.time < 280 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 40;
    this.pointer = {
      id,
      x,
      y,
      startX: x,
      startY: y,
      time: now,
      swiped: false,
      diving: false,
      double,
    };
    if (double) {
      this.pulse(this.direction, now);
      this.lastTap.time = -Infinity;
    }
  }
  move(id: number, x: number, y: number, now: number): void {
    const p = this.pointer;
    if (!p || p.id !== id) return;
    const dx = x - p.x,
      dy = y - p.y;
    if (Math.abs(dx) >= 35 && Math.abs(dx) > Math.abs(dy)) {
      const action = dx > 0 ? 'right' : 'left';
      this.direction = dx > 0 ? 'rollRight' : 'rollLeft';
      this.pulses = this.pulses.filter((pulse) => pulse.action !== (dx > 0 ? 'left' : 'right'));
      this.pulse(action, now);
      p.x = x;
      p.y = y;
      p.swiped = true;
    } else if (Math.abs(dy) >= 35) {
      p.diving = dy > 0;
      p.x = x;
      p.y = y;
      p.swiped = true;
    }
  }
  end(id: number, now: number): void {
    const p = this.pointer;
    if (!p || p.id !== id) return;
    if (!p.swiped && now - p.time < 220) {
      this.pulse('fly', now);
      if (!p.double) this.lastTap = { time: now, x: p.startX, y: p.startY };
    }
    this.pointer = null;
  }
  cancel(id: number): void {
    if (this.pointer?.id === id) this.reset();
  }
  reset(): void {
    this.pointer = null;
    this.pulses = [];
    this.lastTap.time = -Infinity;
  }
  read(now: number): Partial<Controls> {
    this.pulses = this.pulses.filter((pulse) => pulse.until > now);
    const result: Partial<Controls> = {};
    if (this.pointer) result[this.pointer.diving ? 'dive' : 'fly'] = true;
    for (const pulse of this.pulses) if (pulse.from <= now) result[pulse.action] = true;
    return result;
  }
  private pulse(action: keyof Controls, now: number): void {
    this.pulses = this.pulses.filter((pulse) => pulse.until > now);
    if (this.pulses.filter((pulse) => pulse.action === action).length >= 2) return;
    const previous = this.pulses.filter((pulse) => pulse.action === action).at(-1);
    const from = Math.max(now, (previous?.until ?? -Infinity) + 50);
    this.pulses.push({ action, from, until: from + 110 });
  }
}
