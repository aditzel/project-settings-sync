import { Command, Args, Flags } from "@oclif/core";
import { basename, join } from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import chalk from "chalk";
import { loadProjectConfig, saveProjectConfig } from "../lib/config.ts";
import { discoverProjectFiles } from "../lib/env-files.ts";
import { ensurePssDir } from "../lib/base-snapshot.ts";
import type { ProjectConfig } from "../types/index.ts";

export default class Init extends Command {
  static override description = "Initialize a project for settings sync";

  static override examples = [
    "<%= config.bin %> init",
    "<%= config.bin %> init my-project",
    '<%= config.bin %> init --pattern ".env*"',
    '<%= config.bin %> init --pattern "**/*.{env,json,yaml,yml}"',
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
      description: "Glob pattern for project files",
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
      this.log(`${chalk.yellow("!")} Project already initialized as "${existing.projectName}"`);
      this.log("Use --force to reinitialize.");
      return;
    }

    const pattern = await this.resolvePattern(flags.pattern);
    const projectFiles = await discoverProjectFiles(projectDir, pattern, flags.ignore);

    const config: ProjectConfig = {
      version: 1,
      projectName,
      pattern,
      ignore: flags.ignore,
    };

    await saveProjectConfig(projectDir, config);

    // Create .pss/ directory for base snapshots
    await ensurePssDir(projectDir);

    // Update .gitignore
    const gitignoreUpdated = await this.updateGitignore(projectDir);

    this.log(chalk.green("✓") + ` Initialized project "${chalk.cyan(projectName)}"`);
    this.log("");

    if (projectFiles.length > 0) {
      this.log("Found files:");
      for (const file of projectFiles) {
        this.log(`  ${chalk.dim("•")} ${file.name}`);
      }
      this.log("");
      this.log(`Run ${chalk.cyan("pss push")} to upload these files.`);
    } else {
      this.log(chalk.dim(`No files matching "${pattern}" found yet.`));
      this.log(`Create some files and run ${chalk.cyan("pss push")}.`);
    }

    this.log("");
    this.log(chalk.dim("Config saved to .pss.json"));
    if (gitignoreUpdated) {
      this.log(chalk.dim("Updated .gitignore with .pss/ and .env entries"));
    }
  }

  /**
   * Update .gitignore to include .pss/ directory and .env files
   */
  private async updateGitignore(projectDir: string): Promise<boolean> {
    const gitignorePath = join(projectDir, ".gitignore");
    const entriesToAdd = [".pss/", ".env*", "!.env.example"];

    let content = "";
    let existingEntries = new Set<string>();

    // Try to read existing .gitignore
    try {
      await access(gitignorePath);
      content = await readFile(gitignorePath, "utf-8");
      existingEntries = new Set(content.split("\n").map((line) => line.trim()));
    } catch {
      // .gitignore doesn't exist, we'll create it
    }

    // Check which entries need to be added
    const newEntries = entriesToAdd.filter((entry) => !existingEntries.has(entry));

    if (newEntries.length === 0) {
      return false;
    }

    // Add pss section to gitignore
    const section = ["", "# Project Settings Sync", ...newEntries].join("\n");

    const newContent = content.trimEnd() + section + "\n";
    await writeFile(gitignorePath, newContent);

    return true;
  }

  private async resolvePattern(pattern?: string): Promise<string> {
    if (pattern) {
      return pattern;
    }

    const defaultPattern = ".env*";
    const extendedPattern = "{**/.env*,**/*.{json,yaml,yml}}";

    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!isInteractive || process.env.CI) {
      return defaultPattern;
    }

    const includeStructured = await promptConfirm("Include JSON/YAML files in sync?");
    return includeStructured ? extendedPattern : defaultPattern;
  }
}

function promptConfirm(question: string, defaultValue = false): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue ? " (Y/n)" : " (y/N)";
  const prompt = `${question}${suffix} `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (!normalized) {
        resolve(defaultValue);
        return;
      }
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}
