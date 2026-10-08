# Changelog

All notable changes to PromptL will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.1] - 2026-10-08

### Fixed

- Hardened template expression evaluation: member access can no longer reach `constructor`,
  `__proto__` or `prototype`, and function calls are restricted to scope-provided functions and an
  allowlist of safe built-in methods. Computed member keys are normalized once: primitives
  (including null/undefined/boolean/bigint) become strings, while objects, arrays, functions and
  symbols are rejected; blocked callables are checked before binding. Ref: GHSA-w66j-r3gv-h3rv.

## [0.12.0] - 2026-02-25

