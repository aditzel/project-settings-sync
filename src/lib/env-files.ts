import { glob } from "glob";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

export interface EnvFile {
  name: string;
  path: string;
  content: string;
  size: number;
  modifiedAt: Date;
}

export async function discoverEnvFiles(
  projectDir: string,
  pattern: string,
  ignore: string[] = []
): Promise<EnvFile[]> {
  const matches = await glob(pattern, {
    cwd: projectDir,
    dot: true,
    nodir: true,
    ignore: [...ignore, "node_modules/**", ".git/**"],
  });

  const files: EnvFile[] = [];

  for (const match of matches) {
    const filePath = join(projectDir, match);
    try {
      const content = await readFile(filePath, "utf-8");
      const stats = await stat(filePath);

      files.push({
        name: basename(match),
        path: filePath,
        content,
        size: stats.size,
        modifiedAt: stats.mtime,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars.set(key, value);
  }

  return vars;
}

export function diffEnvFiles(
  local: Map<string, string>,
  remote: Map<string, string>
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of local.keys()) {
    if (!remote.has(key)) {
      added.push(key);
    } else if (local.get(key) !== remote.get(key)) {
      changed.push(key);
    }
  }

  for (const key of remote.keys()) {
    if (!local.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, changed };
}
