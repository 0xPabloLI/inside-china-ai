/**
 * Remotion configuration — enables ANGLE WebGL renderer for @remotion/effects.
 *
 * @remotion/effects (blur, vignette, lightLeak, etc.) requires WebGL2.
 * Without ANGLE, headless Chrome uses SwiftShader which may not support
 * all WebGL2 features needed by effects. ANGLE provides a more reliable
 * WebGL implementation in headless rendering.
 *
 * If WebGL is unavailable, effects gracefully degrade — components still
 * render, just without the WebGL-accelerated effect. MediaBackground has
 * CSS fallbacks for blur and vignette.
 *
 * Docs: https://www.remotion.dev/docs/config/#setchromiumopenglrenderer
 */
import { Config } from "@remotion/cli/config";

Config.setChromiumOpenGlRenderer("angle");
