import { Command, Args } from "@oclif/core";
import { setConfigValue } from "../../lib/config.ts";

export default class ConfigSet extends Command {
  static override description = "Set a configuration value";

  static override examples = [
    "<%= config.bin %> config set b2.keyId YOUR_KEY_ID",
    "<%= config.bin %> config set b2.appKey YOUR_APP_KEY",
    "<%= config.bin %> config set google.clientId YOUR_CLIENT_ID",
  ];

  static override args = {
    key: Args.string({
      description: "Configuration key (e.g., b2.keyId, google.clientId)",
      required: true,
    }),
    value: Args.string({
      description: "Value to set",
      required: true,
    }),
  };

  public async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);

    await setConfigValue(args.key, args.value);
    this.log(`Set ${args.key} successfully`);
  }
}
