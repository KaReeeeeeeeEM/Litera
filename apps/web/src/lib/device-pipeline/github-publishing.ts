import { unzipSync } from "fflate/browser";

export type GitHubPublishOptions = {
  token: string;
  owner: string;
  repository: string;
  branch: string;
  visibility: "public" | "private";
  commitMessage: string;
  artifact: Blob;
  onStep?: (step: string) => void;
};

type GitHubResponse = Record<string, unknown>;

async function github<T extends GitHubResponse>(
  path: string,
  token: string,
  init: RequestInit = {},
  allow: number[] = [],
) {
  let response: Response | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(60_000),
      });
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (attempt === 5) throw error;
    }
    if (attempt < 5)
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
  }
  if (!response) throw new Error("GitHub could not be reached after five attempts.");
  if (!response.ok && !allow.includes(response.status)) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || `GitHub request failed (${response.status}).`);
  }
  return { status: response.status, body: response.status === 204 ? ({} as T) : ((await response.json().catch(() => ({}))) as T) };
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

async function gitBlobSha(bytes: Uint8Array) {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const input = new Uint8Array(header.byteLength + bytes.byteLength);
  input.set(header);
  input.set(bytes, header.byteLength);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", input))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function batches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size)
    results.push(...(await Promise.all(items.slice(index, index + size).map(work))));
  return results;
}

export async function publishArtifactToGitHub(options: GitHubPublishOptions) {
  const token = options.token.trim();
  const owner = options.owner.trim();
  const repository = options.repository.trim();
  const branch = options.branch.trim() || "main";
  if (!token || !owner || !repository) throw new Error("GitHub token, owner, and repository are required.");

  options.onStep?.("Connect GitHub");
  const viewer = await github<{ login?: string }>("/user", token);
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const existing = await github(repoPath, token, {}, [404]);
  if (existing.status === 404) {
    const target = viewer.body.login?.toLowerCase() === owner.toLowerCase()
      ? "/user/repos"
      : `/orgs/${encodeURIComponent(owner)}/repos`;
    await github(target, token, {
      method: "POST",
      body: JSON.stringify({ name: repository, private: options.visibility === "private", auto_init: true }),
    });
  }

  options.onStep?.("Package accessible book");
  const files = Object.entries(unzipSync(new Uint8Array(await options.artifact.arrayBuffer())));
  if (!files.length) throw new Error("The Litera Web package contains no deployable files.");

  const ref = await github<{ object?: { sha?: string } }>(`${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`, token, {}, [404]);
  let parentSha = ref.body.object?.sha;
  if (!parentSha) {
    const repositoryInfo = await github<{ default_branch?: string }>(repoPath, token);
    const defaultBranch = repositoryInfo.body.default_branch || "main";
    const defaultRef = await github<{ object?: { sha?: string } }>(`${repoPath}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, token);
    parentSha = defaultRef.body.object?.sha;
  }
  if (!parentSha) throw new Error("GitHub repository has no initial commit.");
  const parent = await github<{ tree?: { sha?: string } }>(`${repoPath}/git/commits/${parentSha}`, token);
  const remoteTree = await github<{ tree?: Array<{ path?: string; type?: string; sha?: string }> }>(
    `${repoPath}/git/trees/${parent.body.tree?.sha}?recursive=1`,
    token,
  );
  const remoteFiles = new Map(
    (remoteTree.body.tree ?? [])
      .filter((item) => item.type === "blob" && item.path && item.sha)
      .map((item) => [item.path!, item.sha!]),
  );
  const localFiles = new Map(files);
  const changedFiles: Array<[string, Uint8Array]> = [];
  for (const [path, bytes] of files) {
    if (remoteFiles.get(path) !== await gitBlobSha(bytes)) changedFiles.push([path, bytes]);
  }
  const deletedPaths = [...remoteFiles.keys()].filter((path) => !localFiles.has(path));

  options.onStep?.("Upload changed files");
  const blobs = await batches(changedFiles, 8, async ([path, bytes]) => {
    const result = await github<{ sha?: string }>(`${repoPath}/git/blobs`, token, {
      method: "POST",
      body: JSON.stringify({ content: base64(bytes), encoding: "base64" }),
    });
    if (!result.body.sha) throw new Error(`GitHub did not store ${path}.`);
    return { path, mode: "100644", type: "blob", sha: result.body.sha };
  });
  const treeEntries = [
    ...blobs,
    ...deletedPaths.map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
  ];
  if (!treeEntries.length) {
    options.onStep?.("Published");
    return {
      commitSha: parentSha,
      fileCount: files.length,
      changedFileCount: 0,
      siteUrl: `https://${owner.toLowerCase()}.github.io/${repository}/`,
    };
  }

  options.onStep?.("Create deployment commit");
  const tree = await github<{ sha?: string }>(`${repoPath}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.body.tree?.sha, tree: treeEntries }),
  });
  const commit = await github<{ sha?: string }>(`${repoPath}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message: options.commitMessage || "Publish accessible book from Litera", tree: tree.body.sha, parents: [parentSha] }),
  });
  if (!commit.body.sha) throw new Error("GitHub did not create the publishing commit.");
  if (ref.status === 404) {
    await github(`${repoPath}/git/refs`, token, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.body.sha }) });
  } else {
    await github(`${repoPath}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: "PATCH", body: JSON.stringify({ sha: commit.body.sha, force: false }) });
  }

  options.onStep?.("Enable GitHub Pages");
  const pages = await github<{ html_url?: string }>(`${repoPath}/pages`, token, {
    method: "POST",
    body: JSON.stringify({ build_type: "legacy", source: { branch, path: "/" } }),
  }, [409, 422]);
  if (pages.status === 409 || pages.status === 422)
    await github(`${repoPath}/pages`, token, { method: "PUT", body: JSON.stringify({ build_type: "legacy", source: { branch, path: "/" } }) });

  options.onStep?.("Verify deployment");
  let verifiedUrl = pages.body.html_url;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await github<{ html_url?: string; status?: string }>(`${repoPath}/pages`, token, {}, [404]);
    verifiedUrl = status.body.html_url || verifiedUrl;
    if (status.body.status === "built") break;
    if (status.body.status === "errored") throw new Error("GitHub Pages reported a failed deployment.");
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  options.onStep?.("Published");
  return {
    commitSha: commit.body.sha,
    fileCount: files.length,
    changedFileCount: treeEntries.length,
    siteUrl: verifiedUrl || `https://${owner.toLowerCase()}.github.io/${repository}/`,
  };
}
