export interface GlobalConfig {
  version: number;
  google?: {
    clientId: string;
    clientSecret?: string;
  };
  b2: {
    keyId: string;
    appKey: string;
    endpoint: string;
    bucket: string;
    region: string;
  };
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
}

export interface ProjectConfig {
  version: number;
  projectName: string;
  pattern: string;
  ignore: string[];
  lastSync?: string;
}

export interface ProjectManifest {
  version: number;
  projectName: string;
  files: FileEntry[];
}

export interface FileEntry {
  name: string;
  hash: string;
  size: number;
  updatedAt: string;
}

export interface EncryptedData {
  version: number;
  algorithm: string;
  nonce: string;
  ciphertext: string;
}

export const DEFAULT_B2_CONFIG = {
  endpoint: "s3.us-east-005.backblazeb2.com",
  bucket: "project-settings-sync",
  region: "us-east-005",
} as const;
