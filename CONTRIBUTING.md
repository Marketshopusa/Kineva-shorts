# Contributing to Scenarix

Thanks for your interest in contributing to Scenarix! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/scenarix.git
   cd scenarix
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the environment file and add your API keys:
   ```bash
   cp .env.example .env
   ```
5. Set up the database:
   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```
6. Start the dev server:
   ```bash
   npm run dev
   ```

## Development Workflow

1. Create a branch for your change:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes
3. Test thoroughly — run the app and verify your changes work end-to-end
4. Commit with a clear message:
   ```bash
   git commit -m "feat: add your feature description"
   ```
5. Push and open a pull request

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `perf:` — performance improvement
- `security:` — security fix
- `chore:` — maintenance tasks

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Add screenshots for UI changes
- Make sure the app builds without errors

## Reporting Bugs

Open an issue with:

- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (OS, Node version, browser)

## Feature Requests

Open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Code Style

- Follow the existing patterns in the codebase
- Use TypeScript types — avoid `any`
- Keep components focused and composable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
