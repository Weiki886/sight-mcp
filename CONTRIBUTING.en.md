# Contributing

**语言 / Language：** [中文](CONTRIBUTING.md) · English

Contributions are welcome. This project is maintained by an individual with a lightweight process,
but the following conventions apply.

## Open an Issue First

Open an Issue before making any change, describing the background, goal, and acceptance criteria,
and wait for confirmation. Security vulnerabilities go through the private channel in the
[security policy](SECURITY.en.md), not public Issues.

## Development Environment

- Node.js 22 or newer;
- pnpm (see the `packageManager` field in `package.json`);
- Install dependencies with `pnpm install --frozen-lockfile`.

## Branches and Commits

- Branch naming: `<type>/<issue>-<slug>` (English), for example `feat/42-clipboard-support`;
- Commit messages: English Conventional Commits, for example `feat(mcp): add clipboard tool`;
- Short-lived branches are deleted after merging.

## Pre-Commit Gate

The full quality gate must pass before committing:

```sh
pnpm run ci
```

It covers formatting, ESLint, type checking, unit/contract/security tests, build, stdio integration
tests, pack-content checks, production dependency audit, license checks, and workflow security
checks.

## Bilingual Documentation

`docs/` and root-level public documents are maintained in Chinese-English pairs: Chinese is the
primary document (`*.md`), English uses the `.en.md` suffix, and each document keeps a language
switch line under its title. `pnpm run docs:check` validates switch links, same-language closure,
and dead links.

## Security Boundaries

- Never commit credentials, API keys, or local private configuration (such as `.env` or a personal
  `AGENTS.md`);
- Logs, error messages, and tests must not contain real keys, real user images, or unsanitized
  sensitive data;
- Changes touching path authorization, credentials, or Provider transport must flag the risk
  explicitly in the PR.

## Pull Requests

- Use an English title and fill in the template: problem, risk, changes, verification evidence,
  compatibility, and rollback;
- Link the Issue (`Closes #n`) and keep the scope consistent with it;
- The maintainer merges after CI is fully green.
