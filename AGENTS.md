# Repository Guidelines

## Project Structure & Module Organization
- `bin/` holds CLI entry points (`run.ts`) and the dev runner (`dev.ts`).
- `src/commands/` contains oclif command implementations (lowercase verbs like `pull.ts`), with subcommands in folders (e.g., `src/commands/config/set.ts`).
- `src/lib/` includes shared logic (merge, storage, config helpers).
- `src/types/` stores shared TypeScript types.
- Tests live alongside source as `*.test.ts` (example: `src/lib/merge.test.ts`).
- Build output is generated into `dist/` by the build script.

## Build, Test, and Development Commands
- `bun install` installs dependencies.
- `bun run dev <command>` runs the CLI in development mode (e.g., `bun run dev sync`).
- `bun run build` bundles `bin/run.ts` into `dist/`.
- `bun run test` runs the Vitest suite.
- `bun run lint` / `bun run lint:fix` runs ESLint checks and autofixes.
- `bun run format` / `bun run format:check` runs Prettier formatting.
- `bun run typecheck` runs `tsc --noEmit` for type checks.

## Coding Style & Naming Conventions
- TypeScript + ESM (`"type": "module"` in `package.json`).
- Formatting is enforced by Prettier: 2-space indentation, semicolons, double quotes, print width 100.
- ESLint is enabled for `*.ts`; unused variables are allowed only when prefixed with `_`.
- Command file names are lowercase verbs (`push.ts`, `sync.ts`); subcommands use directory nesting.

## Testing Guidelines
- Use Vitest for unit tests; keep tests close to the code under `src/`.
- Name tests `*.test.ts` and prefer descriptive `describe/it` blocks.
- Add or update tests for new features and bug fixes; keep tests deterministic and offline.

## Commit & Pull Request Guidelines
- Commit history favors short, imperative summaries (e.g., "Add sync command with three-way merge").
- Keep PRs focused, link related issues, and describe behavior changes clearly.
- Before opening a PR: run `bun run test`, `bun run lint`, and `bun run typecheck`.
- Update docs (README/CONTRIBUTING) when user-facing behavior changes.

## Security & Configuration Tips
- Secrets and tokens are stored locally in `~/.config/pss/` (do not commit).
- Project config `.pss.json` is safe to commit; `.pss/` should stay in `.gitignore`.
- Avoid committing `.env*` files that contain credentials.

## Agent-Specific Notes
- Prefer Bun tooling (`bun install`, `bun run <script>`, `bunx <pkg>`) over npm/yarn.
- Bun auto-loads `.env`; do not add dotenv loaders.
