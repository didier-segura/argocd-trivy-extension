# Changelog

## v0.4.17 2026-08-11

- `Fix`: The Severity Summary pie chart (the only chart left using `ResponsiveContainer`, previously assumed reliable because of its fixed-pixel wrapper div) was still going blank in live testing after v0.4.16, since it sits inside a `display:flex` container which triggers the same Recharts width-measurement failure as the CSS Grid cards. Converted it to the `MeasuredChartContainer` (`ResizeObserver`-based) pattern used by the other 6 charts, and removed the now-unused `ResponsiveContainer` import. All 8 Dashboard cards now use consistent, reliable sizing.

## v0.4.16 2026-08-11

- `Fix`: Confirmed via v0.4.15's diagnostics (browser console showed `topPackages: 15`, `vulnerabilitiesByType: 12`, `patchSummaryData: 5`, etc. — all non-empty — and no error boundary was triggered) that the 6 blank Dashboard charts were neither a data problem nor a JS exception, but Recharts' `ResponsiveContainer` failing to measure a non-zero width on first mount inside this dashboard's CSS Grid layout and never recovering. Replaced `ResponsiveContainer` in the 6 affected charts (Top Packages, Vulnerabilities by Type, Patchable Vulnerabilities, Top Vulnerable Resources + its sparklines, Vulnerabilities by Year, Timeline, and the resource drill-down sparkline) with a `MeasuredChartContainer` that measures its own DOM node directly via `ResizeObserver` and passes an explicit pixel width straight to the chart component, bypassing `ResponsiveContainer`'s internal measurement entirely. Severity Summary and the Resource × Severity Heatmap (already working) are left unchanged.

## v0.4.15 2026-08-11

- `Diagnostics`: The v0.4.14 fix (wrapping `ResponsiveContainer` charts in an explicitly-sized div) did not resolve the 6 blank Dashboard charts (Top Packages, Vulnerabilities by Type, Patchable Vulnerabilities, Top Vulnerable Resources, Vulnerabilities by Year, Timeline), while Severity Summary and Resource × Severity Heatmap continue to work correctly. Since the root cause is still unconfirmed, each of the 6 charts is now wrapped in a `ChartErrorBoundary` that displays the exact error message (instead of silently rendering blank) if a render error occurs, and shows an explicit "No data available" placeholder when the underlying data array is genuinely empty. This will make the next test run reveal whether the issue is a JS error, empty/zero data, or something else (e.g. sizing) so it can be fixed definitively rather than guessed at.

## v0.4.14 2026-08-11

- `Fix`: Dashboard tab showed only 2 of 8 chart cards (Severity Summary and Resource × Severity Heatmap); the other six charts (Top Packages, Vulnerabilities by Type, Patchable Vulnerabilities, Top Vulnerable Resources, Vulnerabilities by Year, Timeline) rendered completely blank. Root cause: those charts' `ResponsiveContainer` had no ancestor element with an explicit CSS size, so inside the CSS Grid dashboard layout Recharts could not reliably measure a non-zero width/height on mount. All `ResponsiveContainer` usages are now wrapped in a div with an explicit pixel width/height, matching the pattern already used successfully by the working Severity Summary chart.
- `Fix`: "Top Packages by Vulnerabilities" chart grouped by the wrong field (a non-existent `packageName`/`pkgName`/`package`, falling back to the vulnerability `title`), producing meaningless per-CVE groupings. Now groups by the vulnerability's `resource` (package) field first.
- `Fix`: "Vulnerabilities by Type" chart could throw when a vulnerability had no `title`, aborting the rest of `DashboardData()`. Made the title check null-safe.
- `Fix`: Base OS badge not appearing for some containers. `GetVulnerabilityData()` now also checks Trivy Operator's actual `report.os.family` / `report.os.name` fields (and a top-level `os.family`/`os.name`) in addition to the previously-checked `baseOS`/`image.os`/`baseImage`/label fields.
- `Enhancement`: Added a "Select container :" label before the container selector in the resource header.
- `Fix`: Severity filter `<select>` in the Table tab stretched to the full width of its container. Constrained it to `max-width: 180px`.
- `Enhancement`: Added a Score filter (9.0-10.0 / 7.0-8.9 / 4.0-6.9 / 0.0-3.9 / All) next to the Severity filter in the Table tab, combinable with the severity filter.

## v0.4.13 2026-08-11

- `Fix`: Duplicate "Vulnerabilities" tabs and inconsistent/broken widget rendering (grids showing 0 or wrong row counts, dashboard charts empty). Root cause: the build produced two identical copies of the bundle, `extension.js` and `extension-trivy.js`, both placed in `dist/resources/`. Argo CD's extension loader matches any file named `^extension(.*)\.js$` and executes every match, so both copies ran, each independently calling `registerResourceExtension` and initializing its own Emotion/chart-library instance — causing duplicate tab entries (no dedup in Argo CD's extension registry) and race conditions between the two independent copies of the same React component fetching/rendering data. The build now only produces a single `extension.js` file.

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
