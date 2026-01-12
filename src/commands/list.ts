import { Command, Args, Flags } from "@oclif/core";
import chalk from "chalk";
import { loadProjectConfig, loadGlobalConfig } from "../lib/config.ts";
import { getAuthData } from "../lib/auth.ts";
import { discoverEnvFiles } from "../lib/env-files.ts";
import { createB2Client, getManifestPath } from "../lib/b2-client.ts";
import type { ProjectManifest } from "../types/index.ts";

export default class List extends Command {
  static override description = "List projects and files";

  static override examples = [
    "<%= config.bin %> list",
    "<%= config.bin %> list --projects",
    "<%= config.bin %> list --remote",
  ];

  static override args = {
    project: Args.string({
      description: "Project name to list files for",
      required: false,
    }),
  };

  static override flags = {
    projects: Flags.boolean({
      description: "List all projects only",
      default: false,
    }),
    remote: Flags.boolean({
      description: "Show only remote files",
      default: false,
    }),
    local: Flags.boolean({
      description: "Show only local files",
      default: false,
    }),
    json: Flags.boolean({
      description: "Output as JSON",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(List);

    const auth = await getAuthData();
    if (!auth) {
      this.error("Not logged in. Run 'pss login' first.");
    }

    const globalConfig = await loadGlobalConfig();
    if (!globalConfig) {
      this.error("Not configured. Run 'pss config set' first.");
    }

    if (flags.projects) {
      await this.listProjects(auth.userId, globalConfig, flags.json);
      return;
    }

    const projectDir = process.cwd();
    const projectConfig = await loadProjectConfig(projectDir);

    const projectName = args.project || projectConfig?.projectName;

    if (!projectName) {
      this.error("No project specified. Run 'pss init' or specify a project name.");
    }

    const localFiles = !flags.remote
      ? await discoverEnvFiles(
          projectDir,
          projectConfig?.pattern || ".env*",
          projectConfig?.ignore || []
        )
      : [];

    let remoteFiles: Array<{ name: string; size: number; updatedAt: string }> = [];

    if (!flags.local) {
      try {
        const b2 = createB2Client(globalConfig);
        const manifestPath = getManifestPath(auth.userId, projectName);
        const manifest = await b2.downloadJson<ProjectManifest>(manifestPath);
        remoteFiles = manifest.files.map((f) => ({
          name: f.name,
          size: f.size,
          updatedAt: f.updatedAt,
        }));
      } catch {
        // No remote files
      }
    }

    if (flags.json) {
      this.log(JSON.stringify({ local: localFiles, remote: remoteFiles }, null, 2));
      return;
    }

    this.log(chalk.bold(`Project: ${projectName}\n`));

    if (!flags.remote && localFiles.length > 0) {
      this.log("Local files:");
      for (const file of localFiles) {
        const isOnRemote = remoteFiles.some((r) => r.name === file.name);
        const status = isOnRemote ? chalk.green("✓") : chalk.yellow("○");
        this.log(`  ${status} ${file.name} (${formatBytes(file.size)})`);
      }
      this.log("");
    }

    if (!flags.local && remoteFiles.length > 0) {
      this.log("Remote files:");
      for (const file of remoteFiles) {
        const isLocal = localFiles.some((l) => l.name === file.name);
        const status = isLocal ? chalk.green("✓") : chalk.blue("↓");
        this.log(
          `  ${status} ${file.name} (${formatBytes(file.size)}) - ${formatDate(file.updatedAt)}`
        );
      }
      this.log("");
    }

    if (localFiles.length === 0 && remoteFiles.length === 0) {
      this.log(chalk.dim("No files found."));
    }

    this.log("");
    this.log(chalk.dim("✓ = synced  ○ = local only  ↓ = remote only"));
  }

  private async listProjects(
    userId: string,
    globalConfig: Awaited<ReturnType<typeof loadGlobalConfig>>,
    json: boolean
  ): Promise<void> {
    if (!globalConfig) return;

    try {
      const b2 = createB2Client(globalConfig);

      const keys = await b2.list(`users/${userId}/projects/`);
      const projects = new Set<string>();

      for (const key of keys) {
        const match = key.match(/users\/[^/]+\/projects\/([^/]+)\//);
        if (match?.[1]) {
          projects.add(match[1]);
        }
      }

      if (json) {
        this.log(JSON.stringify([...projects], null, 2));
        return;
      }

      if (projects.size === 0) {
        this.log("No projects found.");
        return;
      }

      this.log(chalk.bold("Your projects:\n"));
      for (const project of projects) {
        this.log(`  ${chalk.dim("•")} ${project}`);
      }
    } catch (error) {
      this.error((error as Error).message);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString();
}
