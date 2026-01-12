import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { GlobalConfig, AuthData, ProjectConfig } from "../types/index.ts";
import { DEFAULT_B2_CONFIG } from "../types/index.ts";

const CONFIG_DIR_NAME = "pss";

function getConfigDir(): string {
  const xdgConfig = process.env["XDG_CONFIG_HOME"];
  if (xdgConfig) {
    return join(xdgConfig, CONFIG_DIR_NAME);
  }
  return join(homedir(), ".config", CONFIG_DIR_NAME);
}

function getDataDir(): string {
  const xdgData = process.env["XDG_DATA_HOME"];
  if (xdgData) {
    return join(xdgData, CONFIG_DIR_NAME);
  }
  return join(homedir(), ".local", "share", CONFIG_DIR_NAME);
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export const configPaths = {
  configDir: getConfigDir(),
  dataDir: getDataDir(),
  globalConfig: join(getConfigDir(), "config.json"),
  authData: join(getConfigDir(), "auth.json"),
};

export async function loadGlobalConfig(): Promise<GlobalConfig | null> {
  try {
    const content = await readFile(configPaths.globalConfig, "utf-8");
    return JSON.parse(content) as GlobalConfig;
  } catch {
    return null;
  }
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureDir(configPaths.configDir);
  await writeFile(configPaths.globalConfig, JSON.stringify(config, null, 2));
}

export async function getOrCreateGlobalConfig(): Promise<GlobalConfig> {
  const existing = await loadGlobalConfig();
  if (existing) return existing;

  const defaultConfig: GlobalConfig = {
    version: 1,
    b2: {
      keyId: "",
      appKey: "",
      ...DEFAULT_B2_CONFIG,
    },
  };

  await saveGlobalConfig(defaultConfig);
  return defaultConfig;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const config = await getOrCreateGlobalConfig();

  const parts = key.split(".");
  if (parts.length !== 2) {
    throw new Error(`Invalid config key: ${key}. Use format: section.key`);
  }

  const [section, subKey] = parts;

  if (section === "b2") {
    if (!["keyId", "appKey", "endpoint", "bucket", "region"].includes(subKey!)) {
      throw new Error(`Unknown b2 config key: ${subKey}`);
    }
    (config.b2 as Record<string, string>)[subKey!] = value;
  } else if (section === "google") {
    if (!["clientId", "clientSecret"].includes(subKey!)) {
      throw new Error(`Unknown google config key: ${subKey}`);
    }
    if (!config.google) {
      config.google = { clientId: "" };
    }
    (config.google as Record<string, string>)[subKey!] = value;
  } else {
    throw new Error(`Unknown config section: ${section}`);
  }

  await saveGlobalConfig(config);
}

export async function loadAuthData(): Promise<AuthData | null> {
  try {
    const content = await readFile(configPaths.authData, "utf-8");
    return JSON.parse(content) as AuthData;
  } catch {
    return null;
  }
}

export async function saveAuthData(auth: AuthData): Promise<void> {
  await ensureDir(configPaths.configDir);
  await writeFile(configPaths.authData, JSON.stringify(auth, null, 2));
}

export async function clearAuthData(): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(configPaths.authData);
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function loadProjectConfig(projectDir: string): Promise<ProjectConfig | null> {
  try {
    const configPath = join(projectDir, ".pss.json");
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return null;
  }
}

export async function saveProjectConfig(projectDir: string, config: ProjectConfig): Promise<void> {
  const configPath = join(projectDir, ".pss.json");
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

export function isConfigured(config: GlobalConfig): boolean {
  return !!(config.b2.keyId && config.b2.appKey);
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return secret.slice(0, 4) + "****" + secret.slice(-4);
}
