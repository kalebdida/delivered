import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Scene } from 'three';
import { Chapter, Director } from '../src/director';
import { deepDispose } from '../src/dispose';
import { markComplete } from '../src/safety';
import type { CoreContext } from '../src/app';

const log: string[] = [];
const disposed = vi.fn();

class Step extends Chapter {
  constructor(readonly id: string) {
    super();
  }
  enter(): void {
    log.push(`enter:${this.id}`);
    const geo = new BoxGeometry();
    geo.addEventListener('dispose', disposed);
    this.root.add(new Mesh(geo, new MeshBasicMaterial()));
    this.own(() => log.push(`cleanup:${this.id}`));
  }
  update(): void {
    log.push(`update:${this.id}`);
  }
  override exit(): void {
    log.push(`exit:${this.id}`);
  }
  finish(): void {
    this.complete();
  }
}

function makeCtx(): CoreContext {
  const scene = new Scene();
  return {
    engine: { scene, renderer: { info: { memory: { geometries: 0, textures: 0 } } }, precompile: async () => {} },
  } as unknown as CoreContext;
}

describe('Director lifecycle', () => {
  it('enters, updates, exits and disposes chapters in order', async () => {
    log.length = 0;
    const ctx = makeCtx();
    const a = new Step('a');
    const b = new Step('b');
    const onEnd = vi.fn();
    const d = new Director(ctx, [a, b], { appId: 'demo', onEnd, leakCheck: false });
    await d.start();
    expect(d.index).toBe(0);
    expect(ctx.engine.scene.children).toContain(a.root);
    d.update(1 / 60);
    expect(a.time).toBeCloseTo(1 / 60);
    await d.next();
    expect(log).toEqual(['enter:a', 'update:a', 'exit:a', 'cleanup:a', 'enter:b']);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(ctx.engine.scene.children).not.toContain(a.root);
    expect(a.root.children.length).toBe(0);
    await d.next();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('saves progress, advances on complete(), and gates skipping on completion', async () => {
    const ctx = makeCtx();
    const chapters = [new Step('one'), new Step('two'), new Step('three')];
    const d = new Director(ctx, chapters, { appId: 'wretched', leakCheck: false });
    await d.start();
    expect(d.canSkip).toBe(false);
    await d.skip();
    expect(d.index).toBe(0);
    chapters[0]!.finish();
    await vi.waitFor(() => expect(d.index === 1 && !d.busy).toBe(true));
    expect(localStorage.getItem('delivered:wretched:chapter')).toBe('1');
    expect(new Director(ctx, chapters, { appId: 'wretched' }).savedIndex).toBe(1);
    markComplete('wretched');
    expect(d.canSkip).toBe(true);
    await d.skip();
    expect(d.index).toBe(2);
    expect((globalThis as { __delivered?: { chapterId: string } }).__delivered?.chapterId).toBe('three');
  });

  it('deepDispose releases geometry, materials and textures', () => {
    const scene = new Scene();
    const mat = new MeshBasicMaterial();
    const geo = new BoxGeometry();
    const g = vi.fn();
    const m = vi.fn();
    geo.addEventListener('dispose', g);
    mat.addEventListener('dispose', m);
    const mesh = new Mesh(geo, mat);
    scene.add(mesh);
    deepDispose(mesh);
    expect(g).toHaveBeenCalled();
    expect(m).toHaveBeenCalled();
    expect(scene.children.length).toBe(0);
  });
});
