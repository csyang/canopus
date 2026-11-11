/**
 * jest.config.js
 * Canopus — Jest Configuration
 *
 * Uses Node's experimental VM modules to run Jest with native ESM.
 * Required because the project uses "type": "module" in package.json.
 *
 * Run tests with:
 *   npm test
 *   node --experimental-vm-modules node_modules/.bin/jest
 *
 * Run a single suite:
 *   node --experimental-vm-modules node_modules/.bin/jest validate
 */

export default {
  testEnvironment:        'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform:              {},          // no Babel/ts-jest — native ESM only
  testMatch:              ['**/tests/**/*.test.js'],
  collectCoverageFrom:    [
    'validate.js',
    'manifest-to-elk.js',
    'render-static.js',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageReporters:      ['text', 'lcov'],
};
