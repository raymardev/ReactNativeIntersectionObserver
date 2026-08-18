/**
 * Packaging invariants for the published artifact.
 *
 * The point of this file is that every assertion is about a **built file**, not
 * about the text of a manifest. Asserting `package.json.main === 'dist/index.js'`
 * is what the old suite did, and it passed for a package whose `dist/index.js`
 * did not exist and could not be produced. So: resolve the entry points, load
 * the compiled module, and check the API is really there.
 *
 * These run against the output of `npm run build`, which is the same order CI
 * uses (build, then test).
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require(join(ROOT, 'package.json')) as {
  name: string;
  main: string;
  types: string;
  files: string[];
  peerDependencies: Record<string, string>;
};

const DOCUMENTED_HOOKS = [
  'useIntersectionObserver',
  'useScrollToBottom',
  'useScrollToTop',
  'useScrollToCenter',
  'useElementIntersection',
] as const;

describe('published entry points', () => {
  it('has a main field pointing at a file that exists on disk', () => {
    expect(existsSync(join(ROOT, manifest.main))).toBe(true);
  });

  it('has a types field pointing at a declaration file that exists on disk', () => {
    expect(manifest.types).toMatch(/\.d\.ts$/);
    expect(existsSync(join(ROOT, manifest.types))).toBe(true);
  });

  it('lists the build output in files, so dist is actually published', () => {
    // A package that builds dist but forgets to list it publishes an empty
    // tarball whose main field points at nothing.
    expect(manifest.files).toContain('dist');
  });

  it('does not publish the tests, in dist or in src', () => {
    // `src` is shipped for source maps, so the tests have to be excluded
    // explicitly; and tsconfig must keep them out of the build output.
    expect(manifest.files).toContain('!src/__tests__');
    expect(existsSync(join(ROOT, 'dist', '__tests__'))).toBe(false);
  });

  it('exposes every documented hook from the built entry point', () => {
    // Loading the artifact the way a consumer's bundler would, rather than the
    // TypeScript source the other suites import.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const built = require(join(ROOT, manifest.main)) as Record<string, unknown>;

    for (const name of DOCUMENTED_HOOKS) {
      expect([name, typeof built[name]]).toEqual([name, 'function']);
    }
  });

  it('exposes the documented constants from the built entry point', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const built = require(join(ROOT, manifest.main)) as Record<string, unknown>;

    expect(built.DEFAULT_THRESHOLD).toBe(20);
    expect(built.DEFAULT_POSITION).toBe('bottom');
  });

  it('declares react and react-native as peer dependencies, not dependencies', () => {
    expect(manifest.peerDependencies.react).toBeDefined();
    expect(manifest.peerDependencies['react-native']).toBeDefined();
    expect(
      (manifest as unknown as { dependencies?: Record<string, string> })
        .dependencies
    ).toBeUndefined();
  });
});

describe('runtime dependencies', () => {
  it('never pulls react-native into the compiled output', () => {
    // The library imports every react-native symbol with `import type`, so a
    // consumer on the web (or a plain node script) must not trip over a
    // require('react-native'). A regression here breaks non-RN consumers only,
    // which no other test would notice.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync, readdirSync } = require('fs') as typeof import('fs');
    const distDir = join(ROOT, 'dist');
    const jsFiles = readdirSync(distDir).filter(f => f.endsWith('.js'));

    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      const source = readFileSync(join(distDir, file), 'utf8');
      expect([file, source.includes('require("react-native")')]).toEqual([
        file,
        false,
      ]);
      expect([file, source.includes("require('react-native')")]).toEqual([
        file,
        false,
      ]);
    }
  });
});
