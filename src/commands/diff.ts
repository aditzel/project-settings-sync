import { Command, Args, Flags } from "@oclif/core";
import chalk from "chalk";
import { loadProjectConfig, loadGlobalConfig } from "../lib/config.ts";
import { requireAuth } from "../lib/auth.ts";
import {
  discoverProjectFiles,
  parseEnvFile,
  diffEnvFiles,
  isEnvFile,
  normalizeRelativePath,
} from "../lib/env-files.ts";
import { createB2Client, getStoragePath, getManifestPath } from "../lib/b2-client.ts";
import { decrypt, getEncryptionKey, hashFile } from "../lib/crypto.ts";
import type { ProjectManifest, EncryptedData } from "../types/index.ts";

export default class Diff extends Command {
  static override description = "Show differences between local and remote files";

  static override examples = [
    "<%= config.bin %> diff",
    "<%= config.bin %> diff .env.local",
    "<%= config.bin %> diff --keys-only",
  ];

  static override args = {
    file: Args.string({
      description: "Specific file to diff",
      required: false,
    }),
  };

  static override flags = {
    "keys-only": Flags.boolean({
      description: "Only show which keys differ (not values)",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Diff);

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

    const b2 = createB2Client(globalConfig);

    let manifest: ProjectManifest;
    try {
      const manifestPath = getManifestPath(auth.userId, projectConfig.projectName);
      manifest = await b2.downloadJson<ProjectManifest>(manifestPath);
    } catch {
      this.log("No remote files found. Nothing to compare.");
      return;
    }

    let localFiles = await discoverProjectFiles(
      projectDir,
      projectConfig.pattern,
      projectConfig.ignore
    );

    const normalizedFile = args.file ? normalizeRelativePath(args.file) : null;

    if (args.file && !normalizedFile) {
      this.error(`Invalid file path: ${args.file}`);
    }

    if (normalizedFile) {
      localFiles = localFiles.filter((f) => f.name === normalizedFile);
      if (localFiles.length === 0) {
        this.error(`Local file not found: ${args.file}`);
      }
    }

    let hasDiff = false;

    for (const localFile of localFiles) {
      const remoteEntry = manifest.files.find((f) => f.name === localFile.name);

      if (!remoteEntry) {
        this.log(chalk.yellow(`${localFile.name}: only exists locally`));
        hasDiff = true;
        continue;
      }

      if (!isEnvFile(localFile.name)) {
        const localHash = await hashFile(localFile.content);
        if (localHash === remoteEntry.hash) {
          this.log(chalk.green(`${localFile.name}: in sync ✓`));
        } else {
          hasDiff = true;
          this.log(chalk.bold(`\n${localFile.name}:`));
          this.log(chalk.yellow("  Content differs"));
        }
        continue;
      }

      const storagePath = getStoragePath(auth.userId, projectConfig.projectName, localFile.name);

      try {
        const encrypted = await b2.downloadJson<EncryptedData>(storagePath);
        const remoteContent = await decrypt(encrypted, encryptionKey);

        const localVars = parseEnvFile(localFile.content);
        const remoteVars = parseEnvFile(remoteContent);

        const diff = diffEnvFiles(localVars, remoteVars);

        if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
          this.log(chalk.green(`${localFile.name}: in sync ✓`));
          continue;
        }

        hasDiff = true;
        this.log(chalk.bold(`\n${localFile.name}:`));

        if (diff.added.length > 0) {
          this.log(chalk.green("  Added locally:"));
          for (const key of diff.added) {
            if (flags["keys-only"]) {
              this.log(chalk.green(`    + ${key}`));
            } else {
              this.log(chalk.green(`    + ${key}=${localVars.get(key)}`));
            }
          }
        }

        if (diff.removed.length > 0) {
          this.log(chalk.red("  Removed locally:"));
          for (const key of diff.removed) {
            if (flags["keys-only"]) {
              this.log(chalk.red(`    - ${key}`));
            } else {
              this.log(chalk.red(`    - ${key}=${remoteVars.get(key)}`));
            }
          }
        }

        if (diff.changed.length > 0) {
          this.log(chalk.yellow("  Changed:"));
          for (const key of diff.changed) {
            if (flags["keys-only"]) {
              this.log(chalk.yellow(`    ~ ${key}`));
            } else {
              this.log(chalk.red(`    - ${key}=${remoteVars.get(key)}`));
              this.log(chalk.green(`    + ${key}=${localVars.get(key)}`));
            }
          }
        }
      } catch (error) {
        this.log(chalk.red(`${localFile.name}: failed to compare - ${(error as Error).message}`));
      }
    }

    for (const remoteFile of manifest.files) {
      const hasLocal = localFiles.some((l) => l.name === remoteFile.name);
      if (!hasLocal && (!normalizedFile || normalizedFile === remoteFile.name)) {
        this.log(chalk.blue(`${remoteFile.name}: only exists remotely`));
        hasDiff = true;
      }
    }

    if (!hasDiff) {
      this.log(chalk.green("\nAll files are in sync!"));
    }
  }
}
