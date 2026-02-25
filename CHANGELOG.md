# Changelog

All notable changes to PromptL will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.0] - 2026-02-25

### Added

- RPC procedures `scanPrompt`, `renderPrompt`, and `createChain` now accept optional `references` (`Record<string, string>`) and `fullPath` parameters to support prompt references (`<prompt path="..." />`) over the WASM RPC boundary.
- When `references` is provided to `createChain`, references are pre-resolved via `scan()` so that subsequent `stepChain` calls carry no reference overhead.

### Changed

- Increased RPC receive buffer size from 1KB to 16KB for better throughput with larger payloads.

## [0.11.0] - 2026-02-25

### Fixed

- Nested loops bug: inner loop elements skipped across outer iterations.

## [0.10.0] - 2026-02-02

### Changed

- `---` is now treated as regular text when it cannot be a valid config delimiter. Previously, any `---` would be parsed as config, forcing users to escape it as `\---`. Now, `---` appearing after the config section is closed or after any substantive content (text, tags, mustache expressions) is treated as plain text.

## [0.9.5] - 2026-01-29

### Fixed

- Fixed crash in `scan()` when a `<prompt>` tag has a `path` attribute without a value (e.g., `<prompt path />` or malformed `<prompt path`). Now returns a proper `invalid-reference-path` error instead of crashing.
