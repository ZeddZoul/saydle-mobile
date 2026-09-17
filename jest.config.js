module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // server/ is a separate package with its own Vitest suite — `pnpm api:test`.
  // .claude/worktrees/ holds full checkouts of this repo made for background
  // tasks; without excluding them jest runs every test twice, against a tree
  // that is deliberately at a different commit.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/server/", "<rootDir>/.claude/"],
  collectCoverageFrom: [
    "lib/**/*.js",
    "hooks/**/*.js",
    "contexts/**/*.jsx",
    "components/**/*.jsx",
    "app/**/*.jsx",
  ],
};
