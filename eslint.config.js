// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettier = require("eslint-config-prettier");
const globals = require("globals");

/**
 * One config for the whole workspace.
 *
 * The mobile app and the API are different environments — React Native and
 * Node — so they get different globals, but the same rules otherwise. Keeping
 * it in one file means `pnpm lint` covers everything; a second config in
 * server/ would be one more thing to remember to run.
 *
 * `eslint-config-prettier` comes last and only turns rules OFF: formatting is
 * Prettier's job, and having two tools argue about it wastes everyone's time.
 */
module.exports = defineConfig([
  expoConfig,

  {
    // Build output, native projects, and the coverage report are all generated.
    ignores: [
      "dist/*",
      "ios/*",
      "android/*",
      "coverage/*",
      "node_modules/*",
      "server/node_modules/*",
    ],
  },

  {
    // The API is Node ESM, and never sees a browser or React Native global.
    files: ["server/**/*.js", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
      ecmaVersion: "latest",
    },
  },

  {
    files: ["server/tests/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ["__tests__/**/*.{js,jsx}", "jest.setup.js"],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
  },

  {
    rules: {
      // Unused code is a real signal, not a style preference — but a leading
      // underscore is the conventional way to say "deliberately ignored".
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  prettier,
]);
