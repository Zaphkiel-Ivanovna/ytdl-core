/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'test/tsconfig.json',
      isolatedModules: true
    }],
  },
  testMatch: ['**/test/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  watchPathIgnorePatterns: [
    'node_modules',
    'dist',
  ],
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  // Mock node modules that cause issues
  moduleNameMapper: {
    'http-cookie-agent/undici': '<rootDir>/test/mocks/module-mocks.js',
    'https-proxy-agent': '<rootDir>/test/mocks/module-mocks.js',
    'tough-cookie': '<rootDir>/test/mocks/module-mocks.js',
    '../agent': '<rootDir>/test/mocks/agent.ts',
    '../../agent': '<rootDir>/test/mocks/agent.ts',
    '../../../agent': '<rootDir>/test/mocks/agent.ts',
  }
};