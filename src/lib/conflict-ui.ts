import * as readline from "node:readline";
import chalk from "chalk";
import type {
  ConflictEntry,
  ConflictResolution,
  ResolutionChoice,
} from "../types/index.ts";

/**
 * Simple readline-based conflict resolution UI.
 * Can be upgraded to full TUI with OpenTUI later.
 */
export class ConflictUI {
  private rl: readline.Interface | null = null;

  init(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl?.question(question, (answer) => {
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  /**
   * Display a conflict and get user resolution.
   */
  async resolveConflict(
    fileName: string,
    conflict: ConflictEntry
  ): Promise<ConflictResolution> {
    console.log("");
    console.log(chalk.bold("━".repeat(50)));
    console.log(chalk.bold(`  Conflict: ${fileName} → ${conflict.key}`));
    console.log(chalk.bold("━".repeat(50)));
    console.log("");

    if (conflict.baseValue !== undefined) {
      console.log(chalk.dim("  Base (last sync):"));
      console.log(chalk.dim(`    ${truncateValue(conflict.baseValue)}`));
      console.log("");
    }

    if (conflict.localValue !== undefined) {
      console.log(chalk.green("  Local (your changes):"));
      console.log(chalk.green(`    ${truncateValue(conflict.localValue)}`));
    } else {
      console.log(chalk.red("  Local: (deleted)"));
    }
    console.log("");

    if (conflict.remoteValue !== undefined) {
      console.log(chalk.blue("  Remote (other machine):"));
      console.log(chalk.blue(`    ${truncateValue(conflict.remoteValue)}`));
    } else {
      console.log(chalk.red("  Remote: (deleted)"));
    }
    console.log("");

    console.log(chalk.bold("━".repeat(50)));

    // Build options based on conflict type
    const options = this.buildOptions(conflict);
    this.displayOptions(options);

    console.log(chalk.bold("━".repeat(50)));
    console.log("");

    const answer = await this.prompt("  Choose [l/r/b/e/s]: ");
    const choice = this.parseChoice(answer, options);

    if (choice === "manual") {
      const manualValue = await this.prompt("  Enter value: ");
      return {
        key: conflict.key,
        choice: "manual",
        manualValue,
      };
    }

    return {
      key: conflict.key,
      choice,
    };
  }

  private buildOptions(
    conflict: ConflictEntry
  ): Array<{ key: string; label: string; choice: ResolutionChoice }> {
    const options: Array<{
      key: string;
      label: string;
      choice: ResolutionChoice;
    }> = [];

    // For edit_vs_delete, favor keeping the edit (as per user preference)
    if (conflict.localValue !== undefined) {
      const recommended =
        conflict.conflictType === "edit_vs_delete" && conflict.remoteValue === undefined
          ? " (recommended)"
          : "";
      options.push({
        key: "l",
        label: `Use local value${recommended}`,
        choice: "local",
      });
    } else {
      options.push({
        key: "l",
        label: "Delete (local choice)",
        choice: "local",
      });
    }

    if (conflict.remoteValue !== undefined) {
      const recommended =
        conflict.conflictType === "edit_vs_delete" && conflict.localValue === undefined
          ? " (recommended)"
          : "";
      options.push({
        key: "r",
        label: `Use remote value${recommended}`,
        choice: "remote",
      });
    } else {
      options.push({
        key: "r",
        label: "Delete (remote choice)",
        choice: "remote",
      });
    }

    if (conflict.baseValue !== undefined) {
      options.push({
        key: "b",
        label: "Keep base value",
        choice: "base",
      });
    }

    options.push({
      key: "e",
      label: "Edit manually",
      choice: "manual",
    });

    options.push({
      key: "s",
      label: "Skip (leave unresolved)",
      choice: "skip",
    });

    return options;
  }

  private displayOptions(
    options: Array<{ key: string; label: string; choice: ResolutionChoice }>
  ): void {
    for (const opt of options) {
      console.log(`  [${chalk.cyan(opt.key)}] ${opt.label}`);
    }
  }

  private parseChoice(
    answer: string,
    options: Array<{ key: string; label: string; choice: ResolutionChoice }>
  ): ResolutionChoice {
    const option = options.find((o) => o.key === answer);
    if (option) {
      return option.choice;
    }
    // Default to skip if invalid input
    return "skip";
  }

  /**
   * Resolve all conflicts for a file interactively.
   */
  async resolveAllConflicts(
    fileName: string,
    conflicts: ConflictEntry[]
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];

    for (let i = 0; i < conflicts.length; i++) {
      const conflict = conflicts[i]!;
      console.log(chalk.dim(`\n  Conflict ${i + 1} of ${conflicts.length}`));
      const resolution = await this.resolveConflict(fileName, conflict);
      resolutions.push(resolution);
    }

    return resolutions;
  }
}

/**
 * Truncate long values for display.
 */
function truncateValue(value: string, maxLength = 50): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + "...";
}

/**
 * Create and run the conflict resolution UI.
 * Returns all resolutions for the given conflicts.
 */
export async function runConflictResolutionUI(
  fileName: string,
  conflicts: ConflictEntry[]
): Promise<ConflictResolution[]> {
  const ui = new ConflictUI();
  ui.init();

  try {
    return await ui.resolveAllConflicts(fileName, conflicts);
  } finally {
    ui.cleanup();
  }
}
