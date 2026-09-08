import { bootstrapGoogleCredentials } from "./googleCredentials.js";

/**
 * Side-effect module, imported first by index.js. ESM hoists imports above any
 * statements, so "run this before everything else" has to be an import itself.
 */
bootstrapGoogleCredentials();
