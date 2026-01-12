import sodium from "libsodium-wrappers-sumo";
import type { EncryptedData } from "../types/index.ts";

const APP_SALT = "pss-encryption-salt-v1-2025";

let sodiumReady = false;

async function ensureSodium(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

export async function deriveKeyFromUserId(userId: string): Promise<Uint8Array> {
  await ensureSodium();

  const salt = sodium.crypto_generichash(
    sodium.crypto_pwhash_SALTBYTES,
    APP_SALT
  );

  return sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    userId,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

export async function encrypt(
  plaintext: string,
  key: Uint8Array
): Promise<EncryptedData> {
  await ensureSodium();

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintextBytes = sodium.from_string(plaintext);

  const ciphertext = sodium.crypto_secretbox_easy(plaintextBytes, nonce, key);

  return {
    version: 1,
    algorithm: "xchacha20-poly1305",
    nonce: sodium.to_base64(nonce),
    ciphertext: sodium.to_base64(ciphertext),
  };
}

export async function decrypt(
  encrypted: EncryptedData,
  key: Uint8Array
): Promise<string> {
  await ensureSodium();

  if (encrypted.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encrypted.version}`);
  }

  const nonce = sodium.from_base64(encrypted.nonce);
  const ciphertext = sodium.from_base64(encrypted.ciphertext);

  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

  if (!plaintext) {
    throw new Error("Decryption failed - invalid key or corrupted data");
  }

  return sodium.to_string(plaintext);
}

export async function hashFile(content: string): Promise<string> {
  await ensureSodium();

  const hash = sodium.crypto_generichash(32, content);
  return `sha256:${sodium.to_hex(hash)}`;
}

let cachedKey: Uint8Array | null = null;
let cachedUserId: string | null = null;

export async function getEncryptionKey(userId: string): Promise<Uint8Array> {
  if (cachedKey && cachedUserId === userId) {
    return cachedKey;
  }

  cachedKey = await deriveKeyFromUserId(userId);
  cachedUserId = userId;
  return cachedKey;
}

export function clearKeyCache(): void {
  cachedKey = null;
  cachedUserId = null;
}
