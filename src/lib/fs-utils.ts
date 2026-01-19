import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export async function ensureParentDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}
