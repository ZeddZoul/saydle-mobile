import fs from "fs";
import path from "path";

/**
 * Every name a module imports from lib/config.js must actually be exported.
 *
 * This exists because of a real outage. A regex removing TRIAL_DAYS used
 * `/\*\*.*?\*\/` with DOTALL and matched from the first doc comment in the file
 * all the way down, deleting API_URL, REQUEST_TIMEOUT_MS and
 * DELETION_GRACE_DAYS along with it. Every request in the app then went to
 * `undefined/api/...`, threw, and surfaced as "Could not reach Saydle. Check
 * your connection."
 *
 * Nothing caught it. ESLint does not flag importing a name a module no longer
 * exports — at runtime that is `undefined`, not an error — and all 469 tests
 * passed throughout, because every test injects a mock client and none of them
 * ever reads the real base URL.
 *
 * So this checks the one thing the type system would have: that the imports
 * and the exports agree.
 */
const ROOT = path.resolve(__dirname, "../..");
const CONFIG = path.join(ROOT, "lib/config.js");

const SEARCH_DIRS = ["app", "components", "hooks", "lib", "contexts"];

/** Every source file that might import from config. */
function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") sourceFiles(full, acc);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const exported = new Set(
  [...fs.readFileSync(CONFIG, "utf8").matchAll(/export const (\w+)/g)].map((m) => m[1]),
);

describe("lib/config.js exports what the app imports", () => {
  it("has at least the load-bearing ones", () => {
    // Named explicitly: a regex could delete every export and the pairwise
    // check below would still pass, because nothing would be importing them.
    for (const name of ["API_URL", "REQUEST_TIMEOUT_MS"]) {
      expect(exported).toContain(name);
    }
  });

  it("exports every name any module imports from it", () => {
    const missing = [];

    for (const dir of SEARCH_DIRS) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const src = fs.readFileSync(file, "utf8");
        for (const m of src.matchAll(
          /import\s*\{([^}]+)\}\s*from\s*["'][^"']*\/config\.js["']/g,
        )) {
          for (const raw of m[1].split(",")) {
            const name = raw
              .trim()
              .split(/\s+as\s+/)[0]
              .trim();
            if (name && !exported.has(name)) {
              missing.push(`${path.relative(ROOT, file)} imports ${name}`);
            }
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
