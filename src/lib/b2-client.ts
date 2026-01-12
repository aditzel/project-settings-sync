import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { GlobalConfig } from "../types/index.ts";

export class B2Client {
  private client: S3Client;
  private bucket: string;

  constructor(config: GlobalConfig["b2"]) {
    const s3Config: S3ClientConfig = {
      endpoint: `https://${config.endpoint}`,
      region: config.region,
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.appKey,
      },
      forcePathStyle: true,
    };

    this.client = new S3Client(s3Config);
    this.bucket = config.bucket;
  }

  async upload(
    key: string,
    data: string | Buffer,
    contentType = "application/octet-stream"
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
    });

    await this.client.send(command);
  }

  async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`No body in response for ${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async downloadJson<T>(key: string): Promise<T> {
    const data = await this.download(key);
    return JSON.parse(data.toString("utf-8")) as T;
  }

  async uploadJson<T>(key: string, data: T): Promise<void> {
    await this.upload(key, JSON.stringify(data, null, 2), "application/json");
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") {
        return false;
      }
      throw error;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            keys.push(obj.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  async testConnection(): Promise<boolean> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

export function createB2Client(config: GlobalConfig): B2Client {
  if (!config.b2.keyId || !config.b2.appKey) {
    throw new Error("B2 credentials not configured. Run 'pss config set' first.");
  }
  return new B2Client(config.b2);
}

export function getStoragePath(userId: string, projectName: string, fileName?: string): string {
  const basePath = `users/${userId}/projects/${projectName}`;
  if (fileName) {
    return `${basePath}/files/${fileName}.enc`;
  }
  return basePath;
}

export function getManifestPath(userId: string, projectName: string): string {
  return `users/${userId}/projects/${projectName}/manifest.json`;
}

export function getUserIndexPath(userId: string): string {
  return `users/${userId}/index.json`;
}
