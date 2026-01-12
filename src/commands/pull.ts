import { Command, Args, Flags } from "@oclif/core";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { loadProjectConfig, loadGlobalConfig, saveProjectConfig } from "../lib/config.ts";
import { requireAuth } from "../lib/auth.ts";
import { decrypt, getEncryptionKey, hashFile } from "../lib/crypto.ts";
import { createB2Client, getStoragePath, getManifestPath } from "../lib/b2-client.ts";
import { discoverEnvFiles } from "../lib/env-files.ts";
import {
  loadAllBaseContents,
  updateBaseSnapshot,
} from "../lib/base-snapshot.ts";
import type { ProjectManifest, EncryptedData, BaseFileEntry } from "../types/index.ts";

export default class Pull extends Command {
  static override description = "Pull .env files from remote storage";

  static override examples = [
    "<%= config.bin %> pull",
    "<%= config.bin %> pull .env.local",
    "<%= config.bin %> pull --dry-run",
  ];

  static override args = {
    files: Args.string({
      description: "Specific files to pull (defaults to all)",
      required: false,
    }),
  };

  static override flags = {
    "dry-run": Flags.boolean({
      description: "Show what would be pulled without actually pulling",
      default: false,
    }),
    force: Flags.boolean({
      char: "f",
      description: "Pull even if local has unpushed changes",
      default: false,
    }),
    backup: Flags.boolean({
      description: "Create .backup before overwriting",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Pull);

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

      spinner.text = "Fetching manifest...";

      const manifestPath = getManifestPath(auth.userId, projectConfig.projectName);
      let manifest: ProjectManifest;

      try {
        manifest = await b2.downloadJson<ProjectManifest>(manifestPath);
      } catch {
        spinner.fail("No remote files found");
        this.log("");
        this.log("This project hasn't been pushed yet.");
        this.log(`Run ${chalk.cyan("pss push")} first on another machine.`);
        return;
      }

      let filesToPull = manifest.files;

      if (args.files) {
        const filterNames = args.files.split(",").map((f) => f.trim());
        filesToPull = filesToPull.filter((f) => filterNames.includes(f.name));
      }

      if (filesToPull.length === 0) {
        spinner.succeed("No files to pull");
        return;
      }

      // Check if local has unpushed changes
      spinner.text = "Checking for local changes...";
      const baseContents = await loadAllBaseContents(projectDir);
      const localFiles = await discoverEnvFiles(
        projectDir,
        projectConfig.pattern,
        projectConfig.ignore
      );

      if (baseContents.size > 0 && !flags.force) {
        let hasLocalChanges = false;

        for (const localFile of localFiles) {
          const baseContent = baseContents.get(localFile.name);
          if (baseContent !== undefined) {
            const localHash = await hashFile(localFile.content);
            const baseHash = await hashFile(baseContent);
            if (localHash !== baseHash) {
              hasLocalChanges = true;
              break;
            }
          } else {
            // New local file not in base = local change
            hasLocalChanges = true;
            break;
          }
        }

        if (hasLocalChanges) {
          spinner.warn("Local has unpushed changes");
          this.log("");
          this.log(
            chalk.yellow(
              "You have local changes that haven't been pushed yet."
            )
          );
          this.log("");
          this.log("Options:");
          this.log(
            `  ${chalk.cyan("pss sync")}        Merge local and remote changes (recommended)`
          );
          this.log(
            `  ${chalk.cyan("pss pull -f")}     Force pull and overwrite local`
          );
          this.log("");
          return;
        }
      }

      spinner.stop();

      this.log(chalk.bold(`Pulling ${filesToPull.length} file(s):\n`));

      for (const file of filesToPull) {
        this.log(`  ${chalk.dim("•")} ${file.name} (${formatBytes(file.size)})`);
      }

      if (flags["dry-run"]) {
        this.log("");
        this.log(chalk.yellow("Dry run - no files were downloaded."));
        return;
      }

      this.log("");
      spinner.start("Downloading files...");

      let downloaded = 0;
      const baseFiles: BaseFileEntry[] = [];

      for (const file of filesToPull) {
        spinner.text = `Downloading ${file.name}...`;

        const storagePath = getStoragePath(
          auth.userId,
          projectConfig.projectName,
          file.name
        );

        const encrypted = await b2.downloadJson<EncryptedData>(storagePath);

        spinner.text = `Decrypting ${file.name}...`;

        const content = await decrypt(encrypted, encryptionKey);

        const localPath = join(projectDir, file.name);

        if (flags.backup) {
          const { access, copyFile } = await import("node:fs/promises");
          try {
            await access(localPath);
            await copyFile(localPath, `${localPath}.backup`);
          } catch {
            // File doesn't exist, no backup needed
          }
        }

        await writeFile(localPath, content);

        // Track for base snapshot
        baseFiles.push({
          name: file.name,
          hash: file.hash,
          content,
        });

        downloaded++;
      }

      // Update base snapshot to track what we pulled
      spinner.text = "Updating base snapshot...";
      const manifestHash = await hashFile(JSON.stringify(manifest));
      await updateBaseSnapshot(projectDir, baseFiles, manifestHash);

      projectConfig.lastSync = new Date().toISOString();
      await saveProjectConfig(projectDir, projectConfig);

      spinner.succeed(`Pulled ${downloaded} file(s)`);
    } catch (error) {
      spinner.fail("Pull failed");
      this.error((error as Error).message);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
