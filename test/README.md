# ytdl-core Tests

This directory contains tests for the ytdl-core library.

## Test Structure

- `unit/`: Unit tests for individual components
  - `lib/`: Tests for each file in the src directory
- `integration/`: Integration tests that verify components work together
- `mocks/`: Mock data and helper functions for testing

## Running Tests

To run all tests:
```bash
npm test
```

To run tests with coverage:
```bash
npm run test:coverage
```

To run only unit tests:
```bash
npm run test:unit
```

To run only integration tests:
```bash
npm run test:integration
```

To run tests in watch mode (for development):
```bash
npm run test:watch
```

## Writing Tests

### Unit Tests

Unit tests should test individual functions and methods in isolation. Use mocks to avoid external dependencies.

Example:
```typescript
import { someFn } from '../../../src/moduleName';

describe('someFn', () => {
  it('should return expected result for valid input', () => {
    expect(someFn('valid input')).toBe('expected result');
  });

  it('should throw error for invalid input', () => {
    expect(() => someFn(null)).toThrow('Error message');
  });
});
```

### Integration Tests

Integration tests verify that different parts of the library work together correctly.

Example:
```typescript
import ytdl from '../../src/index';

describe('ytdl', () => {
  it('should get info from a video URL', async () => {
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=videoId');
    expect(info.formats.length).toBeGreaterThan(0);
  });
});
```

### Mocks

Use the mock data in `test/mocks/index.ts` for consistent testing.

## Coverage Goals

- Aim for at least 80% code coverage
- Ensure all public API methods are tested
- Include tests for error cases and edge conditions