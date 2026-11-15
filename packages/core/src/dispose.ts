import type { Material, Object3D, Texture, WebGLRenderer } from 'three';

/**
 * Dispose every geometry, material and texture under `root`, and detach it from its parent.
 * Call this in `Chapter.exit()` for everything the chapter created.
 */
export function deepDispose(root: Object3D | null | undefined): void {
  if (!root) return;
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const obj = o as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
      dispose?: () => void;
      skeleton?: { dispose(): void };
    };
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      obj.geometry.dispose();
    }
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      disposeMaterial(m, seen);
    }
    obj.skeleton?.dispose();
    // InstancedMesh, Sky helpers and troika Text expose their own dispose.
    if (obj !== root && typeof obj.dispose === 'function') obj.dispose();
  });
  root.removeFromParent();
  const self = root as Object3D & { dispose?: () => void };
  if (typeof self.dispose === 'function') self.dispose();
}

function disposeMaterial(m: Material, seen: Set<unknown>): void {
  const record = m as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const v = record[key];
    if (isTexture(v) && !seen.has(v)) {
      seen.add(v);
      v.dispose();
    }
  }
  const uniforms = (m as unknown as { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      if (isTexture(u?.value) && !seen.has(u.value)) {
        seen.add(u.value);
        u.value.dispose();
      }
    }
  }
  m.dispose();
}

const isTexture = (v: unknown): v is Texture => !!v && (v as Texture).isTexture === true;

export interface MemorySnapshot {
  geometries: number;
  textures: number;
}

export function memorySnapshot(renderer: WebGLRenderer): MemorySnapshot {
  return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}

/**
 * Dev-mode leak check. Compare the renderer's memory against a baseline taken before a chapter
 * entered; warn in the console when the chapter left something behind.
 * @returns true when memory is back at (or below) baseline.
 */
export function checkLeaks(renderer: WebGLRenderer, baseline: MemorySnapshot, label: string): boolean {
  const now = memorySnapshot(renderer);
  const g = now.geometries - baseline.geometries;
  const t = now.textures - baseline.textures;
  if (g > 0 || t > 0) {
    console.warn(
      `[delivered] leak check: "${label}" left ${g} geometries and ${t} textures behind. ` +
        `Call deepDispose() on everything the chapter created in exit().`,
    );
    return false;
  }
  return true;
}
