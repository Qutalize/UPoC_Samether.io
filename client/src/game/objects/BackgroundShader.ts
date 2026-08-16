import Phaser from "phaser";

const fragShader = `
precision highp float;
uniform float time;
uniform vec2 resolution;
uniform vec2 uScroll;

varying vec2 outTexCoord;

// --- Noise Functions ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
    
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < 5; ++i) {
        v += a * snoise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = outTexCoord;
    
    // Add scroll offset based on camera position
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= resolution.x / resolution.y;
    
    // Apply scroll parallax to the world coordinates
    vec2 worldP = p + uScroll * 1.5;

    // --- Generate Ripples (Slowed down time) ---
    float n = fbm(worldP * 1.2 + time * 0.1);
    
    // Create soft dune-like lines (Slowed down time)
    float wave = sin((worldP.x + worldP.y) * 8.0 + n * 5.0);
    wave = smoothstep(-1.2, 1.2, wave);

    float wave2 = sin((worldP.x * 0.5 - worldP.y) * 15.0 + n * 3.0);
    wave2 = smoothstep(-1.2, 1.2, wave2);

    float pattern = mix(wave, wave2, 0.4);
    pattern = pattern * 0.5 + 0.5;

    // --- Coloring ---
    vec3 colorDark = vec3(0.02, 0.10, 0.20); 
    vec3 colorMid = vec3(0.10, 0.24, 0.37);  
    vec3 colorLight = vec3(0.18, 0.35, 0.52); 
    
    vec3 finalColor = mix(colorDark, colorMid, pattern);
    
    // Soft central lighting (fixed to screen center, not scrolled)
    float dist = length(p);
    float glow = exp(-dist * 1.0);
    finalColor = mix(finalColor, colorLight, glow * 0.25 * pattern);

    // --- Grain ---
    float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += (grain - 0.5) * 0.05;

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// Phaser 3.80 BaseShader expects (key, fragmentSrc, vertexSrc, uniforms)
// But uniforms are set separately via setUniform after instantiation
export const OceanBackgroundShader = new (Phaser.Display.BaseShader as any)(
  "OceanBackground",
  fragShader
);
