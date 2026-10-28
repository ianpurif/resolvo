# Resolvo Atelier 01

Original procedural embroidery machine, created with Blender 4.5.15 LTS. No stock model or third-party textures. The script is the editable source of truth; `embroidery-machine.blend` includes the model and studio lighting.

## Rebuild

Download the [official portable Blender 4.5.15 Windows build](https://download.blender.org/release/Blender4.5/blender-4.5.15-windows-x64.zip), extract under `.local/blender-tools`, then run from the repository root:

```powershell
& .local/blender-tools/blender-4.5.15-windows-x64/blender.exe -b --python scripts/blender/build_machine.py
```

Outputs:

- `public/models/embroidery-machine.glb`: web asset, with embedded roughness maps.
- `public/models/embroidery-machine.manifest.json`: measured geometry counts and attachment points.
- `scripts/blender/embroidery-machine.blend`: editable source with studio setup.
- `.local/blender-preview/atelier-machine.png`: full-machine Cycles render.
- `.local/blender-preview/atelier-needle-macro.png`: needle and presser macro render.

## Scene contract

The GLB already uses Three.js Y-up. `EmbroideryMachine` is at the origin without rotation or scale. Fabric lies in XZ at y=0. Machine sits behind the needle, extending mostly toward positive X and negative Z. The modeled bed is just below the fabric.

`NeedlePivot.position.y` is 1.05 at rest. Move only this group downward by up to 0.33. It contains three material meshes: polished steel, brushed steel and copper. Rest needle tip is [0, 0.20, 0]; eye is [0, 0.32, 0]. At full descent the eye is y=-0.01 and tip y=-0.13. The reciprocating bar spans y=0.51..1.84 at rest; at full descent its lower end clears the presser heel by 0.02 and its upper end stays inside the head. The upper static thread ends at `ThreadGuideLower` [0.03, 1.35, 0.17]; the application draws the changing segment from that guide to the moving eye.

`HandwheelPivot` is centered at [4.20, 2.61, -0.89], with an identity rest rotation. Animate `HandwheelPivot.rotation.x` around its local X axle; its five material meshes rotate as one assembly. The drive axle remains in the static steel group. The spool remains static to keep draw calls modest.

Five named guide empties are preserved in the GLB. Other static geometry is joined into eleven material meshes. The GLB has nineteen primitives total: eleven static, three needle, and five handwheel. It has no required decoder extensions or external resource URLs. Shader texture variation uses two embedded 128px roughness maps. Pass `-- --skip-render` after the build script argument to regenerate the GLB, manifest and editable source without rerendering previews.

The inner tower begins around x=2.75, z=-0.40. Keep the rear-right cloth and hoop within this clearance, or shape their edge to avoid crossing the tower during travel.

## Landing poster

`render_poster.py` opens the saved Blender source and renders a separate 1920x1080 dark studio composition at 64 Cycles samples. It adds original blank ivory linen, a subtle warm floor pool, and empty space on the left for HTML copy. It does not change the machine asset or saved source.

```powershell
& .local/blender-tools/blender-4.5.15-windows-x64/blender.exe -b --python scripts/blender/render_poster.py
node -e "require('sharp')('.local/blender-preview/atelier-hero.png').webp({quality:88,effort:6}).toFile('public/art/embroidery-machine.webp')"
```

## Finished embroidery poster

The kingfisher is authored in `components/landing/cinematic/embroidery-pattern.ts`. Export that exact stitch graph, then render its 2,868 arched thread splines on linen. This is the still edition's finished piece, not a separate stock illustration.

```powershell
node --import tsx scripts/blender/export-pattern.ts
& .local/blender-tools/blender-4.5.15-windows-x64/blender.exe -b --python scripts/blender/render_finished.py
node -e "require('sharp')('.local/blender-preview/embroidery-finished.png').webp({quality:90,effort:6}).toFile('public/art/embroidery-finished.webp')"
```

The live scene uses the same paths and colors, with instanced thread geometry scaled to fit the machine's throat. The gallery render uses a larger presentation frame and Cycles studio lighting. The machine modeling and render scripts were developed with GPT-6 Astra and executed in Blender; all assets are original to this project.
