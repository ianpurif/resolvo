# Resolvo — Knowledge weave

`knowledge-weave.webp` is the original textile artwork used on the landing and sign-in pages. Generated with the built-in ImageGen tool on 2026-10-28, reviewed visually for textile detail and composition, then encoded locally with Sharp at WebP quality 86. Dimensions: 1536 × 1024. Size: 260,024 bytes. The unmodified generation remains in the Codex generated-images library; the application uses only this local optimized asset.

The artwork provides the public-facing atmosphere. Productivity screens use restrained color, typography, and a small code-native stitched motif instead of decorative raster imagery. The existing Resolvo logo remains unchanged.

## Surface grain

`fine-grain.svg` is a small, original procedural texture inspired by the supplied film-grain references. A fixed seed and seamless 180px tile keep it static and repeatable. CSS applies stronger grain to public artwork and dark atmospheric surfaces, and a quieter treatment to workspace and authentication backgrounds. The texture stays behind content and never receives pointer events; forms, reading surfaces, and controls retain their solid backgrounds. It is hidden in print, forced-color mode, and when increased contrast is requested. No JavaScript, animation, external request, or added dependency is needed.

The landing page uses `tactile-grain.svg`, a separate 240px tile with wider grain variation and 2.6× tonal contrast so the texture remains visible at normal viewing size. Layered blue/teal washes give the hero and closing section depth; the product frame, preview toolbar, dark source section, and primary buttons carry the same material treatment. The working application retains the quieter texture. Both assets are original code-native SVGs, not extracted from the reference images.

## Exact generation prompt

Use case: stylized-concept. Asset type: original premium editorial website hero artwork for Resolvo, a company knowledge AI workspace. Create a wide landscape composition, approximately 3:2. Subject: a meticulously crafted sculptural weave of hundreds of fine silk threads, three broad blue and deep teal ribbons interlacing into one elegant open loop, representing disparate knowledge becoming connected. The thread-level texture and tiny woven stitches must be visible and tactile, like a museum-quality textile artwork photographed with a macro product lens. Composition: the sculpture occupies the right two-thirds, with generous pale mist-blue negative space on the left for live website typography. Crop a few fine loose threads gracefully at the bottom; keep the main loop intact. Backdrop: softly lit seamless pale blue-gray studio surface, subtle paper grain, delicate physical shadows. Palette: midnight navy, petrol teal, icy blue, a few ivory threads, no purple. Lighting: soft daylight from upper left, exquisite fiber detail, restrained tonal depth, sophisticated and calm. No text, letters, logo, watermark, UI, cards, icons, circuitry, glowing effects, plastic tubes, chrome, or generic AI blobs. This is an original tangible embroidered textile sculpture, not a digital network diagram.

## Typeface source

Instrument Serif regular and italic are from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/instrumentserif), licensed under the SIL Open Font License included in `public/fonts/OFL-instrument-serif.txt`. Manrope remains the working-interface typeface; Instrument Serif provides the editorial voice.
