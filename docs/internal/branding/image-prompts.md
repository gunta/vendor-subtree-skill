# Image Prompts — Knockout (v2)

Detailed prompts for every brand image. Drop the rendered PNG into [`packages/website/public/visuals/`](../../../packages/website/public/visuals/) under the exact filename in each section — the website is already wired to consume them.

Prompts follow the structure recommended by the [OpenAI image-generation prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide): **Subject → Composition → Action → Setting → Style/Medium → Color → Lighting → Mood → Negative constraints**. Set the aspect ratio in the API call, not in the prompt.

> **Direction:** Effect-track sophistication + Silicon Valley graphic-design production. Single magenta accent on deep void. Liquid metal, dichroic glass, volumetric bloom, film grain, editorial photography composition. References to hold in mind while reading every prompt: Resend, Linear launch films, Effect.website, Vercel mesh era, Sky.work, Granola, Pentagram identity work, Anton Repponen, Active Theory, Lusion.

---

## 0. Visual system (read first, applies to every image)

Hand this paragraph to the model as a leading **style preamble** before every individual prompt. It is what makes the set look like a _set_, not fifteen unrelated renders.

> **Style preamble — Ingraft / Knockout.** A single-frame editorial composition rendered as if photographed by a high-design studio for the launch site of a serious developer-tools company (Pentagram × Resend × Linear × Sky × Vercel-mesh era). Ground is deep near-black — **ink #06060c** at the safe area, deepening to **#03030a** in the vignette corners. A single saturated magenta — **accent #ff3c79** — is the only chromatic event in the entire frame; it is reserved exclusively for the _graft moment_ and behaves as a light source (seam, glow, wedge, halo, bloom, beam). The accent is never a flat fill; it always emits soft volumetric bloom into the surrounding void and into any reflective surface it touches.
>
> Surfaces are organic and tactile, never flat or default-3D: liquid mercury, soft chrome, frosted dichroic glass, brushed titanium, mineral fiber, vapor, smoke, biomorphic ribbons, fluid topology, oil-on-water iridescence. Forms inflate, fuse, and breathe — never extruded, beveled, or skeuomorphic. Where magenta meets chrome, faint dichroic micro-fringes are allowed (cyan-to-orange refraction at the rim, no thicker than 2 px) but the overall image must read as monochromatic-plus-magenta.
>
> Light is volumetric and disciplined: one key bloom around the magenta moment, gentle ambient fill from the deep canvas itself, optional faint god-ray if it serves composition. Real film grain at 18–24% is always present and visibly textural, as if printed at large format on uncoated stock. Camera & lens behavior: 50–85 mm equivalent at f/2.0–f/2.8, slight chromatic aberration around the accent, shallow depth of field that softens far-field edges, micro-vignette into the corners.
>
> Composition follows editorial photography rules: strong negative space (typically 60–70 % of canvas is breathing room), rule-of-thirds anchoring, the magenta moment placed deliberately (not centered by default), generous letterboxing, asymmetric balance. Type, when present, sits in Inter or Geist Display at editorial sizes (tracking −0.02 em); mono accents in Geist Mono / JetBrains Mono.
>
> **Hard negatives — do not produce any of the following.** Stock-photo people, hooded figures, robot hands, "code on glass" cliché, glowing-laptop scenes, AI-cyberpunk neon-overload, isometric developer cubes, vector flat-illustration aesthetic, twee whimsical illustration, hand-drawn line-art, ink-engraving, vintage / letterpress / botanical / Victorian / Penguin-Classics / O'Reilly-animal aesthetics, brown / beige / cream / sepia / watercolor palettes, rainbow gradients, more than one accent color, lens-flare clip-art, low-poly 3D, plastic shading, default-Blender or default-Octane chrome, NFT holograms, generic "abstract data" wallpaper, scrolling Matrix text, screens, monitors, terminals, keyboards, dashboards, charts, real human anatomy, real plants, real trees, brand logos other than ours.

---

## 1. Hero — `hero-graft.png`

| Spec               | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| **Filename**       | `packages/website/public/visuals/hero-graft.png`               |
| **Dimensions**     | 2400 × 1350 (16:9)                                             |
| **Where it lives** | `.hero` background image on the landing page                   |
| **Format**         | PNG, sRGB, soft edges bleeding to transparency on left & right |

### Prompt

> _[style preamble]_ &nbsp; **Subject.** Two impossibly-smooth liquid-chrome ribbons floating horizontally through the deep void, each tapering to a wedge-point as they approach each other from the left and right thirds of the frame. Their cores are mirror-bright; their edges soften into dichroic violet-to-cyan micro-refraction. The two wedge-points meet at a single perfect seam slightly right of optical center, and at that exact contact point a single brilliant **magenta seam of light** ignites — only 2–3 px thick at its hottest core but bleeding a wide soft bloom of magenta into the surrounding chrome and outward into the void. The chrome surfaces nearest the seam pick up the magenta as reflected light; the chrome surfaces farthest from the seam remain mercury-silver. Faint vapor trails, almost invisible, drift downward beneath the seam. **Composition.** Ultra-wide letterbox 16:9; the seam anchors at the right vertical-third intersection; both ribbons taper completely out of frame at the extreme left and extreme right edges; massive negative void above (top 35 %) and below (bottom 35 %) the seam line; a faint god-ray descends from the upper-left corner at 22°, barely visible. **Color.** Void #06060c → #03030a in the corners, chrome from #f0f0f5 (highlights) through #6a6a78 (mid) to #1a1a22 (rim shadow), magenta seam #ff3c79 with a softer bloom-falloff #ff79a6 → transparent. **Lighting.** One key bloom at the seam; gentle vignette; 22 % film grain. **Camera.** 65 mm, f/2.0, slight chromatic aberration around the magenta, shallow DOF dropping the far ends of the ribbons just out of crispness. **Mood.** The precise biological-mechanical instant of fusion, captured at print quality.

### Notes

- Generate at 4 K (4096 × 2304), downscale to 2400 × 1350 for delivery.
- Bleed the leftmost and rightmost 8 % into transparency so the page background can blend through.
- This image is the brand. Spend the most iterations here. Aim for at least 8 variations before picking.

---

## 2. Hero (dark / intense variant) — `hero-graft-dark.png`

| Spec               | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Filename**       | `packages/website/public/visuals/hero-graft-dark.png`                      |
| **Dimensions**     | 2400 × 1350 (16:9)                                                         |
| **Where it lives** | Deep-theme hero background, used when the page is on `theme=dark` or OLED. |

### Prompt

> _[style preamble]_ &nbsp; Same composition, surfaces, and physics as `hero-graft.png`. Push everything one stop darker and one stop more intense: void deepens to true black **#020207** at the corners; the chrome ribbons go quieter (highlights drop to #c8c8d0, mid to #4a4a55) so the seam reads as the only light in the room. The magenta seam itself intensifies — its bloom radius widens 1.4×, and at the contact point a small star-burst of light flares outward in a four-point cross. Faint magenta vapor (5 % opacity) drifts upward from the seam over the next 25 % of the frame above it. Grain rises to 26 %. Mood: the same fusion event, but observed from a darker room.

---

## 3. Social share — `og-default.png`

| Spec               | Value                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Filename**       | `packages/website/public/visuals/og-default.png`                                                         |
| **Dimensions**     | 1200 × 630 (Open Graph 1.91:1)                                                                           |
| **Where it lives** | `<meta property="og:image">` on every page                                                               |
| **Format**         | PNG, sRGB, ≤ 280 KB                                                                                      |
| **Typography**     | _Composite text in post (SVG → PNG) for pixel-perfect legibility — do not ask the model to render text._ |

### Prompt (background plate only)

> _[style preamble]_ &nbsp; **Subject.** A horizontal poster background. Left two-thirds: a tight portrait-crop of the hero motif — two chrome ribbons fusing into a single magenta seam, rotated 38° so the seam runs from lower-left to upper-right; the magenta bloom is generous and clearly the focal point. Right one-third: pure breathing negative space at #06060c with full grain, with a single 1-pixel hairline rule in 35 % magenta running vertically 64 px inside the right edge from y=120 to y=510. **Composition.** 1.91:1 letterbox; the magenta moment anchors at the left vertical-third; the right third is deliberately empty for compositing the wordmark and tagline in post-production. **Mood.** A title plate from a serious launch.

### Post composite (do this in SVG → PNG, not via the model)

After the background renders, layer the typography:

- **Wordmark** `ingraft` — Inter or Geist Display, weight 700, 88 pt, fill `#f4f4f7`, tracking −0.025 em, baseline at y=298, x-origin at 808.
- **Tagline** `Vendor source for agents.` — Inter, weight 400, 28 pt, fill `#9da0a8`, tracking +0.02 em, baseline at y=348.
- **Accent rule** the existing magenta rule on the plate already serves; do not double-up.

### Notes

- Also export `og-default@2x.png` at 2400 × 1260 by rendering the background at 2× and re-compositing the text at 2× pt sizes.
- Variant `og-docs.png`: identical plate, post-composite tagline becomes `Read the source.` instead of `Vendor source for agents.`

---

## 4. Strategy triptych

Three square plates, designed as a clear visual family. Each is the **same abstract motif** under a different state of joining: **fused**, **pinned**, **adjacent**. The website renders them in a row, so they must look like siblings.

### 4a. `strategy-subtree.png` — _fused_

| Dimensions   | 1200 × 1200 (1:1)                                      |
| ------------ | ------------------------------------------------------ |
| **Filename** | `packages/website/public/visuals/strategy-subtree.png` |
| **Where**    | "Subtree by default" card on the landing page          |

> _[style preamble]_ &nbsp; **Subject.** A single continuous liquid-chrome ribbon flowing in a slow S-curve from upper-left to lower-right of the frame, its core illuminated from within by an unbroken **magenta seam of light** running the entire length of the ribbon's spine. The ribbon's body is mirror-chrome on its outer surfaces, picking up rich magenta reflections along its inner spine. The seam is mature, healed, integrated — the ribbon's two original halves are now indistinguishable except for the seam-light. **Composition.** Square; the S-curve anchors at the optical center; the ribbon enters from upper-left at y=180 and exits lower-right at y=1020; massive negative void in the upper-right and lower-left quadrants. Faint magenta haze 4 % opacity surrounds the entire ribbon. **Mood.** Permanence, full integration. **Negative.** No visible breaks in the seam, no pin or staple, no second ribbon.

### 4b. `strategy-submodule.png` — _pinned_

| Dimensions   | 1200 × 1200                                              |
| ------------ | -------------------------------------------------------- |
| **Filename** | `packages/website/public/visuals/strategy-submodule.png` |
| **Where**    | "Submodule when needed" card                             |

> _[style preamble]_ &nbsp; **Subject.** Two liquid-chrome ribbons run parallel along the diagonal from upper-left to lower-right, separated by a precise 18-pixel gap. They are held together at three points along the gap by **three small luminous-magenta "pins"** — each pin is a tight wedge of magenta light, ~80 px long, perpendicular to the gap, with a soft bloom radiating outward. Between the pins, the gap is dark void; only the three pins emit light. The chrome reflects the magenta at each pin location and remains mirror-silver elsewhere. **Composition.** Square; ribbons enter from upper-left at x=120, exit lower-right at x=1080; the three pins are evenly spaced at y=300, y=600, y=900. **Mood.** Deliberately separable. The joining exists at exactly the points we chose. **Negative.** No continuous seam, no welded look, no fastener that resembles real-world hardware.

### 4c. `strategy-clone-ignore.png` — _adjacent_

| Dimensions   | 1200 × 1200                                                 |
| ------------ | ----------------------------------------------------------- |
| **Filename** | `packages/website/public/visuals/strategy-clone-ignore.png` |
| **Where**    | "Clone and ignore" card                                     |

> _[style preamble]_ &nbsp; **Subject.** Two liquid-chrome ribbons float vertically, side by side, parallel but not touching — a 64-pixel gap of pure void between them. Down the center of the gap runs a single soft **dashed magenta line of light** (12 px dash, 8 px space), reading as a boundary marker, the kind you would draw on a map. No seam, no pins, no fusion — only the dashed magenta line. The chrome reflects only the faintest hint of magenta from the dashed line; both ribbons remain almost entirely mirror-silver. **Composition.** Square; ribbons centered vertically as a pair; the gap lies exactly at x=600 (canvas center); ribbons taper out of frame at top and bottom. **Mood.** Adjacent, parallel, untracked, deliberately apart. **Negative.** No fence, no wall, no continuous line — the dash pattern matters.

---

## 5. Section plates

Five square 1000 × 1000 plates, used as decorative banners at the top of docs pages. Same brand world as the strategy triptych but simpler — **one motif each**, less density, more breathing room.

### 5a. `section-getting-started.png` — _the prepared instrument_

> _[style preamble]_ &nbsp; **Subject.** A single liquid-chrome scalpel-like instrument (abstract — not a real scalpel) floating diagonally across the frame from upper-left handle to lower-right blade-tip. The blade-edge is a thin precise **magenta line of light** running the entire cutting edge; the blade body is mirror-chrome with deep contour shadows; the handle is brushed titanium with soft chrome highlights. Beside the instrument, lower-left of the blade, a small floating organic chrome shape — biomorphic, two tiny spherical "buds" emerging from its surface, also reflecting faint magenta. **Composition.** Square; instrument anchors on the diagonal from upper-left (1/4 in from edges) to lower-right (1/4 in from edges); generous negative space upper-right. **Mood.** A precision instrument laid out before work begins.

### 5b. `section-doctor.png` — _the diagnostic pulse_

> _[style preamble]_ &nbsp; **Subject.** A single chrome bell-shape (rounded, hollow on the underside, like a small acoustic dome) floats at the canvas center against the void. From the center of the bell, **three concentric soft-magenta rings** emanate outward and fade as they expand — the closest ring is bright and crisp, the middle ring softer, the outermost almost dissolved into the void. The bell itself reflects faint magenta in its underside hollow. **Composition.** Square; bell occupies the central 38 % of the canvas, rings extend to the canvas edges; vertical axis of symmetry. **Mood.** Diagnostic, patient, listening to the substrate.

### 5c. `section-version-sync.png` — _the synced rotation_

> _[style preamble]_ &nbsp; **Subject.** Two concentric thin chrome rings (outer ring radius 38 % of canvas, inner ring radius 28 %), each rotating around the same center on the canvas plane, the outer fractionally offset to the inner. Where the two ring edges align at the **12-o'clock position**, a small **magenta light-tick** marks the exact sync point and radiates a tight bloom (~60 px radius). Both rings show subtle motion-streak hints (1 px chromatic trails) suggesting rotation. Elsewhere, the rings are pure mirror-chrome on void. **Composition.** Centered; rings fill 70 % of the canvas; magenta tick at top-12. **Mood.** Mechanical precision, harmony, alignment.

### 5d. `section-tooling.png` — _the instrument tray_

> _[style preamble]_ &nbsp; **Subject.** An editorial flat-lay of six small abstract chrome implements arranged in a strict 3×2 grid on the void canvas — each implement is a biomorphic mirror-chrome sculpture (no recognizable real-world tool — pure abstract objects, varying in form: a flat blade-like shape, a rolled cylinder, a sphere-on-stem, a hooked curve, a stacked pair, a torus). One implement, the **lower-center** position, contains a magenta-glowing core visible through its chrome shell, emitting a soft bloom; the other five remain pure mirror-silver. **Composition.** Strict 3×2 grid; equal spacing 12 % of canvas between cells; baseline-aligned; generous outer canvas margins (~10 % each side). Camera: top-down, soft falloff into the corners. **Mood.** A designer's instrument tray.

### 5e. `section-cli-reference.png` — _the cursor_

> _[style preamble]_ &nbsp; **Subject.** A single tall thin chrome column rises vertically from the lower third of the canvas — about 4 % of canvas width, 50 % of canvas height — like a precision beacon or strand. At its base, a tight **magenta vertical line of light** (the cursor) blinks against the void, only 3 px wide but radiating a soft circular bloom outward. The chrome column above is mirror-quiet, picking up the faintest magenta near its base and going entirely silver toward its top. **Composition.** Square; column slightly left of center (x ≈ 460), cursor at the lower-third intersection (y ≈ 660); vast empty void above. **Mood.** The command line as artifact, the cursor as a single point of intent.

---

## 6. Background texture — `texture-blueprint.png`

| Spec               | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Filename**       | `packages/website/public/visuals/texture-blueprint.png`                                  |
| **Dimensions**     | 2048 × 2048, designed to tile seamlessly                                                 |
| **Where it lives** | Subtle `background-image` repeat on `.landing-shell` and similar marketing-page surfaces |

### Prompt

> _[style preamble]_ &nbsp; **Subject.** A near-invisible tiling texture. Base layer: pure deep void **#06060c** with a faint 3 %-opacity dot grid on a 56 px lattice. Mid layer: three or four extremely faint chrome-thread ribbons (5 % opacity each) drifting through the canvas at gentle angles, soft-edged, never crisp. Top layer: a sparse field of single-pixel **magenta points** at irregular grid intersections — no more than **ten** points across the entire 2048 × 2048 canvas; each point sits exactly on a grid crossing. Heavy grain (24 %) baked into the base. **Composition.** Left edge must tile seamlessly against right edge; top against bottom — test by tiling 3 × 3 and confirming no visible seam. **Mood.** Paper substrate for the brand; almost invisible. **Negative.** If overlaying this at 8 % opacity over a page makes the viewer notice the texture, it failed — must read as paper, not graphic.

### Notes

- Verify the tile by previewing at 8 %, 14 %, and 20 % opacity over a real page section before committing.

---

## 7. Logomark (refined raster) — `logomark.png`

The primary vector mark lives at `packages/website/src/assets/logo-light.svg` and is recreated below in the new direction. This PNG is for social avatars, OG fallbacks, and slide intros.

| Spec           | Value                                          |
| -------------- | ---------------------------------------------- |
| **Filename**   | `packages/website/public/visuals/logomark.png` |
| **Dimensions** | 1024 × 1024                                    |
| **Format**     | PNG, sRGB, may be opaque or transparent        |

### Prompt

> _[style preamble]_ &nbsp; **Subject.** A square mark on the deep void canvas with subtle grain. The mark itself is the **turnstile**: a vertical liquid-chrome bar centered along the left of the mark's optical center (bar width 8 % of canvas, height 70 % of canvas), and to the bar's right at its mid-height a **magenta wedge of light** (the scion) pointing right, the wedge built from the magenta seam-light treatment — bright magenta core at the bar contact point, soft bloom radiating outward into a wider triangular shape, fading into the void by 32 % of canvas width to the right of the bar. The chrome bar reflects strong magenta at the contact point and softens upward and downward. **Composition.** Mark inscribed in an 78 %-of-canvas central square; equal margins; rounded square framing (radius 184 px) is not required — let the void itself be the frame. **Camera.** Telecentric, perfect frontal, no perspective distortion. **Negative.** No text characters anywhere, no bevel, no inner-glow stroke, no plastic shading, no default-3D chrome material, no extruded depth.

### Notes

- Also produce a transparent-background variant for slide overlays: same mark, background fully transparent, magenta and chrome composited with proper premultiplied alpha.
- The SVG primary mark at `src/assets/logo-light.svg` should be rewritten by hand in code to match: chrome bar in `#f0f0f5` with a subtle linear-gradient, magenta wedge in `#ff3c79` with a stop into `#ff79a6` and a soft Gaussian-blur halo behind it. (See spec doc.)

---

## Generation cheat-sheet

| Tool                          | Suggested model                                                                                            | Aspect-ratio handling                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `uhd-text-to-image` (default) | `banana` (Nano Banana Pro) for hero / OG / logo; `banana2` (Nano Banana 2) for sections, strategy, texture | aspect specified at request time                            |
| OpenAI `gpt-image-1`          | `gpt-image-1`                                                                                              | `size: "1536x1024"` for hero, `"1024x1024"` for square      |
| Seedream v4.5                 | Artistic backup                                                                                            | Avoid for sharp specular highlights — softens them too much |

When iterating, hold the **style preamble** constant and vary only the **Subject** and **Composition**. That is the discipline that produces a coherent set rather than fifteen unrelated renders. Generate **8 variations of the hero at 1K**, pick the strongest, then re-render that single prompt at 4K for delivery. For sections, **4 variations at 1K** is enough.

## Post-processing checklist

After download, before committing to `public/visuals/`:

1. Open in a pixel editor and verify the accent is exactly `#ff3c79`. If it drifted (common — models bias toward pink), run a hue-clamp pass: anything that reads as magenta should clamp to `#ff3c79` ± 8 in hue.
2. Confirm there is **no other accent color** in the image — no second-color bloom, no rainbow rim, no green or yellow leakage. Saturated non-magenta colors are a fail.
3. Verify the void corners read as `#03030a`–`#06060c`, not blue, not brown. If the model added warmth or coolness to the void, neutralize with a curves pass on saturation in the shadows.
4. Crop to listed dimensions exactly.
5. Verify the **grain is visible at delivery size**. If grain has smoothed out, add 12–18 % monochrome film grain in post (Photoshop noise filter, monochromatic, gaussian).
6. Run `pngquant --quality 80-95` to land each file under 300 KB (under 200 KB for the OG card).
7. Strip metadata: `exiftool -all= file.png`.
8. Lay all fifteen renders on a contact sheet at 200 px each — they must read as one family. If any one image looks like an outlier, re-render that one. The set-coherence pass is more important than any single image being perfect.
