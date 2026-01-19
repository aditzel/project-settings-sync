import { join } from "node:path";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureParentDir } from "./fs-utils.ts";
import type { BaseSnapshot, BaseFileEntry } from "../types/index.ts";

const PSS_DIR = ".pss";
const BASE_DIR = "base";
const SNAPSHOT_FILE = "snapshot.json";

/**
 * Get the .pss directory path for a project
 */
export function getPssDir(projectDir: string): string {
  return join(projectDir, PSS_DIR);
}

/**
 * Get the base files directory path
 */
export function getBaseDir(projectDir: string): string {
  return join(projectDir, PSS_DIR, BASE_DIR);
}

/**
 * Get the snapshot metadata file path
 */
export function getSnapshotPath(projectDir: string): string {
  return join(projectDir, PSS_DIR, SNAPSHOT_FILE);
}

/**
 * Get the path for a base file
 */
export function getBaseFilePath(projectDir: string, fileName: string): string {
  return join(projectDir, PSS_DIR, BASE_DIR, `${fileName}.base`);
}

/**
 * Ensure the .pss directory structure exists
 */
export async function ensurePssDir(projectDir: string): Promise<void> {
  const pssDir = getPssDir(projectDir);
  const baseDir = getBaseDir(projectDir);

  if (!existsSync(pssDir)) {
    await mkdir(pssDir, { recursive: true });
  }
  if (!existsSync(baseDir)) {
    await mkdir(baseDir, { recursive: true });
  }
}

/**
 * Check if .pss directory exists
 */
export function hasPssDir(projectDir: string): boolean {
  return existsSync(getPssDir(projectDir));
}

/**
 * Load the base snapshot metadata
 */
export async function loadBaseSnapshot(projectDir: string): Promise<BaseSnapshot | null> {
  try {
    const snapshotPath = getSnapshotPath(projectDir);
    const content = await readFile(snapshotPath, "utf-8");
    return JSON.parse(content) as BaseSnapshot;
  } catch {
    return null;
  }
}

/**
 * Save the base snapshot metadata
 */
export async function saveBaseSnapshot(projectDir: string, snapshot: BaseSnapshot): Promise<void> {
  await ensurePssDir(projectDir);
  const snapshotPath = getSnapshotPath(projectDir);
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
}

/**
 * Load a single base file's content
 */
export async function loadBaseFileContent(
  projectDir: string,
  fileName: string
): Promise<string | null> {
  try {
    const filePath = getBaseFilePath(projectDir, fileName);
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Save a single base file's content
 */
export async function saveBaseFileContent(
  projectDir: string,
  fileName: string,
  content: string
): Promise<void> {
  await ensurePssDir(projectDir);
  const filePath = getBaseFilePath(projectDir, fileName);
  await ensureParentDir(filePath);
  await writeFile(filePath, content);
}

/**
 * Delete a base file
 */
export async function deleteBaseFile(projectDir: string, fileName: string): Promise<void> {
  try {
    const filePath = getBaseFilePath(projectDir, fileName);
    await rm(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Update the entire base snapshot after a successful sync.
 * This saves both the metadata and all file contents.
 */
export async function updateBaseSnapshot(
  projectDir: string,
  files: BaseFileEntry[],
  remoteManifestHash: string
): Promise<void> {
  await ensurePssDir(projectDir);

  // Save each file's content
  for (const file of files) {
    await saveBaseFileContent(projectDir, file.name, file.content);
  }

  // Save the metadata
  const snapshot: BaseSnapshot = {
    version: 1,
    files: files.map((f) => ({
      name: f.name,
      hash: f.hash,
      content: f.content,
    })),
    syncedAt: new Date().toISOString(),
    remoteManifestHash,
  };

  await saveBaseSnapshot(projectDir, snapshot);
}

/**
 * Load all base file contents from the snapshot.
 * Returns a map of fileName -> content for use in three-way merge.
 */
export async function loadAllBaseContents(projectDir: string): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  const snapshot = await loadBaseSnapshot(projectDir);

  if (!snapshot) {
    return contents;
  }

  for (const file of snapshot.files) {
    const content = await loadBaseFileContent(projectDir, file.name);
    if (content !== null) {
      contents.set(file.name, content);
    }
  }

  return contents;
}

/**
 * Clear all base snapshot data (useful for resync or cleanup)
 */
export async function clearBaseSnapshot(projectDir: string): Promise<void> {
  const pssDir = getPssDir(projectDir);
  if (existsSync(pssDir)) {
    await rm(pssDir, { recursive: true });
  }
}

/**
 * Check if we have a valid base snapshot for comparison
 */
export async function hasValidBaseSnapshot(projectDir: string): Promise<boolean> {
  const snapshot = await loadBaseSnapshot(projectDir);
  if (!snapshot) return false;

  // Verify at least one base file exists
  for (const file of snapshot.files) {
    const content = await loadBaseFileContent(projectDir, file.name);
    if (content !== null) {
      return true;
    }
  }

  return false;
}
