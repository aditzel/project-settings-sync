import { Command } from "@oclif/core";
import { login, getAuthData } from "../lib/auth.ts";
import chalk from "chalk";

export default class Login extends Command {
  static override description = "Login with Google OAuth";

  static override examples = ["<%= config.bin %> login"];

  public async run(): Promise<void> {
    await this.parse(Login);

    const existing = await getAuthData();
    if (existing) {
      this.log(`Already logged in as ${chalk.cyan(existing.email)}`);
      this.log("Run 'pss logout' to log out first.");
      return;
    }

    try {
      const auth = await login();
      this.log("");
      this.log(chalk.green("✓") + ` Logged in as ${chalk.cyan(auth.email)}`);
    } catch (error) {
      this.error((error as Error).message);
    }
  }
}
