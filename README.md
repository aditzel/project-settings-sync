# PSS - Project Settings Sync

Sync your `.env` files securely across machines using Backblaze B2 storage and Google OAuth authentication.

## Features

- **End-to-end encryption** - Files are encrypted locally using XChaCha20-Poly1305 before upload
- **Google OAuth** - Authenticate with your Google account (no passwords to manage)
- **Three-way merge** - Intelligently sync changes between machines with conflict detection
- **Conflict resolution** - Interactive UI for resolving divergent changes
- **Backblaze B2** - Affordable, S3-compatible cloud storage (~$0.005/GB/month)

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0+)
- A [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) account
- A [Google Cloud](https://console.cloud.google.com/) project with OAuth credentials

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd project-settings-sync

# Install dependencies
bun install

# Build the CLI
bun run build

# Link globally (optional)
bun link
```

Or run directly with:

```bash
bun run ./bin/run.ts <command>
```

## Configuration

### 1. Set up Backblaze B2

1. Create a [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) account
2. Create a new bucket (e.g., `my-project-settings`)
3. Go to **App Keys** and create a new application key with read/write access to your bucket
4. Note down:
   - **keyID** - The application key ID
   - **applicationKey** - The secret application key
   - **Endpoint** - Found in bucket details (e.g., `s3.us-east-005.backblazeb2.com`)
   - **Region** - Extracted from endpoint (e.g., `us-east-005`)

Configure pss with your B2 credentials:

```bash
pss config set b2.keyId YOUR_KEY_ID
pss config set b2.appKey YOUR_APPLICATION_KEY
pss config set b2.bucket your-bucket-name
pss config set b2.endpoint s3.us-east-005.backblazeb2.com
pss config set b2.region us-east-005
```

### 2. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Go to **APIs & Services** > **OAuth consent screen**
   - Configure for "External" users (or "Internal" if using Google Workspace)
   - Add your email as a test user
4. Go to **APIs & Services** > **Credentials**
5. Click **Create Credentials** > **OAuth client ID**
   - Application type: **Desktop app**
   - Name: `PSS CLI`
6. Download or copy the **Client ID** and **Client Secret**

Configure pss with your Google credentials:

```bash
pss config set google.clientId YOUR_CLIENT_ID.apps.googleusercontent.com
pss config set google.clientSecret YOUR_CLIENT_SECRET
```

### 3. Verify Configuration

```bash
pss config list
```

You should see all your configured values (secrets are partially masked).

## Usage

### Login

Authenticate with Google OAuth:

```bash
pss login
```

This opens a browser window for Google authentication. Your credentials are stored locally in `~/.config/pss/auth.json`.

### Initialize a Project

Navigate to your project directory and initialize:

```bash
cd /path/to/your/project
pss init
```

This creates:
- `.pss.json` - Project configuration (commit this)
- `.pss/` - Local sync state (add to `.gitignore`)

The init wizard will ask for:
- **Project name** - Unique identifier for this project
- **File pattern** - Glob pattern for env files (default: `.env*`)
- **Ignore patterns** - Files to exclude (e.g., `.env.example`)

### Push Local Files

Upload your local `.env` files to B2:

```bash
pss push

# Preview without uploading
pss push --dry-run

# Push specific files
pss push .env.local
```

### Pull Remote Files

Download `.env` files from B2:

```bash
pss pull

# Preview without downloading
pss pull --dry-run

# Create backups before overwriting
pss pull --backup
```

### Sync (Recommended)

Intelligently merge local and remote changes:

```bash
pss sync

# Preview merge without applying
pss sync --dry-run

# Auto-resolve conflicts using local values
pss sync --ours

# Auto-resolve conflicts using remote values
pss sync --theirs
```

The sync command:
1. Downloads remote files
2. Compares local, remote, and base (last sync) versions
3. Auto-merges non-conflicting changes
4. Prompts for manual resolution of conflicts
5. Uploads merged result

### View Differences

Compare local and remote files:

```bash
pss diff

# Diff specific file
pss diff .env.local
```

### List Projects and Files

```bash
# List all synced projects
pss list

# List files in current project
pss list files
```

### Delete

```bash
# Delete specific files from remote
pss delete .env.local

# Delete entire project from remote
pss delete --project
```

### Logout

```bash
pss logout
```

## Sync Workflow

### Three-Way Merge

PSS uses three-way merge to intelligently handle changes:

| Base | Local | Remote | Result |
|------|-------|--------|--------|
| - | A | B | **Conflict** (new key collision) |
| - | A | - | Use local |
| - | - | A | Use remote |
| A | A | A | No change |
| A | B | A | Use local (only local changed) |
| A | A | B | Use remote (only remote changed) |
| A | B | B | Use B (both same change) |
| A | B | C | **Conflict** (divergent edit) |
| A | - | A | Delete (local deleted) |
| A | A | - | Delete (remote deleted) |
| A | - | B | **Conflict** (edit vs delete) |
| A | B | - | **Conflict** (edit vs delete) |

### Conflict Resolution

When conflicts are detected, you have several options:

```bash
# Interactive resolution (default)
pss sync

# Use all local values
pss sync --ours

# Use all remote values
pss sync --theirs
```

In interactive mode, for each conflict you can:
- `[l]` Use local value
- `[r]` Use remote value
- `[b]` Keep base value
- `[e]` Edit manually
- `[s]` Skip (leave unresolved)

### Push/Pull Safety

Both `push` and `pull` now detect potential conflicts:

```bash
# If remote has changes you haven't pulled:
$ pss push
⚠ Remote has unpulled changes

Options:
  pss sync        Merge local and remote changes (recommended)
  pss push -f     Force push and overwrite remote

# If local has changes you haven't pushed:
$ pss pull
⚠ Local has unpushed changes

Options:
  pss sync        Merge local and remote changes (recommended)
  pss pull -f     Force pull and overwrite local
```

## Security

### Encryption

All files are encrypted locally before upload using:
- **Algorithm**: XChaCha20-Poly1305 (authenticated encryption)
- **Key derivation**: Argon2id with your Google user ID as salt
- **Nonces**: Randomly generated for each encryption

The encryption key never leaves your machine. B2 only stores encrypted blobs.

### Authentication

- Google OAuth 2.0 with PKCE (no client secret exposure)
- Tokens stored locally in `~/.config/pss/auth.json`
- Automatic token refresh

### Data Storage

| Data | Location | Encrypted |
|------|----------|-----------|
| B2 credentials | `~/.config/pss/config.json` | No (local only) |
| Google tokens | `~/.config/pss/auth.json` | No (local only) |
| Project config | `.pss.json` | No (safe to commit) |
| Base snapshots | `.pss/` | No (add to .gitignore) |
| Remote files | Backblaze B2 | **Yes** |

## Project Structure

```
your-project/
  .env                  # Your env files
  .env.local
  .env.production
  .pss.json             # Project config (commit this)
  .pss/                 # Local sync state (gitignore this)
    base/
      .env.base
      .env.local.base
    snapshot.json

~/.config/pss/
  config.json           # Global config (B2 creds, Google OAuth)
  auth.json             # Google auth tokens
```

## Troubleshooting

### "Not logged in"

```bash
pss login
```

### "Not configured"

```bash
pss config set b2.keyId YOUR_KEY_ID
pss config set b2.appKey YOUR_APP_KEY
# ... other config values
```

### "Failed to connect to B2"

1. Verify your B2 credentials are correct
2. Check that your bucket exists
3. Ensure your application key has read/write permissions

### "Project not initialized"

```bash
pss init
```

### Conflicts not resolving

Use `pss sync --dry-run` to preview changes, then:
- `pss sync --ours` to prefer local
- `pss sync --theirs` to prefer remote

## Development

```bash
# Run in development mode
bun run dev <command>

# Run tests
bun test

# Build
bun run build
```

## License

MIT
