import { Command } from "@oclif/core";
import { logout, getAuthData } from "../lib/auth.ts";
import chalk from "chalk";

export default class Logout extends Command {
  static override description = "Log out and clear stored credentials";

  static override examples = ["<%= config.bin %> logout"];

  public async run(): Promise<void> {
    await this.parse(Logout);

    const auth = await getAuthData();

    if (!auth) {
      this.log("Not currently logged in.");
      return;
    }

    await logout();
    this.log(chalk.green("✓") + ` Logged out from ${chalk.cyan(auth.email)}`);
  }
}
