import { Command, Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { loadProjectConfig, loadGlobalConfig, saveProjectConfig } from "../lib/config.ts";
import { requireAuth } from "../lib/auth.ts";
import { discoverEnvFiles } from "../lib/env-files.ts";
import { encrypt, getEncryptionKey, hashFile } from "../lib/crypto.ts";
import { createB2Client, getStoragePath, getManifestPath } from "../lib/b2-client.ts";
import { loadBaseSnapshot, updateBaseSnapshot } from "../lib/base-snapshot.ts";
import type { ProjectManifest, FileEntry, BaseFileEntry } from "../types/index.ts";

export default class Push extends Command {
  static override description = "Push .env files to remote storage";

  static override examples = [
    "<%= config.bin %> push",
    "<%= config.bin %> push .env.local",
    "<%= config.bin %> push --dry-run",
  ];

  static override args = {
    files: Args.string({
      description: "Specific files to push (defaults to all)",
      required: false,
    }),
  };

  static override flags = {
    "dry-run": Flags.boolean({
      description: "Show what would be pushed without actually pushing",
      default: false,
    }),
    force: Flags.boolean({
      char: "f",
      description: "Push even if remote has unpulled changes",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Push);

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

    let envFiles = await discoverEnvFiles(projectDir, projectConfig.pattern, projectConfig.ignore);

    if (args.files) {
      const filterNames = args.files.split(",").map((f) => f.trim());
      envFiles = envFiles.filter((f) => filterNames.includes(f.name));
    }

    if (envFiles.length === 0) {
      this.log("No .env files to push.");
      return;
    }

    this.log(chalk.bold(`Pushing ${envFiles.length} file(s):\n`));

    for (const file of envFiles) {
      this.log(`  ${chalk.dim("•")} ${file.name} (${formatBytes(file.size)})`);
    }

    if (flags["dry-run"]) {
      this.log("");
      this.log(chalk.yellow("Dry run - no files were uploaded."));
      return;
    }

    this.log("");

    const spinner = ora("Connecting to B2...").start();

    try {
      const b2 = createB2Client(globalConfig);

      const connected = await b2.testConnection();
      if (!connected) {
        spinner.fail("Failed to connect to B2");
        this.error("Check your B2 credentials.");
      }

      const manifestPath = getManifestPath(auth.userId, projectConfig.projectName);
      let manifest: ProjectManifest;
      let remoteManifestHash: string | null = null;

      try {
        manifest = await b2.downloadJson<ProjectManifest>(manifestPath);
        remoteManifestHash = await hashFile(JSON.stringify(manifest));
      } catch {
        manifest = {
          version: 1,
          projectName: projectConfig.projectName,
          files: [],
        };
      }

      // Check if remote has changed since last sync
      spinner.text = "Checking for remote changes...";
      const baseSnapshot = await loadBaseSnapshot(projectDir);

      if (
        baseSnapshot &&
        remoteManifestHash &&
        baseSnapshot.remoteManifestHash !== remoteManifestHash &&
        !flags.force
      ) {
        spinner.warn("Remote has unpulled changes");
        this.log("");
        this.log(chalk.yellow("The remote has changes that you haven't pulled yet."));
        this.log("");
        this.log("Options:");
        this.log(`  ${chalk.cyan("pss sync")}        Merge local and remote changes (recommended)`);
        this.log(`  ${chalk.cyan("pss push -f")}     Force push and overwrite remote`);
        this.log("");
        return;
      }

      let uploaded = 0;
      const baseFiles: BaseFileEntry[] = [];

      for (const file of envFiles) {
        spinner.text = `Encrypting ${file.name}...`;

        const encrypted = await encrypt(file.content, encryptionKey);
        const hash = await hashFile(file.content);

        spinner.text = `Uploading ${file.name}...`;

        const storagePath = getStoragePath(auth.userId, projectConfig.projectName, file.name);

        await b2.uploadJson(storagePath, encrypted);

        const existingIndex = manifest.files.findIndex((f) => f.name === file.name);

        const entry: FileEntry = {
          name: file.name,
          hash,
          size: file.size,
          updatedAt: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
          manifest.files[existingIndex] = entry;
        } else {
          manifest.files.push(entry);
        }

        // Track for base snapshot
        baseFiles.push({
          name: file.name,
          hash,
          content: file.content,
        });

        uploaded++;
      }

      spinner.text = "Updating manifest...";
      await b2.uploadJson(manifestPath, manifest);

      // Update base snapshot to track what we pushed
      spinner.text = "Updating base snapshot...";
      const newManifestHash = await hashFile(JSON.stringify(manifest));
      await updateBaseSnapshot(projectDir, baseFiles, newManifestHash);

      projectConfig.lastSync = new Date().toISOString();
      await saveProjectConfig(projectDir, projectConfig);

      spinner.succeed(`Pushed ${uploaded} file(s)`);
    } catch (error) {
      spinner.fail("Push failed");
      this.error((error as Error).message);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
