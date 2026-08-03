import Phaser from "phaser";

export const SharkShader = {
  name: "SharkShader",
  frag: `
    precision mediump float;

    uniform sampler2D uMainSampler;
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uBellyColor;

    varying vec2 outTexCoord;

    void main()
    {
        vec2 uv = outTexCoord;
        
        // Head is at the right (x=1.0), Tail is at the left (x=0.0)
        float distFromHead = 1.0 - uv.x;
        
        // Wave parameters
        float time = uTime * 0.005;
        float frequency = 8.0;
        float amplitude = 0.04;
        
        float wave = sin(time + uv.x * frequency) * amplitude * distFromHead;
        wave += sin(time * 1.5 + uv.x * frequency * 0.6) * amplitude * 0.5 * distFromHead;
        
        // Apply wiggle
        uv.y = uv.y + wave;

        // Sample the texture (black silhouette)
        vec4 texColor = texture2D(uMainSampler, uv);
        
        // Use alpha as mask
        float mask = texColor.a;
        
        // Discard if outside wave bounds
        if (uv.y < 0.0 || uv.y > 1.0) {
            mask = 0.0;
        }

        // 3D-ish shading based on vertical position
        // Central part (y near 0.5) is the belly/top, edges are darker
        float verticalDist = abs(uv.y - 0.5) * 2.0;
        
        // Belly highlight in the center
        vec3 finalColor = mix(uBellyColor, uColor, smoothstep(0.0, 0.7, verticalDist));
        
        // Subtle shadow at the very edges
        finalColor *= (1.0 - smoothstep(0.8, 1.0, verticalDist) * 0.3);

        gl_FragColor = vec4(finalColor * mask, mask);
    }
  `,
};

// Type assertion for Phaser 3.90 Pipeline API
const BasePipeline = (Phaser.Renderer.WebGL as any).Pipelines?.PostFXPipeline || Object;

export class SharkPipeline extends BasePipeline {
  private _color: Phaser.Display.Color;
  private _bellyColor: Phaser.Display.Color;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: "SharkShader",
      frag: SharkShader.frag,
      padding: 40,
    } as any);
    this._color = new Phaser.Display.Color(255, 255, 255);
    this._bellyColor = new Phaser.Display.Color(200, 200, 200);
  }

  onPreRender() {
    // Phaser 3.80 PostFXPipeline methods
    const pipeline = this as any;
    pipeline.set1f("uTime", pipeline.game.loop.time);
    pipeline.set3f(
      "uColor",
      this._color.red / 255,
      this._color.green / 255,
      this._color.blue / 255,
    );
    pipeline.set3f(
      "uBellyColor",
      this._bellyColor.red / 255,
      this._bellyColor.green / 255,
      this._bellyColor.blue / 255,
    );
  }

  setSharkColors(color: number, bellyColor: number) {
    this._color.setFromRGB(Phaser.Display.Color.IntegerToRGB(color));
    this._bellyColor.setFromRGB(Phaser.Display.Color.IntegerToRGB(bellyColor));
  }
}
