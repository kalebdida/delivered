// 3D type (troika SDF text) with self-hosted fonts only. Nothing here ever fetches a font from a
// CDN: every string goes through `sanitizeWord` or is fixed text whose glyphs the fonts contain.
import { Color, MeshBasicMaterial, type Material } from 'three';
import { Text } from 'troika-three-text';
import serifItalic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff?url';
import serifLight from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff?url';
import greek from '@fontsource/noto-serif/files/noto-serif-greek-400-normal.woff?url';

export const FONTS = { italic: serifItalic, light: serifLight, greek } as const;

export interface TextOptions {
  font?: keyof typeof FONTS;
  size?: number;
  color?: string | Color;
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom' | 'bottom-baseline';
  letterSpacing?: number;
  maxWidth?: number;
  opacity?: number;
  /** Draw over the scene (no depth test), like a title card in space. */
  onTop?: boolean;
}

/** A troika Text with the room's defaults. Remember to `dispose()` it (Chapter roots do). */
export function text3d(content: string, opts: TextOptions = {}): Text {
  const t = new Text();
  if (opts.onTop) t.material = new MeshBasicMaterial({ depthTest: false, transparent: true });
  t.text = content;
  t.font = FONTS[opts.font ?? 'italic'];
  t.fontSize = opts.size ?? 0.12;
  t.color = opts.color ?? '#F7F3EA';
  t.anchorX = opts.anchorX ?? 'center';
  t.anchorY = opts.anchorY ?? 'middle';
  t.letterSpacing = opts.letterSpacing ?? 0;
  if (opts.maxWidth) t.maxWidth = opts.maxWidth;
  t.fillOpacity = opts.opacity ?? 1;
  const m = t.material as Material & { toneMapped?: boolean; fog?: boolean };
  m.toneMapped = false;
  m.fog = false;
  t.renderOrder = 30;
  t.sync();
  return t;
}

/** Width of a synced text in world units (0 until troika has laid it out). */
export function textWidth(t: Text): number {
  const info = (t as unknown as { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo;
  if (!info) return 0;
  return info.blockBounds[2]! - info.blockBounds[0]!;
}
