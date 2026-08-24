# AGENTS.md

## Before Merging to Main

Always run the test suite locally before pushing or merging changes to `main`:

```bash
npm run typecheck && npm test
```

Both the TypeScript type check and all tests must pass. If either fails, fix the issues before proceeding.

## Commands

| Command | Description |
|---------|-------------|
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

## Test Files

- `src/types.test.ts` — unit tests for type utilities (`fromRow`)
- `src/App.test.tsx` — React component tests (db layer is mocked)

## Adding Tests

When adding or modifying functionality, include corresponding tests:

1. Pure logic (types, utilities) → `*.test.ts` alongside the source file
2. React components → `*.test.tsx` alongside the component, mock the `db` module
3. CI will run `npm run typecheck && npm test` on every push to `main`
