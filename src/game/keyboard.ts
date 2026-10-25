import type { GameStatus } from './simulation';
export type KeyAction =
  'native' | 'mute' | 'start' | 'pause' | 'resume' | 'home' | 'close' | 'control';
export const CONTROL_CODES = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'accelerate',
  ArrowUp: 'accelerate',
  ShiftLeft: 'accelerate',
  ShiftRight: 'accelerate',
  Space: 'fly',
  KeyS: 'dive',
  ArrowDown: 'dive',
  KeyQ: 'rollLeft',
  KeyE: 'rollRight',
} as const;
export function keyAction(
  code: string,
  status: GameStatus,
  dialogOpen: boolean,
  interactive: boolean,
): KeyAction {
  if (code === 'KeyM') return 'mute';
  const escape = code === 'Escape' || code === 'KeyP';
  const activate = code === 'Space' || code === 'Enter';
  if (dialogOpen) {
    if (escape) return status === 'paused' ? 'resume' : status === 'crashed' ? 'home' : 'close';
    if (status === 'crashed' && activate && !interactive) return 'start';
    return 'native';
  }
  if (status === 'playing') {
    if (escape) return 'pause';
    if (code in CONTROL_CODES) return 'control';
  }
  if ((status === 'menu' || status === 'crashed') && activate && !interactive) return 'start';
  return 'native';
}
