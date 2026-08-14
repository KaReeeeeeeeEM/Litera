# Deployment
## Purpose
Ship changes safely, repeatably, and reversibly.
## Philosophy
Build once, promote the same artifact, automate checks, and reduce blast radius with incremental rollout.
## Best Practices
- Use immutable artifacts, environment parity, health/readiness checks, and feature flags.
- Run backward-compatible migrations separately from code that depends on them.
- Prefer canary/rolling releases and automatic rollback on objective signals.
## Rules
- Every published version must have matching npm and GitHub Release artifacts from the same tested commit. Product changelogs link each immutable version to both registries and never advertise an unavailable download.
- Public sites define canonical metadata, descriptive titles, unique route descriptions, complete sitemaps, robots policy, SoftwareApplication structured data, and 1200×630 Open Graph/Twitter artwork. Shared-link previews use the approved product mark and meaningful product copy.
- Vercel is the default deployment platform for Next.js applications. Use another platform only when project requirements document a concrete reason.
- Connect the Git repository to Vercel so pull requests receive preview deployments and the protected production branch deploys to production.
- Secrets and environment configuration stay outside artifacts.
- Every release records commit, artifact, migrations, operator, and outcome.
- Rollback or forward-recovery steps are defined before risky release.
## Examples
```text
expand schema → deploy dual-read/write code → backfill/verify → contract schema
```
## Anti-patterns
Manual production edits, latest-tag deployments, destructive migrations coupled to startup, or exporting a Next.js application for GitHub Pages without an explicit requirement.
## Checklist
- [ ] CI checks and artifact provenance pass.
- [ ] Migration and recovery are safe.
- [ ] Health, telemetry, flags, and rollback are ready.

Related: `database.md`, `monitoring.md`, `git.md`.
