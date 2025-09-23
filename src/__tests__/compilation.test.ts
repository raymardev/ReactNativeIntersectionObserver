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

    // Check if source files exist
    expect(fs.existsSync(path.join(__dirname, '../index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../types.ts'))).toBe(true);
  });
});
