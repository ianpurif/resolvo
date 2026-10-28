# Resolvo: a living thread

The landing page is a continuous, interactive Three.js scene, inspired by the spatial storytelling and camera-led transitions of [ATMOS by LEEROY](https://atmos.leeroy.ca/). Its assets and implementation are original to Resolvo; the reference's models, media, and code are not reused.

## The experience

1. **Arrival:** an illuminated woven sculpture breathes and turns before scrolling. Pointer movement changes its perspective; dragging turns the weave.
2. **Sources:** the camera pulls back to a constellation of document, web, and note objects. Source controls and direct object selection highlight the corresponding objects.
3. **Connection:** particles enter the weave as the camera travels through it. The same sculpture and sources persist through the transition.
4. **Evidence:** the camera emerges beside an answer surface connected to its sources. Selecting a source traces its path.
5. **Beginning:** the scene settles around the invitation to open the real workspace.

Native scroll supplies normalized chapter anchors. Authored camera and object tracks use cubic interpolation, with damped pointer motion and an independent ambient clock. No wheel hijacking, scroll-jacking, or forced entry gate. The original brand, blue/teal palette, stitched surfaces, and visible film grain remain the visual foundation.

## Architecture and assets

- `components/landing/cinematic/journey.ts`: deterministic interpolation, scene poses, chapter anchors, and source descriptions.
- `geometry.ts`: original braided ribbon meshes, individual filaments, paper surfaces, tactile material maps, and source illustrations generated locally in code.
- `shaders.ts`: atmospheric background, flowing particles, the etched floor, and pulsing source connections.
- `scene.ts`: renderer lifecycle, lighting, authored camera choreography, selection, adaptive resolution, and resource disposal.
- `cinematic-stage.tsx`: lazy loading and imperative scene lifecycle.
- `landing-page.tsx` and `cinematic.css`: short semantic story, native links, chapter navigation, source controls, reduced-motion preference, fallback, and motion control.

The application, authentication routes, data sources, RAG pipeline, and permissions are unaffected. The visual scene illustrates the product; it does not invent company data or call a provider.

## Rendering and accessibility

The renderer uses WebGL2 through Three.js 0.186.1. It is loaded asynchronously only for this page when motion is allowed. An immediate, local woven poster and server-rendered copy precede the first GPU frame. There is no loading gate or external asset request. A lost context, unavailable WebGL, shader compilation failure, or failed module load returns to the still edition.

The original six-ply braid includes elliptical cross sections, separate fine filaments, and a generated warp/weft bump map. Sources and the curved answer surface have original canvas textures. The journey includes 1,500 moving particles on desktop (650 on mobile), a 32-thread tunnel, studio environment lighting, atmospheric shaders, and visible film grain. Manual sculpture rotation fades out during the camera's passage to preserve the aperture.

Resolution is capped at 1.6 DPR on desktop and 1.25 on mobile, with an adaptive floor of 0.85. Mobile starts with fewer geometry segments and source objects. Animation stops while the document is hidden, and all geometry, textures, materials, listeners, and GPU context are disposed on navigation. Pausing freezes ambient time while retaining deliberate scrolling and interaction.

Reduced motion defaults to a static edition without creating a WebGL context; the user can explicitly enable motion. Scrolling, chapter links, touch panning, pinch zoom, keyboard source controls, and workspace entry remain native browser interactions. Mobile and short portrait viewports use a different composition, with visual objects below the copy.

## Verification and evidence

- `npm test`: 64 passing tests, including camera continuity, authored endpoints, viewport adaptation, scroll mapping, and the existing application tests.
- `npm run test:browser`: 28 passing checks. The original 20 checks exercise fixture-backed authentication, knowledge ingestion, persistent conversations, citations, tickets, tenant boundaries, and responsive layouts. Eight added checks exercise actual WebGL output, ambient animation, pause, dragging, all chapters, reverse scrolling, source selection, mobile controls, reduced motion, context loss, and unavailable WebGL.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- The eight WebGL checks also run against the optimized production build. Screenshots and their result are in `.local/cinematic-production/`; the continuous scroll recording is `resolvo-cinematic-tour.webm`. Full application fixture evidence is in `.local/verification/browser-evidence.json`.

Browser rendering was verified in Chromium with software WebGL available. This is local rendering and fixture verification, not a hosted deployment, live provider test, or physical-device frame-rate benchmark.

The install audit reports existing findings in Next.js, Undici, and Zod (two high, one critical). Their locked versions are unchanged by this work. Three.js and its types are the only direct dependency additions; dependency upgrades are outside this visual change.
