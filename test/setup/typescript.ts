import { register } from "tsx/esm/api";

/**
 * `cds.test` loads the service implementations itself, through Node's own
 * `import()`, outside vitest's transform. Two things make that work for
 * `srv/*.ts`, which is what `cds watch` arranges on its own:
 *
 * - `CDS_TYPESCRIPT` tells CAP to look for `.ts` implementations at all;
 * - the tsx loader resolves the `./lib/x.js` specifiers to their `.ts` files.
 */
process.env.CDS_TYPESCRIPT = "true";
register();
