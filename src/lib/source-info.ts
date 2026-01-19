import { hostname, platform, release } from "node:os";
import { resolve } from "node:path";
import type { FileSource, ManifestSource } from "../types/index.ts";

function getOsLabel(): string {
  return `${platform()} ${release()}`;
}

export function getManifestSource(projectDir: string): ManifestSource {
  return {
    machineName: hostname(),
    os: getOsLabel(),
    projectPath: resolve(projectDir),
  };
}

export function getFileSource(projectDir: string, filePath: string): FileSource {
  return {
    ...getManifestSource(projectDir),
    filePath: resolve(filePath),
  };
}
