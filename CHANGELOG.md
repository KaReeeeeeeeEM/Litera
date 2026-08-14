# Changelog

Litera follows semantic versioning for desktop releases. Published GitHub Releases are the source of truth for signed installers, update metadata, fixes, and upgrade notes.

## 0.1.3 — Complete platform packaging

- Replaced public sign-in actions with direct Litera downloads.
- Added automatic universal Android packaging for ARM64, ARMv7, x86, and x64.
- Added iOS simulator validation to every versioned release build.
- Kept macOS, Windows, and Linux installers in the same coordinated release.

## 0.1.2 — Local-first device library

- Removed authentication from the installed Litera application.
- Added a device-local library for PDF, EPUB, and structured book packages.
- Kept imported source books in application storage on the user’s device.
- Added desktop and mobile platform detection to the download page.

## 0.1.1 — Initial desktop release

- Added the Litera Tauri desktop shell for macOS, Windows, and Linux.
- Added role-based member, stakeholder, and administrator workspaces.
- Added signed in-app update discovery through GitHub Releases.
- Added a live public release timeline and desktop upgrade guidance.
