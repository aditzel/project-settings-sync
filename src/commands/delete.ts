import { Command, Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";
import { loadProjectConfig, loadGlobalConfig } from "../lib/config.ts";
import { requireAuth } from "../lib/auth.ts";
import { createB2Client, getStoragePath, getManifestPath } from "../lib/b2-client.ts";
import type { ProjectManifest } from "../types/index.ts";

export default class Delete extends Command {
  static override description = "Delete files or project from remote storage";

  static override examples = [
    "<%= config.bin %> delete .env.local",
    "<%= config.bin %> delete --project",
    "<%= config.bin %> delete --project --force",
  ];

  static override args = {
    files: Args.string({
      description: "Files to delete (comma-separated)",
      required: false,
    }),
  };

  static override flags = {
    project: Flags.boolean({
      description: "Delete entire project from remote",
      default: false,
    }),
    force: Flags.boolean({
      char: "f",
      description: "Skip confirmation",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Delete);

    if (!args.files && !flags.project) {
      this.error("Specify files to delete or use --project to delete entire project.");
    }

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

    const b2 = createB2Client(globalConfig);

    if (flags.project) {
      if (!flags.force) {
        this.log(
          chalk.red(`⚠️  This will delete all remote files for project "${projectConfig.projectName}"`)
        );
        this.log("Use --force to confirm deletion.");
        return;
      }

      const spinner = ora("Deleting project...").start();

      try {
        const prefix = `users/${auth.userId}/projects/${projectConfig.projectName}/`;
        const keys = await b2.list(prefix);

        for (const key of keys) {
          spinner.text = `Deleting ${key}...`;
          await b2.delete(key);
        }

        spinner.succeed(`Deleted project "${projectConfig.projectName}" from remote`);
      } catch (error) {
        spinner.fail("Delete failed");
        this.error((error as Error).message);
      }

      return;
    }

    const filesToDelete = args.files!.split(",").map((f) => f.trim());

    if (!flags.force) {
      this.log(chalk.yellow("Files to delete from remote:"));
      for (const file of filesToDelete) {
        this.log(`  ${chalk.dim("•")} ${file}`);
      }
      this.log("\nUse --force to confirm deletion.");
      return;
    }

    const spinner = ora("Deleting files...").start();

    try {
      const manifestPath = getManifestPath(auth.userId, projectConfig.projectName);
      let manifest: ProjectManifest;

      try {
        manifest = await b2.downloadJson<ProjectManifest>(manifestPath);
      } catch {
        spinner.fail("No remote files found");
        return;
      }

      let deleted = 0;

      for (const fileName of filesToDelete) {
        const storagePath = getStoragePath(
          auth.userId,
          projectConfig.projectName,
          fileName
        );

        try {
          await b2.delete(storagePath);
          manifest.files = manifest.files.filter((f) => f.name !== fileName);
          deleted++;
        } catch {
          this.warn(`File not found: ${fileName}`);
        }
      }

      if (deleted > 0) {
        await b2.uploadJson(manifestPath, manifest);
      }

      spinner.succeed(`Deleted ${deleted} file(s)`);
    } catch (error) {
      spinner.fail("Delete failed");
      this.error((error as Error).message);
    }
  }
}
