# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Model

PSS uses strong encryption to protect your settings:

- **Encryption**: XChaCha20-Poly1305 (authenticated encryption)
- **Key Derivation**: Argon2id (memory-hard, resistant to GPU attacks)
- **Authentication**: Google OAuth with PKCE flow

### What's Encrypted

- All `.env` file contents are encrypted before upload
- Encryption happens client-side; Backblaze B2 only stores encrypted data
- Your encryption passphrase never leaves your machine

### What's Stored Locally

- OAuth tokens in `~/.pss/credentials.json`
- Encryption salt (not the passphrase) in `~/.pss/`
- Project configuration in `.pss.json`

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public issue
2. Email the maintainer directly with details
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

## Security Best Practices

When using PSS:

1. **Use a strong passphrase** for encryption
2. **Don't share your passphrase** - each team member should use their own
3. **Keep credentials secure** - protect `~/.pss/` directory
4. **Review before pushing** - use `pss diff` to see what will be uploaded
5. **Use `.gitignore`** - ensure `.env*` and `.pss.json` are gitignored

## Known Limitations

- PSS trusts Google OAuth for authentication
- B2 bucket access is controlled by your B2 API keys
- Local credential files should be protected by OS file permissions
