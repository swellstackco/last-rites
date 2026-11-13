// Vitest setup: any accidental real network request fails the test (Requirement 12.1).
(globalThis as unknown as { fetch: unknown }).fetch = () => {
  throw new Error("Real network access is forbidden in tests: use the fake HttpClient and fixtures.");
};
