/*
 * Brand shaders — Paper Design's WebGL shaders, configured to Knockout.
 * Two flavors:
 *   <FinalShader /> — magenta mesh gradient for the bottom CTA band
 *   <HeroShader />  — quiet grain gradient overlay for hero ambience
 *
 * Both render absolute-positioned canvases that fill the parent.
 * Use with `client:visible` to defer until in view.
 */

import type { CSSProperties, FC } from "react"
import {
  GrainGradient as GrainGradientRaw,
  MeshGradient as MeshGradientRaw
} from "@paper-design/shaders-react"

// Paper Design ships its types against React 18; this project is on React 19.
// The runtime is compatible — cast away the JSX-namespace mismatch.
type AnyProps = Record<string, unknown>
const MeshGradient = MeshGradientRaw as unknown as FC<AnyProps>
const GrainGradient = GrainGradientRaw as unknown as FC<AnyProps>

const FILL: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none"
}

export function FinalShader() {
  return (
    <MeshGradient
      colors={["#06060c", "#1a0612", "#ff3c79", "#2a0820", "#9d3cff"]}
      speed={0.35}
      distortion={0.85}
      swirl={0.5}
      grainMixer={0.55}
      grainOverlay={0.6}
      style={FILL}
    />
  )
}

export function HeroShader() {
  return (
    <GrainGradient
      colorBack="#06060c"
      colors={["#ff3c79", "#ff79a6", "#3c1a4a"]}
      softness={0.7}
      intensity={0.32}
      noise={0.45}
      shape="wave"
      speed={0.6}
      style={{ ...FILL, opacity: 0.55 }}
    />
  )
}

export function StripShader() {
  return (
    <MeshGradient
      colors={["#06060c", "#ff3c79", "#1a0612", "#9d3cff"]}
      speed={0.4}
      distortion={1}
      swirl={0.6}
      grainMixer={0.5}
      grainOverlay={0.45}
      style={FILL}
    />
  )
}
