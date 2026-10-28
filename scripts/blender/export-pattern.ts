import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createEmbroideryPattern } from "../../components/landing/cinematic/embroidery-pattern";

const pattern = createEmbroideryPattern();
writeFileSync(
  join(process.cwd(), "scripts/blender/embroidery-pattern.json"),
  JSON.stringify({
    stitches: pattern.stitches,
    cloth: { width: 5.5, height: 3.65 },
  }),
);
console.log(
  `Exported ${pattern.stitches.length} original stitches for Blender.`,
);
