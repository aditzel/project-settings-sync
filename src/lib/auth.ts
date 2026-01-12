import {
  loadGlobalConfig,
  loadAuthData,
  saveAuthData,
  clearAuthData,
} from "./config.ts";
import type { AuthData } from "../types/index.ts";
import { createServer } from "node:http";
import { URL } from "node:url";
import { spawn } from "node:child_process";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const REDIRECT_PORT = 8085;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

interface UserInfo {
  sub: string;
  email: string;
  name?: string;
}

export async function getGoogleCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const config = await loadGlobalConfig();
  if (!config?.google?.clientId) {
    throw new Error(
      "Google OAuth client ID not configured.\nRun: pss config set google.clientId YOUR_CLIENT_ID"
    );
  }
  if (!config.google.clientSecret) {
    throw new Error(
      "Google OAuth client secret not configured.\nRun: pss config set google.clientSecret YOUR_CLIENT_SECRET"
    );
  }
  return {
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
  };
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  // Generate a random code verifier (43-128 characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64UrlEncode(array.buffer);

  // Create SHA-256 hash of verifier for the challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(hashBuffer);

  return { verifier, challenge };
}

function buildAuthUrl(clientId: string, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";

  const args =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];

  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

async function waitForAuthCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>Authorization Failed</h1>
              <p>Error: ${error}</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>Invalid State</h1>
              <p>Security check failed. Please try again.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error("Invalid state parameter"));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>No Authorization Code</h1>
              <p>No code received. Please try again.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error("No authorization code received"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>Authorization Successful</h1>
            <p>You can close this window and return to the terminal.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
        </html>
      `);

      server.close();
      resolve(code);
    });

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      // Server is ready
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start auth server: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out"));
    }, 5 * 60 * 1000);
  });
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  return (await response.json()) as UserInfo;
}

export async function login(): Promise<AuthData> {
  const { clientId, clientSecret } = await getGoogleCredentials();
  const state = generateRandomString(32);
  const pkce = await generatePkce();
  const authUrl = buildAuthUrl(clientId, state, pkce.challenge);

  console.log("\nOpening browser for authentication...");
  console.log("If the browser doesn't open, visit this URL:\n");
  console.log(`  ${authUrl}\n`);

  openBrowser(authUrl);

  console.log("Waiting for authorization...\n");

  const code = await waitForAuthCode(state);
  const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, pkce.verifier);
  const userInfo = await getUserInfo(tokens.access_token);

  const authData: AuthData = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    userId: userInfo.sub,
    email: userInfo.email,
  };

  await saveAuthData(authData);
  return authData;
}

export async function logout(): Promise<void> {
  await clearAuthData();
}

export async function getAuthData(): Promise<AuthData | null> {
  const auth = await loadAuthData();
  if (!auth) return null;

  // Refresh if expiring within 1 minute
  if (Date.now() >= auth.expiresAt - 60000) {
    try {
      const { clientId, clientSecret } = await getGoogleCredentials();
      const tokens = await refreshAccessToken(clientId, clientSecret, auth.refreshToken);

      auth.accessToken = tokens.access_token;
      auth.expiresAt = Date.now() + tokens.expires_in * 1000;
      if (tokens.refresh_token) {
        auth.refreshToken = tokens.refresh_token;
      }

      await saveAuthData(auth);
    } catch {
      return null;
    }
  }

  return auth;
}

export async function requireAuth(): Promise<AuthData> {
  const auth = await getAuthData();
  if (!auth) {
    throw new Error("Not logged in. Run 'pss login' first.");
  }
  return auth;
}
