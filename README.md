# Litera

Litera is a Swahili-first, accessible educational publishing workspace. The repository is initialized with Devcanon and uses its handbook in `.ai/` as mandatory engineering policy.

## Start locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Desktop application

Litera includes a Tauri 2 desktop shell for macOS, Windows, and Linux. After installing the platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), run:

```bash
pnpm desktop:dev
```

Production installers are built natively by `.github/workflows/desktop-release.yml`. See `docs/desktop-distribution.md` for the required production URL, release tags, signing, and artifact locations.

## Mobile applications

The same Tauri 2 shell is configured for Android 7.0+ and iOS 14+. Install the official [Tauri mobile prerequisites](https://v2.tauri.app/start/prerequisites/) before initializing a platform project:

```bash
pnpm mobile:android:init
pnpm mobile:android:dev
pnpm mobile:android:build

pnpm mobile:ios:init
pnpm mobile:ios:dev
pnpm mobile:ios:build
```

Android release output includes APK and Android App Bundle formats. Store-ready Android and iOS packages require Google Play and Apple code-signing credentials; iOS builds must run on macOS with full Xcode installed.

## Releases and updates

Published GitHub Releases are Litera’s source of truth for desktop installers, release notes, fixes, and upgrade guidance. The public `/updates` page refreshes release data from GitHub every five minutes, while installed desktop clients use the signed `latest.json` asset to discover upgrades.

To publish a desktop release after merging the release changes:

1. Update the matching version in `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/package.json`.
2. Add user-facing changes and upgrade notes to `CHANGELOG.md`.
3. Run the full verification commands below and push `main`.
4. Tag that exact commit and push the tag:

```bash
git tag desktop-v0.2.0
git push origin desktop-v0.2.0
```

The desktop workflow builds signed macOS, Windows, and Linux packages, publishes the GitHub Release, and uploads updater metadata. Existing desktop users can then install the verified upgrade from Litera’s **Updates** page.

Copy `apps/web/.env.example` to `apps/web/.env.local`, configure PostgreSQL and the authentication email webhook, then apply migrations with `pnpm --dir apps/web db:migrate`.

New accounts always start with the `member` role. After the first trusted operator has verified their email, bootstrap that account once in PostgreSQL:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'operator@example.com';
```

The administrator must enroll in two-factor authentication at `/account/security` before `/admin` becomes available. Administrators can then assign `stakeholder` or `admin` roles through the Better Auth admin API; role changes must never be exposed to ordinary members.

## Checks

```bash
pnpm lint
pnpm build
pnpm check:standards
```

Product direction lives in `.ai/product.md`; the initial architecture decision is in `docs/adr/0001-platform-foundation.md`.
