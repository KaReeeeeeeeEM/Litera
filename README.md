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
