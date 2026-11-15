import { Color } from 'three';

/** DESIGN.md color tokens, mirrored in `styles/tokens.css`. Never use pure black or pure white. */
export const palette = {
  ink: '#07070A',
  bone: '#F7F3EA',
  gold: '#F5C76B',
  goldLight: '#FFE9B0',
  mist: '#8E8A93',
} as const;

/** Per-room palettes as defined in each room's PROMPT.md, mapped to the shared token names. */
export const roomPalettes = {
  hub: { ink: '#07070A', surface: '#101016', accent: '#F5C76B', light: '#FFE9B0', mist: '#8E8A93' },
  wretched: { ink: '#0C0B0E', surface: '#2B2A2E', accent: '#FFD9A0', light: '#F5C76B', mist: '#9A968F' },
  underneath: { ink: '#0A0D1F', surface: '#1B1F3A', accent: '#F2B866', light: '#FFF4DA', mist: '#7FA6C9' },
  gain: { ink: '#0E0C0B', surface: '#3A3530', accent: '#FFB25C', light: '#CFE0FF', mist: '#6E6A66' },
} as const;
export type RoomId = keyof typeof roomPalettes;

export const color = (hex: string): Color => new Color(hex);

/** Motion tokens (seconds), mirrored in CSS. */
export const motion = {
  micro: 0.16,
  ui: 0.42,
  reveal: 1.1,
  stagger: 0.06,
  /** gsap-compatible ease names for the DESIGN.md curves. */
  easeOutExpo: 'expo.out',
  easeInOutQuart: 'quart.inOut',
  breath: 'sine.inOut',
} as const;
