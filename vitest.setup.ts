// Global Vitest setup. Only affects files that actually render DOM (their
// own `// @vitest-environment jsdom` docblock) — importing "@testing-library/
// jest-dom" matchers here is a no-op for plain "node"-environment logic
// tests since they never call the extended matchers.
import "@testing-library/jest-dom/vitest";
