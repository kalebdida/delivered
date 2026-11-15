import { t } from '../i18n';
import { palette } from '../tokens';
import { toast } from './dom';

export interface PostcardOptions {
  /** The WebGL canvas to snapshot (the engine keeps its drawing buffer for this). */
  canvas: HTMLCanvasElement;
  /** Room title, e.g. 'WRETCHED'. */
  title: string;
  /** The personal line, e.g. 'I tried 7 times to free myself. Then I cried out.' */
  line: string;
  /** Verse reference, e.g. 'Romans 7:24-25'. */
  ref: string;
  /** Accent color (default gold). */
  accent?: string;
  /** Text language, to pick the right fonts. */
  lang?: 'en' | 'am';
}

const W = 1080;
const H = 1350;

/** Greedy word wrap for canvas text. Exported for tests. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Composite a canvas snapshot into a 1080x1350 postcard with designed typography.
 * @returns a PNG blob.
 */
export async function createPostcard(opts: PostcardOptions): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const accent = opts.accent ?? palette.gold;
  const am = opts.lang === 'am';
  const display = am ? '"Noto Serif Ethiopic", serif' : '"Cormorant Garamond", Georgia, serif';
  const ui = am ? '"Noto Sans Ethiopic", sans-serif' : '"Inter Variable", system-ui, sans-serif';
  try {
    await Promise.all([document.fonts.load(`300 64px ${display}`), document.fonts.load(`500 22px ${ui}`)]);
  } catch {
    /* fall back to whatever is loaded */
  }
  g.fillStyle = palette.ink;
  g.fillRect(0, 0, W, H);
  // Cover-fit the scene snapshot.
  const src = opts.canvas;
  const scale = Math.max(W / src.width, H / src.height);
  const sw = W / scale;
  const sh = H / scale;
  try {
    g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
  } catch {
    /* a tainted or lost canvas still yields a typographic card */
  }
  // Scrim so the type is always readable.
  const grad = g.createLinearGradient(0, H * 0.35, 0, H);
  grad.addColorStop(0, 'rgba(7,7,10,0)');
  grad.addColorStop(0.55, 'rgba(7,7,10,0.72)');
  grad.addColorStop(1, 'rgba(7,7,10,0.94)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const top = g.createLinearGradient(0, 0, 0, H * 0.22);
  top.addColorStop(0, 'rgba(7,7,10,0.6)');
  top.addColorStop(1, 'rgba(7,7,10,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, H * 0.22);
  // Hairline frame.
  g.strokeStyle = 'rgba(247,243,234,0.14)';
  g.lineWidth = 1;
  g.strokeRect(40.5, 40.5, W - 81, H - 81);

  const M = 96;
  const spaced = (text: string, x: number, y: number, tracking: number) => {
    let cx = x;
    for (const ch of text) {
      g.fillText(ch, cx, y);
      cx += g.measureText(ch).width + tracking;
    }
    return cx;
  };
  // Title, top left.
  g.textBaseline = 'alphabetic';
  g.fillStyle = palette.bone;
  g.font = `500 22px ${ui}`;
  spaced(opts.title.toUpperCase(), M, 128, 22 * 0.24);
  g.fillStyle = accent;
  g.fillRect(M, 150, 56, 1.5);

  // The line, bottom left.
  g.fillStyle = palette.bone;
  const size = am ? 52 : 68;
  g.font = `${am ? '' : 'italic '}300 ${size}px ${display}`;
  const lines = wrapText((s) => g.measureText(s).width, opts.line, W - M * 2);
  const lh = size * (am ? 1.5 : 1.16);
  let y = H - 250 - (lines.length - 1) * lh;
  for (const l of lines) {
    g.fillText(l, M, y);
    y += lh;
  }
  // Reference.
  g.fillStyle = accent;
  g.font = `400 30px ${display}`;
  spaced(am ? opts.ref : opts.ref.toUpperCase(), M, H - 176, am ? 1 : 30 * 0.12);
  // Wordmark and credit.
  g.fillStyle = 'rgba(247,243,234,0.62)';
  g.font = `500 18px ${ui}`;
  spaced('DELIVERED', M, H - 100, 18 * 0.32);
  g.textAlign = 'right';
  g.font = `400 18px ${ui}`;
  g.fillText('Made by Kaleb Dida', W - M, H - 100);
  g.textAlign = 'left';

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/**
 * Share a postcard: the Web Share sheet on mobile, a PNG download on desktop.
 */
export async function sharePostcard(blob: Blob, filename = 'delivered.png', text = ''): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(t('core.postcard.saved'));
  return 'downloaded';
}
