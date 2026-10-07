import { ContextAsyncStorage } from "./core.js";

/**
 * Public surface of the library.
 *
 * Re-exporting the class keeps `src/core.js` focused on implementation while
 * giving callers a single entry point. No default export is provided on
 * purpose: named exports make grepping for usages trivial.
 */
export { ContextAsyncStorage };
