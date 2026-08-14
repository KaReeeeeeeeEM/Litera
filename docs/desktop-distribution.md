# Desktop distribution

Litera Desktop is a Tauri 2 shell around the deployed Litera workspace. This preserves the server-side authentication, database, email, and role-based features that cannot run inside a static desktop bundle.

## Local development

Install the platform prerequisites from the Tauri documentation, then run:

```bash
pnpm install
pnpm desktop:dev
```

The desktop window opens the Next.js development server at `http://localhost:3000`.

## Local release build

Release builds must point to an HTTPS deployment of the Litera workspace:

```bash
LITERA_APP_URL=https://your-litera-deployment.example pnpm desktop:build
```

Artifacts are written under `apps/desktop/src-tauri/target/release/bundle`.

## Cross-platform releases

Set the GitHub Actions repository variable `LITERA_APP_URL` to the production HTTPS workspace. Push a tag such as `desktop-v0.1.0`, or dispatch the **Desktop release** workflow manually. Native macOS Apple Silicon, macOS Intel, Linux, and Windows jobs create a draft GitHub Release.

Before publishing publicly, configure Apple notarization and Windows code-signing secrets. Unsigned builds are suitable only for internal testing.
