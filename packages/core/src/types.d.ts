declare module 'troika-three-text' {
  import type { Color, Material, Mesh } from 'three';
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    letterSpacing: number;
    lineHeight: number | 'normal';
    maxWidth: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    anchorX: number | string;
    anchorY: number | string;
    color: string | number | Color;
    fillOpacity: number;
    outlineWidth: number | string;
    outlineColor: string | number | Color;
    outlineBlur: number | string;
    outlineOpacity: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }
  export function preloadFont(options: { font?: string; characters?: string | string[] }, callback: () => void): void;
}
