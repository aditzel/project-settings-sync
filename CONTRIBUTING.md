# Contributing to PSS

Thank you for your interest in contributing to PSS (Project Settings Sync)!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/aditzel/project-settings-sync.git
   cd project-settings-sync
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up your environment**

   Copy the example environment file and configure your B2 credentials:
   ```bash
   cp .env.example .env.local
   ```

   You'll need:
   - Backblaze B2 account with a bucket
   - Google OAuth credentials (for authentication)

4. **Run in development mode**
   ```bash
   bun run dev
   ```

## Code Style

This project uses ESLint and Prettier for code formatting:

```bash
# Check linting
bun run lint

# Fix linting issues
bun run lint:fix

# Format code
bun run format

# Check formatting
bun run format:check

# Type check
bun run typecheck
```

Please ensure your code passes all checks before submitting a PR.

## Testing

Run the test suite with:

```bash
bun test
```

Please add tests for any new features or bug fixes.

## Pull Request Process

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** with clear, descriptive commits
3. **Add tests** for any new functionality
4. **Run the full test suite** to ensure nothing is broken
5. **Update documentation** if needed (README, code comments)
6. **Submit a pull request** with a clear description of your changes

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Write clear commit messages
- Reference any related issues
- Be responsive to feedback

## Reporting Issues

When reporting bugs, please include:

- PSS version (`pss --version`)
- Operating system and version
- Steps to reproduce the issue
- Expected vs actual behavior
- Any relevant error messages

## Feature Requests

Feature requests are welcome! Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something useful together.

## Questions?

Feel free to open an issue for any questions about contributing.
