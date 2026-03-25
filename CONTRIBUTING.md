# Contributing to Cruwells Vox

Thanks for your interest in contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Firebase CLI (optional for deployment workflows)

### Install

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_LIVEKIT_URL=
```

## Local Development

### Run Web App

```bash
npm run dev
```

### Run Electron App (Development)

```bash
npm run dev:electron
```

## Quality Checks

Before opening a pull request, run:

```bash
npm run lint
npm run build:web
```

If your change affects desktop packaging, also run:

```bash
npm run build:electron
```

## Branch and Commit Guidelines

- Create a feature branch from `main`.
- Keep commits small and focused.
- Use clear commit messages describing what changed and why.

Example branch names:

- `feature/sfu-participant-sync`
- `fix/electron-preload-import`
- `chore/dependency-update`

## Pull Request Checklist

- The change is scoped and documented.
- Lint/build checks pass locally.
- UI changes include screenshots or short video when applicable.
- Related docs are updated (`README.md`, setup docs, or this file).

## Code Style

- Follow existing patterns in the codebase.
- Avoid unrelated refactors in feature/fix PRs.
- Keep React component logic readable and modular.

## Reporting Bugs / Requesting Features

When opening an issue, include:

- Environment (Web or Electron, OS, browser if relevant)
- Reproduction steps
- Expected vs actual behavior
- Logs/screenshots if available

## License

By contributing, you agree that your contributions are licensed under the MIT License in this repository.
