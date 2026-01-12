# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-01-12

### Added

- Initial release of PSS (Project Settings Sync)
- End-to-end encryption using XChaCha20-Poly1305
- Google OAuth authentication with PKCE flow
- Backblaze B2 storage integration
- Core commands:
  - `pss init` - Initialize PSS in a project
  - `pss push` - Push local settings to cloud
  - `pss pull` - Pull settings from cloud
  - `pss sync` - Three-way sync with conflict resolution
  - `pss status` - Show sync status
  - `pss diff` - Show differences between local and remote
  - `pss list` - List tracked env files
  - `pss add` - Add files to tracking
  - `pss remove` - Remove files from tracking
  - `pss login` - Authenticate with Google
  - `pss logout` - Clear authentication
- Three-way merge algorithm with intelligent conflict detection
- Interactive conflict resolution UI
- Argon2id key derivation for encryption
- Local credential storage in `~/.pss/`

[Unreleased]: https://github.com/aditzel/project-settings-sync/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aditzel/project-settings-sync/releases/tag/v0.1.0
