# Resolvo — a study in connection

The landing page follows one original kingfisher embroidery from blank linen to the finished piece. The spatial storytelling of [ATMOS by LEEROY](https://atmos.leeroy.ca/) informed the camera-led approach. The machine, pattern, materials, imagery and animation are original to Resolvo.

## Nine chapters

| Chapter | What changes in the scene |
| --- | --- |
| The atelier | The detailed machine, blank fabric, threaded guides and handwheel establish the craft. Light, camera and thread move before scrolling. |
| The idea | The drawing appears on the fabric, using the same contours as the embroidery. |
| The foundation | The camera approaches the woven linen and needle assembly as the frame moves into position. |
| The first stitch | The frame feeds beneath the raised needle; it stops before the needle penetrates and deposits each stitch. |
| Finding form | Branches, feet, beak, body and wing outlines accumulate. |
| A little life | Directional fill stitches build teal feathers and a copper breast. Three thread palettes recolor the actual geometry. |
| The finishing touches | A macro shot follows feather shafts, the eye, flower details and the stitched signature. |
| The whole picture | The completed frame leaves the needle and turns toward the viewer. Its thread remains connected; inspection brings the stitches closer. |
| Carry it forward | The camera holds the same completed piece beside the real workspace link. |

The story spans 15.5 screens. The final two chapters occupy 3.2 screens. Native scrolling, including reverse scrolling, controls the entire process. There is no entry gate, wheel interception or fake scroll container.

## Blender and Astra

GPT-6 Astra developed the original machine model and render pipelines, executed with Blender 4.5.15 LTS. The editable `.blend`, Python build scripts, graph exporter and render commands are in `scripts/blender/`.

- `public/models/embroidery-machine.glb`: 3.34 MB, 117,466 triangles and 19 material primitives. No decoder or external texture service is required.
- Separate `NeedlePivot` and `HandwheelPivot` rigs drive the mechanism. Five named thread guides establish the continuous route from spool to needle.
- Beveled porcelain casing, recessed slate panels, copper fittings, brushed steel, open needle eye, presser foot, feed teeth, screws, engraved branding and wound yarn provide modeled detail.
- `public/art/embroidery-machine.webp`: immediate 1920×1080 Blender studio poster.
- `public/art/embroidery-finished.webp`: Blender gallery render of the exact 2,868-stitch graph, used by the still edition.

The live fabric is scaled to fit the measured machine throat throughout its travel. The web and gallery render share the original pattern paths and colors; each renderer constructs suitable thread geometry and lighting.

## Implementation

- `embroidery-pattern.ts`: original bird and botanical contours, scan-line fill paths, detail strokes and distance-indexed stitch timeline. The draft, needle position and completed stitches derive from this one graph.
- `embroidery-materials.ts`: generated warp/weft color and normal maps, linen fibers, rectangular frame, instanced raised thread and a reusable dynamic thread tube.
- `journey.ts`: nine chapter anchors, separate continuous desktop/portrait camera tracks, bounded scroll response, sewing phases and framebuffer budget.
- `scene.ts`: GLB loading, studio environment, lighting, synchronized fabric feed and needle cycle, reversible stitch visibility, palette/inspection controls and GPU lifecycle.
- `cinematic-stage.tsx`: asynchronous Three.js loading and React lifecycle boundary.
- `landing-page.tsx` / `cinematic.css`: short semantic story, native navigation, smoothly changing contrast scrims, grain, keyboard controls and still edition.

The frame moves only during the raised-needle phase. The needle penetrates after the feed completes; a stitch appears at the lock phase. Its 0.33 stroke carries the eye below the linen. Blender intersection checks at five stroke positions verify clearance from the presser foot and continued insertion into the head. Unsewn travel segments connect separate fields. Reversing the scroll restores the exact previous stitch prefix rather than replaying an independent animation.

## Performance and accessibility

The scroll listener writes its target synchronously. A single 32 ms filter, limited to a 0.004 timeline lag, drives the camera, fabric, needle and stitch count together. The pointer and optional inspection view have separate interaction easing, without adding another scroll filter.

Rendering has a total pixel budget: at most 2,000,000 desktop pixels or 1,150,000 mobile pixels, including on a 4K/high-density display. Slow frame samples can reduce that budget to 950,000. This replaces the previous DPR-only limit. Text stays at native browser resolution.

All 2,868 stitches share one instanced draw. The complete scene uses roughly 22–31 draws after its initial shadow pass. Machine shadows are cached; the background uses a static grain tile instead of the previous full-screen procedural shader. There are 120 subtle dust particles. No full-screen backdrop blur or animated blend effect is required.

Hidden documents stop scheduling frames. Pause stops ambient time and idle GPU rendering while deliberate scrolling and controls remain usable. Navigation releases geometry, materials, textures, listeners, animation callbacks and the detached canvas context. Development refresh can reuse a canvas without losing the new renderer's context.

Reduced motion starts with local Blender artwork and creates no WebGL context. The user can explicitly enable motion. Unavailable WebGL, model fetch failure, shader failure or lost context restores the still edition. Touch panning, pinch zoom, chapter links, keyboard palette choices and the real `/login` entry remain available.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser`.

The application has 65 automated tests, including continuous camera paths, 4K/ultrawide pixel limits, prompt reverse-scroll response, deterministic stitch reconstruction and the needle/feed relationship. The browser suite retains its 20 workspace checks and adds 11 checks for actual GLB rendering, ambient movement, pause, pointer interaction, nine chapters, progressive and reversed stitches, palettes, inspection, large displays, mobile, reduced motion, lifecycle and failure recovery.

Verification passed: 65 automated tests, all 31 application/browser checks, all 11 cinematic checks against the optimized production build, lint, TypeScript and the production build. The final needle stroke also passes the targeted mechanical tests and Blender clearance checks.

Full application browser evidence is in `.local/verification/browser-evidence.json`. Production cinematic results are in `.local/embroidery-production/evidence.json`, with screenshots and `cinematic-performance.json` beside it. The 1440p/4K run used 25 draws and stayed within the pixel and timeline-lag limits. A final mobile inspection check verifies contrast and returning from the close-up view.

Browser evidence uses local Chromium with software WebGL available. The workspace suite uses PGlite and fixture authentication/provider transports. These checks do not establish physical 32-inch monitor frame rate, hosted deployment or live provider behavior. Dependencies, authentication, RAG, data permissions and application routes are unchanged by this landing-page revision.
