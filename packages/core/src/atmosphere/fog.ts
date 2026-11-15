import { Color, FogExp2, type Material, type Object3D, type Scene } from 'three';

export interface FogPreset {
  color: string;
  /** Exponential distance density. */
  density: number;
  /** Height fog: world Y where the fog layer is thickest. */
  base: number;
  /** How quickly height fog thins above `base` (higher is a thinner layer). */
  falloff: number;
  /** 0..1 extra opacity contributed by the height layer. */
  heightStrength: number;
}

export const FOG_PRESETS = {
  /** Barely there: depth cue only. */
  clear: { color: '#101016', density: 0.004, base: 0, falloff: 1, heightStrength: 0 },
  /** Soft ground haze that pools low (WRETCHED's plain). */
  groundHaze: { color: '#2b2a2e', density: 0.018, base: 0, falloff: 0.5, heightStrength: 0.7 },
  /** Dense, enclosing (a stone cell at night). */
  cell: { color: '#0e0c0b', density: 0.06, base: 0, falloff: 0.9, heightStrength: 0.35 },
  /** Bright aerial perspective for open sky. */
  aerial: { color: '#c9c6c2', density: 0.0035, base: -40, falloff: 0.03, heightStrength: 0.85 },
  /** Thick white-out. */
  whiteout: { color: '#c9c6c2', density: 0.08, base: 0, falloff: 0.05, heightStrength: 1 },
} satisfies Record<string, FogPreset>;

/**
 * Distance fog plus a height fog layer for built-in three.js materials.
 *
 * Distance fog is the scene's `FogExp2`. Height fog is injected into each material with
 * `apply()` (it patches the shader in `onBeforeCompile` and shares one set of uniforms, so
 * changing `fog.params` updates every material at once).
 *
 * ```ts
 * const fog = new HeightFog(scene, FOG_PRESETS.groundHaze);
 * fog.apply(terrain);            // any Object3D subtree or a single material
 * fog.params.heightStrength = 0.9;
 * loop.onFrame(() => fog.update());
 * ```
 * Custom ShaderMaterials can include the same look with `fog.uniforms` and `HEIGHT_FOG_GLSL`.
 */
export class HeightFog {
  readonly params: FogPreset;
  /** Shared uniforms: uFogBase, uFogFalloff, uFogHeightStrength. */
  readonly uniforms = { uFogBase: { value: 0 }, uFogFalloff: { value: 0.5 }, uFogHeightStrength: { value: 0 } };
  private readonly fog: FogExp2;

  constructor(private readonly scene: Scene, preset: FogPreset = FOG_PRESETS.clear) {
    this.params = { ...preset };
    this.fog = new FogExp2(new Color(preset.color), preset.density);
    scene.fog = this.fog;
    this.update();
  }

  /** Switch preset (instantly; tween `params` yourself for a blend). */
  set(preset: Partial<FogPreset>): void {
    Object.assign(this.params, preset);
    this.update();
  }

  /** Push `params` to the scene fog and shared uniforms. Call after changing params. */
  update(): void {
    this.fog.color.set(this.params.color);
    this.fog.density = this.params.density;
    this.uniforms.uFogBase.value = this.params.base;
    this.uniforms.uFogFalloff.value = this.params.falloff;
    this.uniforms.uFogHeightStrength.value = this.params.heightStrength;
  }

  /** Add the height layer to a material, or to every material under an object. */
  apply(target: Object3D | Material): void {
    const patch = (m: Material) => {
      if (m.userData.heightFog || !('fog' in m) || (m as Material & { isShaderMaterial?: boolean }).isShaderMaterial) return;
      m.userData.heightFog = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        prev?.call(m, shader, renderer);
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vFogWorld;')
          .replace('#include <fog_vertex>', '#include <fog_vertex>\nvFogWorld = transpose(mat3(viewMatrix)) * mvPosition.xyz + cameraPosition;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\nvarying vec3 vFogWorld;\n${HEIGHT_FOG_GLSL}`)
          .replace(
            '#include <fog_fragment>',
            `#ifdef USE_FOG
              float dFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
              float hFog = heightFog(vFogWorld.y, vFogDepth);
              gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(max(dFog, hFog), 0.0, 1.0));
            #endif`,
          );
      };
      m.customProgramCacheKey = () => 'heightFog';
      m.needsUpdate = true;
    };
    if ((target as Material).isMaterial) patch(target as Material);
    else {
      (target as Object3D).traverse((o) => {
        const mat = (o as Object3D & { material?: Material | Material[] }).material;
        if (Array.isArray(mat)) mat.forEach(patch);
        else if (mat) patch(mat);
      });
    }
  }

  dispose(): void {
    if (this.scene.fog === this.fog) this.scene.fog = null;
  }
}

/** GLSL for the height layer: `heightFog(worldY, viewDepth)` returns 0..1. Needs the three uniforms. */
export const HEIGHT_FOG_GLSL = /* glsl */ `
uniform float uFogBase, uFogFalloff, uFogHeightStrength;
float heightFog(float worldY, float depth){
  float layer = exp(-max(worldY - uFogBase, 0.0) * uFogFalloff);
  return layer * uFogHeightStrength * (1.0 - exp(-depth * 0.06));
}`;
