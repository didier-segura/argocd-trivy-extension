# Changelog

## v0.4.12 2026-08-11

- `Fix`: "Vulnerabilities" tab was never displayed on any resource (Pod, ReplicaSet, StatefulSet, CronJob, Job). Root cause: `registerResourceExtension` was called with group `"*"`, but Argo CD's extensions service matches the resource's real API group against the registered group using `minimatch(resourceGroup, extension.group)`, and `minimatch("", "*")` evaluates to `false`. Since Pod's core API group is the empty string, the tab was always filtered out for Pod (and would have been fragile for any other core-group resource). Changed the registered group to `"**"`, which correctly matches the empty string as well as non-empty groups like `apps`/`batch`.

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

## v0.4.11 2026-08-11

- `Fix`: Externalized `react/jsx-runtime` (mapped to `window.ReactJSXRuntime`) as required by Argo CD 3.5+. Dependencies such as MUI/Emotion import the automatic JSX runtime directly; bundling it reaches into React internals removed in React 19 and crashes the extension at load time on hosts running React 19 (Argo CD 3.5+). Removed the now-unused `src/jsx-runtime-alias.js` shim and updated the local test harness to expose `window.ReactJSXRuntime`.

## v0.4.10 2026-08-11

- `Fix`: Reverted Emotion externalization from v0.4.9 — `@emotion/react`/`@emotion/styled` are now bundled directly into the extension again. Externalizing them caused `TypeError: Cannot read properties of undefined (reading 'ThemeContext')` and the extension failing to load entirely, since Argo CD does not expose Emotion as a shared global. Bundling reintroduces a harmless "you are loading @emotion/react when it is already loaded" console warning, but the extension now loads and renders correctly.

## v0.4.9 2026-08-11

- `Release`: Bump version to 0.4.9
- `Chore`: Externalized `@emotion/react` and `@emotion/styled` from the UMD bundle to avoid loading multiple Emotion instances in the host environment
