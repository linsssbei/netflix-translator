// Vitest setup file
// Runs before each test file

import { installChromeMock, resetChromeMock } from './chrome-mock';

// Install chrome mock before all tests
installChromeMock();

// Reset mocks after each test for clean state
afterEach(() => {
  resetChromeMock();
});
