export type ReleaseAsset = {
  id: number;
  name: string;
  browser_download_url: string;
  size: number;
};

export type DesktopRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  body: string | null;
  prerelease: boolean;
  assets: ReleaseAsset[];
};

const fallback: DesktopRelease[] = [{
  id: 1,
  tag_name: "desktop-v0.1.1",
  name: "Litera Desktop 0.1.1",
  published_at: "2026-08-14T13:57:08Z",
  html_url: "https://github.com/KaReeeeeeeeEM/Litera/releases/tag/desktop-v0.1.1",
  body: "- Introduces Litera Desktop for macOS, Windows, and Linux.\n- Adds signed application upgrades and a live release timeline.\n- Connects the desktop experience to the secure Litera workspace.",
  prerelease: false,
  assets: [],
}];

export async function getDesktopReleases() {
  try {
    const response = await fetch("https://api.github.com/repos/KaReeeeeeeeEM/Litera/releases?per_page=20", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) return fallback;
    const releases = await response.json() as DesktopRelease[];
    return releases.length ? releases : fallback;
  } catch {
    return fallback;
  }
}

export type ReleasePlatform = "macOS" | "Windows" | "Linux" | "Android" | "iOS";

export function installerFor(release: DesktopRelease, platform: ReleasePlatform) {
  const matchers: Record<ReleasePlatform, RegExp> = {
    macOS: /\.dmg$/i,
    Windows: /-setup\.exe$/i,
    Linux: /\.AppImage$/i,
    Android: /\.apk$/i,
    iOS: /\.ipa$/i,
  };
  const matcher = matchers[platform];
  return release.assets.find(asset => matcher.test(asset.name));
}

export function releaseNotes(body: string | null) {
  if (!body) return ["Open the full release notes for improvements, fixes, downloads, and upgrade guidance."];
  const items = body.split("\n").map(line => line.trim()).filter(line => /^[-*] /.test(line)).map(line => line.replace(/^[-*]\s+/, "")).slice(0, 6);
  return items.length ? items : [body.replace(/[#*_`]/g, "").trim().slice(0, 260)];
}
