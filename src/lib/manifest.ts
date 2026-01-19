import type { ProjectManifest } from "../types/index.ts";

export function getManifestFingerprint(manifest: ProjectManifest): string {
  const files = [...manifest.files]
    .map((file) => ({ name: file.name, hash: file.hash }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return JSON.stringify({
    version: manifest.version,
    projectName: manifest.projectName,
    files,
  });
}
