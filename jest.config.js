// The react-native preset supplies the pieces a RN library test run needs:
// haste platform resolution, the RN core mocks in setupFiles, the RN test
// environment, the asset transformer and the transformIgnorePatterns that let
// react-native's own Flow-typed source be transformed.
//
// It is spread in rather than used via `preset:` because jest MERGES a preset's
// `transform` map ahead of the project's own. The preset maps `.ts`/`.tsx` to
// babel-jest, and its entry would win on pattern order, silently stripping our
// types without checking them. Dropping that one entry here lets ts-jest own
// TypeScript (so test files are type checked) while babel still owns JS.
const rnPreset = require('react-native/jest-preset');

const {
  '^.+\\.(js|ts|tsx)$': _rnBabelTransform,
  ...rnAssetTransforms
} = rnPreset.transform;

/** @type {import('jest').Config} */
module.exports = {
  ...rnPreset,

  transform: {
    // tsconfig.json is the *build* config ("types": [], tests excluded, emits
    // declarations); the test-only bits are layered on here instead.
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          types: ['jest', 'node'],
          declaration: false,
          // ts-jest reads tsconfig's `isolatedModules` as "transpile only";
          // the build config sets it to guard Metro single-file transpilation,
          // so turn it off here to keep full type checking in tests.
          isolatedModules: false,
        },
      },
    ],
    // Babel options are inline rather than in a babel.config.js so that they
    // also apply to files inside node_modules (react-native's own source),
    // which file-relative babel config deliberately skips.
    '^.+\\.(js|jsx)$': [
      'babel-jest',
      {
        presets: ['module:@react-native/babel-preset'],
        babelrc: false,
        configFile: false,
      },
    ],
    ...rnAssetTransforms,
  },

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Only real test files are suites, so helpers and fixtures can live in
  // __tests__ without failing the run as empty suites.
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // src/index.ts is the public entry point and the file the API contract hangs
  // off, so it is deliberately NOT excluded from coverage.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
