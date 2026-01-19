import { Command, Flags } from "@oclif/core";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { loadProjectConfig, loadGlobalConfig, saveProjectConfig } from "../lib/config.ts";
import { requireAuth } from "../lib/auth.ts";
import {
  discoverProjectFiles,
  parseEnvFile,
  serializeEnvFile,
  getFileKind,
  normalizeRelativePath,
} from "../lib/env-files.ts";
import { encrypt, decrypt, getEncryptionKey, hashFile } from "../lib/crypto.ts";
import { createB2Client, getStoragePath, getManifestPath } from "../lib/b2-client.ts";
import {
  loadAllBaseContents,
  updateBaseSnapshot,
  hasValidBaseSnapshot,
} from "../lib/base-snapshot.ts";
import {
  threeWayMergeEnvFile,
  threeWayMergeTextFile,
  applyResolutions,
  resolveAllConflicts,
  getAutoMergeSummary,
  createSyncResult,
} from "../lib/merge.ts";
import { ensureParentDir } from "../lib/fs-utils.ts";
import { getFileSource, getManifestSource } from "../lib/source-info.ts";
import { getManifestFingerprint } from "../lib/manifest.ts";
import type {
  ProjectManifest,
  EncryptedData,
  FileMergeResult,
  BaseFileEntry,
} from "../types/index.ts";

export default class Sync extends Command {
  static override description = "Intelligently sync files with remote, handling conflicts";

  static override examples = [
    "<%= config.bin %> sync",
    "<%= config.bin %> sync --dry-run",
    "<%= config.bin %> sync --ours",
    "<%= config.bin %> sync --theirs",
  ];

  static override flags = {
    "dry-run": Flags.boolean({
      description: "Preview merge without applying changes",
      default: false,
    }),
    ours: Flags.boolean({
      description: "Resolve all conflicts using local values",
      default: false,
      exclusive: ["theirs"],
    }),
    theirs: Flags.boolean({
      description: "Resolve all conflicts using remote values",
      default: false,
      exclusive: ["ours"],
    }),
    interactive: Flags.boolean({
      char: "i",
      description: "Prompt for each conflict (default when conflicts exist)",
      default: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Sync);

    const projectDir = process.cwd();
    const projectConfig = await loadProjectConfig(projectDir);

    if (!projectConfig) {
      this.error("Project not initialized. Run 'pss init' first.");
    }

    const globalConfig = await loadGlobalConfig();
    if (!globalConfig) {
      this.error("Not configured. Run 'pss config set' first.");
    }

    const auth = await requireAuth();
    const encryptionKey = await getEncryptionKey(auth.userId);

    const spinner = ora("Connecting to B2...").start();

    try {
      const b2 = createB2Client(globalConfig);

      const connected = await b2.testConnection();
      if (!connected) {
        spinner.fail("Failed to connect to B2");
        this.error("Check your B2 credentials.");
      }

      // 1. Load all three versions: base, local, remote
      spinner.text = "Loading local files...";
      const localFiles = await discoverProjectFiles(
        projectDir,
        projectConfig.pattern,
        projectConfig.ignore
      );

      spinner.text = "Loading base snapshot...";
      const baseContents = await loadAllBaseContents(projectDir);
      const hasBase = await hasValidBaseSnapshot(projectDir);

      if (!hasBase) {
        spinner.info("No base snapshot found. This appears to be your first sync.");
      }

      spinner.text = "Fetching remote manifest...";
      const manifestPath = getManifestPath(auth.userId, projectConfig.projectName);
      let manifest: ProjectManifest | null = null;

      try {
        manifest = await b2.downloadJson<ProjectManifest>(manifestPath);
      } catch {
        // No remote manifest - first sync
      }

      // 2. Download all remote file contents
      spinner.text = "Downloading remote files...";
      const remoteContents = new Map<string, string>();

      if (manifest) {
        for (const file of manifest.files) {
          const safeName = normalizeRelativePath(file.name);
          if (!safeName || safeName !== file.name) {
            this.warn(`Skipping unsafe remote file path: ${file.name}`);
            continue;
          }
          const storagePath = getStoragePath(auth.userId, projectConfig.projectName, safeName);
          try {
            const encrypted = await b2.downloadJson<EncryptedData>(storagePath);
            const content = await decrypt(encrypted, encryptionKey);
            remoteContents.set(safeName, content);
          } catch {
            // Skip files that can't be downloaded
          }
        }
      }

      // 3. Collect all unique file names
      const allFileNames = new Set([
        ...localFiles.map((f) => f.name),
        ...remoteContents.keys(),
        ...baseContents.keys(),
      ]);

      // 4. Perform three-way merge for each file
      spinner.text = "Computing merge...";
      const mergeResults: FileMergeResult[] = [];

      for (const fileName of allFileNames) {
        const localFile = localFiles.find((f) => f.name === fileName);
        const localContent = localFile?.content;
        const remoteContent = remoteContents.get(fileName);
        const baseContent = baseContents.get(fileName);

        const fileKind = getFileKind(fileName);

        const result =
          fileKind === "env"
            ? threeWayMergeEnvFile(
                fileName,
                baseContent !== undefined ? parseEnvFile(baseContent) : null,
                localContent ? parseEnvFile(localContent) : new Map(),
                remoteContent ? parseEnvFile(remoteContent) : new Map()
              )
            : threeWayMergeTextFile(
                fileName,
                baseContent !== undefined ? baseContent : null,
                localContent,
                remoteContent
              );
        mergeResults.push(result);
      }

      const syncResult = createSyncResult(mergeResults);
      spinner.stop();

      // 5. Display merge summary
      this.displayMergeSummary(mergeResults);

      // 6. Handle conflicts
      if (syncResult.hasConflicts) {
        const conflictCount = mergeResults.reduce((acc, r) => acc + r.conflicts.length, 0);
        this.log("");
        this.log(chalk.yellow(`Found ${conflictCount} conflict(s) requiring resolution.`));

        if (flags.ours) {
          this.log(chalk.dim("Resolving all conflicts using local values (--ours)"));
          for (const result of mergeResults) {
            const resolutions = resolveAllConflicts(result, "local");
            applyResolutions(result, resolutions);
            result.conflicts = [];
            result.status = result.autoMerged.length > 0 ? "auto_merged" : "clean";
          }
        } else if (flags.theirs) {
          this.log(chalk.dim("Resolving all conflicts using remote values (--theirs)"));
          for (const result of mergeResults) {
            const resolutions = resolveAllConflicts(result, "remote");
            applyResolutions(result, resolutions);
            result.conflicts = [];
            result.status = result.autoMerged.length > 0 ? "auto_merged" : "clean";
          }
        } else if (flags.interactive) {
          // Interactive resolution will be implemented in conflict-ui.ts
          // For now, show conflicts and exit
          this.log("");
          this.log("Conflicts found:");
          for (const result of mergeResults) {
            for (const conflict of result.conflicts) {
              this.log("");
              this.log(chalk.bold(`  ${result.fileName}: ${conflict.key}`));
              this.log(chalk.dim(`    Type: ${conflict.conflictType}`));
              const baseLine = formatConflictValue(result, conflict.baseValue);
              const localLine = formatConflictValue(result, conflict.localValue);
              const remoteLine = formatConflictValue(result, conflict.remoteValue);

              this.log(chalk.dim(`    Base:   ${baseLine}`));
              this.log(
                (conflict.localValue === undefined ? chalk.red : chalk.green)(
                  `    Local:  ${localLine}`
                )
              );
              this.log(
                (conflict.remoteValue === undefined ? chalk.red : chalk.blue)(
                  `    Remote: ${remoteLine}`
                )
              );
            }
          }
          this.log("");
          this.log(
            `Use ${chalk.cyan("--ours")} or ${chalk.cyan("--theirs")} to resolve all conflicts automatically.`
          );
          this.log(chalk.dim("Interactive TUI conflict resolution coming soon!"));
          return;
        }
      }

      // 7. Check if there are any changes to apply
      const hasChanges = mergeResults.some((r) => r.status !== "clean" || r.autoMerged.length > 0);

      if (!hasChanges) {
        this.log("");
        this.log(chalk.green("✓ Already in sync. No changes needed."));
        return;
      }

      // 8. Dry run - show what would happen
      if (flags["dry-run"]) {
        this.log("");
        this.log(chalk.yellow("Dry run - no changes applied."));
        return;
      }

      // 9. Apply changes
      spinner.start("Applying changes...");

      // Write merged files locally
      for (const result of mergeResults) {
        const content = getMergedContent(result);
        if (content === null) {
          // File was deleted - we don't delete local files automatically
          continue;
        }

        const localPath = join(projectDir, result.fileName);
        await ensureParentDir(localPath);
        await writeFile(localPath, content);
      }

      // Push merged files to remote
      spinner.text = "Uploading to remote...";
      const newManifest: ProjectManifest = {
        version: 1,
        projectName: projectConfig.projectName,
        source: getManifestSource(projectDir),
        files: [],
      };

      const baseFiles: BaseFileEntry[] = [];

      for (const result of mergeResults) {
        const content = getMergedContent(result);
        if (content === null) {
          continue;
        }
        const hash = await hashFile(content);

        spinner.text = `Uploading ${result.fileName}...`;
        const encrypted = await encrypt(content, encryptionKey);
        const storagePath = getStoragePath(auth.userId, projectConfig.projectName, result.fileName);
        await b2.uploadJson(storagePath, encrypted);

        newManifest.files.push({
          name: result.fileName,
          hash,
          size: content.length,
          updatedAt: new Date().toISOString(),
          source: getFileSource(projectDir, resolve(projectDir, result.fileName)),
        });

        baseFiles.push({
          name: result.fileName,
          hash,
          content,
        });
      }

      // Upload manifest
      spinner.text = "Updating manifest...";
      await b2.uploadJson(manifestPath, newManifest);

      // Update base snapshot
      spinner.text = "Updating base snapshot...";
      const manifestHash = await hashFile(getManifestFingerprint(newManifest));
      await updateBaseSnapshot(projectDir, baseFiles, manifestHash);

      // Update project config
      projectConfig.lastSync = new Date().toISOString();
      await saveProjectConfig(projectDir, projectConfig);

      spinner.succeed(`Synced ${mergeResults.length} file(s)`);

      this.log("");
      this.log(chalk.green("✓ Sync complete!"));
    } catch (error) {
      spinner.fail("Sync failed");
      this.error((error as Error).message);
    }
  }

  private displayMergeSummary(results: FileMergeResult[]): void {
    this.log("");
    this.log(chalk.bold("Sync Summary:"));
    this.log("");

    for (const result of results) {
      const statusIcon =
        result.status === "clean"
          ? chalk.green("✓")
          : result.status === "auto_merged"
            ? chalk.yellow("~")
            : chalk.red("!");

      this.log(`  ${statusIcon} ${result.fileName}`);

      if (result.autoMerged.length > 0) {
        const summary = getAutoMergeSummary(result);
        for (const line of summary) {
          this.log(chalk.dim(`      ${line}`));
        }
      }

      if (result.conflicts.length > 0) {
        this.log(chalk.red(`      ${result.conflicts.length} conflict(s)`));
      }
    }
  }
}

function getMergedContent(result: FileMergeResult): string | null {
  if (result.kind === "env") {
    if (result.merged.size === 0) {
      return null;
    }
    return serializeEnvFile(result.merged);
  }

  return result.mergedContent ?? null;
}

function formatConflictValue(result: FileMergeResult, value: string | undefined): string {
  if (value === undefined) {
    return "(deleted)";
  }

  if (result.kind === "env") {
    return value;
  }

  if (value.length === 0) {
    return "(empty)";
  }

  const firstLine = value.split("\n")[0];
  const needsSuffix = value.includes("\n") || firstLine.length < value.length;
  return `${firstLine}${needsSuffix ? "..." : ""} (${value.length} chars)`;
}
