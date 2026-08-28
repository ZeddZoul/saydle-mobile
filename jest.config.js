module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // server/ is a separate package with its own Vitest suite — `pnpm api:test`.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/server/"],
  collectCoverageFrom: [
    "lib/**/*.js",
    "hooks/**/*.js",
    "contexts/**/*.jsx",
    "components/**/*.jsx",
    "app/**/*.jsx",
  ],
};
