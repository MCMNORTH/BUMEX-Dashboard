import { useMemo } from 'react';
import * as THREE from 'three';

// A clear night: deep navy zenith, a faint warm city glow at the horizon, a scatter of small stars.
// Also rendered into the environment map so glass and metal reflect a dark sky.
const vert = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const frag = `varying vec3 vWorld; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 glow; uniform vec3 ground; uniform float stars;
float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vWorld);
  float h = d.y;
  vec3 c;
  if (h >= 0.0) {
    c = mix(horizon, zenith, pow(smoothstep(0.0, 0.6, h), 0.6));
    c += glow * pow(1.0 - smoothstep(0.0, 0.18, h), 2.0);
    if (stars > 0.0) {
      vec3 g = floor(d * 90.0);
      vec3 f = fract(d * 90.0);
      float r = hash(g);
      vec3 centre = vec3(hash(g + 1.0), hash(g + 2.0), hash(g + 3.0));
      float dist = length(f - centre);
      float s = smoothstep(0.975, 1.0, r) * (1.0 - smoothstep(0.0, 0.05 + 0.06 * hash(g + 5.0), dist)) * smoothstep(0.03, 0.3, h);
      c += vec3(0.9, 0.93, 1.0) * s * stars;
    }
  } else {
    c = mix(horizon, ground, smoothstep(0.0, 0.05, -h));
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function skyMaterial(stars = 0.8): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color('#060b18') },
      horizon: { value: new THREE.Color('#15213a') },
      glow: { value: new THREE.Color('#2a2b2e') },
      ground: { value: new THREE.Color('#0b0e14') },
      stars: { value: stars },
    },
  });
}

export function Sky({ radius = 1100 }: { radius?: number }) {
  const material = useMemo(() => skyMaterial(0.8), []);
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}
