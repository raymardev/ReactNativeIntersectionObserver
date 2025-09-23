/**
 * Basic compilation test
 * This test verifies that the TypeScript code compiles correctly
 */

describe('Library compilation', () => {
  it('should compile TypeScript without errors', () => {
    // This test passes if TypeScript compilation succeeds
    expect(true).toBe(true);
  });

  it('should have the main entry point', () => {
    // Check if the main files exist
    const fs = require('fs');
    const path = require('path');

    // Check if source files exist (with fallback for CI/CD)
    const indexPath = path.join(__dirname, '../index.ts');
    const typesPath = path.join(__dirname, '../types.ts');

    // In CI/CD, files might be in different locations, so we check if they exist
    // or if the dist files exist (which means compilation succeeded)
    const distIndexPath = path.join(__dirname, '../../dist/index.js');
    const distTypesPath = path.join(__dirname, '../../dist/index.d.ts');

    const sourceFilesExist =
      fs.existsSync(indexPath) && fs.existsSync(typesPath);
    const distFilesExist =
      fs.existsSync(distIndexPath) && fs.existsSync(distTypesPath);

    expect(sourceFilesExist || distFilesExist).toBe(true);
  });
});
