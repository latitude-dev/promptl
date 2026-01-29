# Changelog

All notable changes to PromptL will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.5] - 2026-01-29

### Fixed

- Fixed crash in `scan()` when a `<prompt>` tag has a `path` attribute without a value (e.g., `<prompt path />` or malformed `<prompt path`). Now returns a proper `invalid-reference-path` error instead of crashing.
