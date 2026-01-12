import { Command, Args, Flags } from "@oclif/core";
import { basename } from "node:path";
import chalk from "chalk";
import { loadProjectConfig, saveProjectConfig } from "../lib/config.ts";
import { discoverEnvFiles } from "../lib/env-files.ts";
import type { ProjectConfig } from "../types/index.ts";

export default class Init extends Command {
  static override description = "Initialize a project for settings sync";

  static override examples = [
    "<%= config.bin %> init",
    "<%= config.bin %> init my-project",
    '<%= config.bin %> init --pattern ".env*"',
    '<%= config.bin %> init --ignore ".env.example"',
  ];

  static override args = {
    name: Args.string({
      description: "Project name (defaults to directory name)",
      required: false,
    }),
  };

  static override flags = {
    pattern: Flags.string({
      char: "p",
      description: "Glob pattern for .env files",
      default: ".env*",
    }),
    ignore: Flags.string({
      char: "i",
      description: "Files to ignore (can be used multiple times)",
      multiple: true,
      default: [],
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing configuration",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Init);

    const projectDir = process.cwd();
    const projectName = args.name || basename(projectDir);

    const existing = await loadProjectConfig(projectDir);
    if (existing && !flags.force) {
      this.log(
        `${chalk.yellow("!")} Project already initialized as "${existing.projectName}"`
      );
      this.log("Use --force to reinitialize.");
      return;
    }

    const envFiles = await discoverEnvFiles(projectDir, flags.pattern, flags.ignore);

    const config: ProjectConfig = {
      version: 1,
      projectName,
      pattern: flags.pattern,
      ignore: flags.ignore,
    };

    await saveProjectConfig(projectDir, config);

    this.log(chalk.green("✓") + ` Initialized project "${chalk.cyan(projectName)}"`);
    this.log("");

    if (envFiles.length > 0) {
      this.log("Found .env files:");
      for (const file of envFiles) {
        this.log(`  ${chalk.dim("•")} ${file.name}`);
      }
      this.log("");
      this.log(`Run ${chalk.cyan("pss push")} to upload these files.`);
    } else {
      this.log(chalk.dim(`No files matching "${flags.pattern}" found yet.`));
      this.log(`Create some .env files and run ${chalk.cyan("pss push")}.`);
    }

    this.log("");
    this.log(chalk.dim("Config saved to .pss.json"));
  }
}
