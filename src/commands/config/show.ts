import { Command, Flags } from "@oclif/core";
import { loadGlobalConfig, maskSecret, configPaths } from "../../lib/config.ts";

export default class ConfigShow extends Command {
  static override description = "Show current configuration";

  static override examples = [
    "<%= config.bin %> config show",
    "<%= config.bin %> config show --show-secrets",
  ];

  static override flags = {
    "show-secrets": Flags.boolean({
      description: "Show unmasked secrets",
      default: false,
    }),
    json: Flags.boolean({
      description: "Output as JSON",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(ConfigShow);

    const config = await loadGlobalConfig();

    if (!config) {
      this.log("No configuration found.");
      this.log(`Config file: ${configPaths.globalConfig}`);
      this.log("\nRun 'pss config set' to configure.");
      return;
    }

    if (flags.json) {
      const output = flags["show-secrets"]
        ? config
        : {
            ...config,
            b2: {
              ...config.b2,
              keyId: config.b2.keyId ? maskSecret(config.b2.keyId) : "",
              appKey: config.b2.appKey ? maskSecret(config.b2.appKey) : "",
            },
          };
      this.log(JSON.stringify(output, null, 2));
      return;
    }

    this.log("Configuration:");
    this.log(`  Config file: ${configPaths.globalConfig}`);
    this.log("");
    this.log("B2 Storage:");
    this.log(
      `  keyId:    ${config.b2.keyId ? (flags["show-secrets"] ? config.b2.keyId : maskSecret(config.b2.keyId)) : "(not set)"}`
    );
    this.log(
      `  appKey:   ${config.b2.appKey ? (flags["show-secrets"] ? config.b2.appKey : maskSecret(config.b2.appKey)) : "(not set)"}`
    );
    this.log(`  endpoint: ${config.b2.endpoint}`);
    this.log(`  bucket:   ${config.b2.bucket}`);
    this.log(`  region:   ${config.b2.region}`);
    this.log("");
    this.log("Google OAuth:");
    this.log(`  clientId:     ${config.google?.clientId || "(not set)"}`);
    this.log(
      `  clientSecret: ${config.google?.clientSecret ? (flags["show-secrets"] ? config.google.clientSecret : maskSecret(config.google.clientSecret)) : "(not set)"}`
    );
  }
}
