# Changelog

## v0.4.1 2026-08-05

- `Chore`: Switched GitHub Actions release pipeline to use auto-generated release notes

## v0.4.0 2026-08-05

- `Enhancement`: Modernized UI with glassmorphism, dynamic micro-animations, and updated color palettes
- `Enhancement`: Added interactive visual progress bars for CVSS scores and direct links to NVD/NIST databases
- `Refactor`: Fully migrated build toolchain from unmaintained `react-scripts`/Webpack to Vite (improves build times by ~3x)
- `Chore`: Migrated GitHub Actions CI/CD workflows to run on Node.js 24
- `Security`: Eliminated 67 dependency vulnerabilities by replacing legacy Webpack tree, resolving critical npm audit warnings

## v0.2.3 2026-02-23

- Release v0.2.3 (validated resource-tree fallback for long-named workloads)

## v0.2.2 2026-02-23

- `Fix`: VulnerabilityReport lookup for workloads with long names. When the report name exceeds 63 characters, Trivy Operator uses a hash-based name. The extension now falls back to finding reports via Argo CD resource-tree (all VulnerabilityReports in namespace, match by trivy-operator labels when fetching).

## v0.2.1 2024-05-13

- Fix: sorting order for severity column

## v0.2.0 2024-04-13

- `Enhancement`: Allow reports display for pods with multiple containers
- Minor styling updates to improve dark theme visibility

## v0.1.0 2024-04-07

- Initial release

## v0.4.9 2026-08-11

- `Release`: Bump version to 0.4.9
- `Chore`: Externalized `@emotion/react` and `@emotion/styled` from the UMD bundle to avoid loading multiple Emotion instances in the host environment
