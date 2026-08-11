import axios from 'axios';

var vulnerabilityData = {}

// infer OS and version from an image string (shared helper)
function detectOSAndVersion(image) {
  if (!image) return { os: '', version: '' };
  const img = String(image).toLowerCase();
  const map = [
    ['alpine', 'Alpine'], ['ubuntu', 'Ubuntu'], ['debian', 'Debian'], ['centos', 'CentOS'], ['rhel', 'RHEL'], ['redhat', 'RHEL'],
    ['amazonlinux', 'Amazon Linux'], ['busybox', 'BusyBox'], ['scratch', 'Scratch'], ['opensuse', 'openSUSE']
  ];
  for (const [k, label] of map) {
    if (img.indexOf(k) !== -1) {
      // try to extract a numeric version from the tag or repository
      const tagPart = (String(image).split(':')[1] || '').toLowerCase();
      const m = tagPart.match(/(\d+(?:\.\d+)+)/);
      const version = m ? m[1] : '';
      return { os: label, version };
    }
  }
  // also handle tags like '1.2.3-alpine' or '6.0-alpine'
  const tag = (String(image).split(':')[1] || '').toLowerCase();
  if (tag && tag.indexOf('alpine') !== -1) {
    const m = tag.match(/(\d+(?:\.\d+)+)/);
    return { os: 'Alpine', version: m ? m[1] : '' };
  }
  if (tag && (tag.indexOf('buster') !== -1 || tag.indexOf('bullseye') !== -1 || tag.indexOf('bookworm') !== -1)) {
    const mapTag = { buster: '10', bullseye: '11', bookworm: '12' };
    const k = Object.keys(mapTag).find(k => tag.indexOf(k) !== -1);
    return { os: 'Debian', version: k ? mapTag[k] : '' };
  }
  if (tag && (tag.indexOf('focal') !== -1 || tag.indexOf('jammy') !== -1 || tag.indexOf('bionic') !== -1)) {
    const mapTag = { bionic: '18.04', focal: '20.04', jammy: '22.04' };
    const k = Object.keys(mapTag).find(k => tag.indexOf(k) !== -1);
    return { os: 'Ubuntu', version: k ? mapTag[k] : '' };
  }
  return { os: '', version: '' };
}

function computeEOLInfo(os, version) {
  if (!os) return { status: 'unknown', eolLink: null, note: '' };
  const mapDistro = (d) => {
    if (!d) return d;
    const dl = d.toLowerCase();
    if (dl.includes('alpine')) return 'alpine-linux';
    if (dl.includes('ubuntu')) return 'ubuntu';
    if (dl.includes('debian')) return 'debian';
    if (dl.includes('centos')) return 'centos';
    if (dl.includes('rhel') || dl.includes('redhat')) return 'rhel';
    return dl.replace(/\s+/g, '-');
  };
  const lname = (os || '').toLowerCase();
  let status = 'unknown';
  let eolLink = null;
  let note = '';

    if (lname.includes('ubuntu')) {
    status = 'unknown';
    if (version) {
      const major = parseInt(String(version).split('.')[0], 10) || null;
      if (major) status = major >= 20 ? 'supported' : 'eol';
        eolLink = `https://endoflife.date/${mapDistro('ubuntu')}`;
    }
  } else if (lname.includes('debian')) {
    status = 'unknown';
    if (version) {
      const major = parseInt(String(version).split('.')[0], 10) || null;
      if (major) status = major >= 11 ? 'supported' : 'eol';
        eolLink = `https://endoflife.date/${mapDistro('debian')}`;
    }
  } else if (lname.includes('alpine')) {
    status = 'unknown';
    if (version) {
      const v = parseFloat(version) || null;
      if (v) status = v >= 3.14 ? 'supported' : 'eol';
        eolLink = `https://endoflife.date/${mapDistro('alpine')}`;
    }
  } else if (lname.includes('centos') || lname.includes('rhel') || lname.includes('redhat')) {
    status = 'eol';
    eolLink = `https://endoflife.date/${mapDistro('centos')}`;
    note = 'Consider AlmaLinux/Rocky as CentOS Linux has many EOL releases.';
  }

  return { status, eolLink, note };
}

async function GetVulnerabilityData(reportUrl, fallbackConfig) {
  try {
    let response;
    if (reportUrl) response = await fetchReportByUrl(reportUrl);

    if ((!response || !response.data || !response.data.manifest) && fallbackConfig) {
      response = await findReportByLabels(fallbackConfig);
    }

    if (!response || !response.data) {
      return { status: 'error', vulnerabilities: [] };
    }

    // manifest may already be an object or a JSON string
    let manifest = response.data.manifest;
    if (typeof manifest === 'string') {
      try {
        manifest = JSON.parse(manifest);
      } catch (err) {
        // fallback: try parsing as JSON with single quotes replaced (defensive)
        try { manifest = JSON.parse(manifest.replace(/'/g, '"')); } catch (e) { manifest = undefined; }
      }
    }

    // tolerate different shapes: top-level vulnerabilities or report.vulnerabilities
    let vulnerabilities = [];
    if (manifest) {
      if (Array.isArray(manifest.report?.vulnerabilities)) vulnerabilities = manifest.report.vulnerabilities;
      else if (Array.isArray(manifest.vulnerabilities)) vulnerabilities = manifest.vulnerabilities;
      else if (Array.isArray(manifest)) vulnerabilities = manifest;
    }

    if (!Array.isArray(vulnerabilities)) vulnerabilities = [];

    // Attempt to discover a single Base OS for the image/report. Prefer explicit fields, then labels, then infer from images.
    let baseOs = '';
    if (manifest?.baseOS) baseOs = manifest.baseOS;
    if (!baseOs && manifest?.image?.os) baseOs = manifest.image.os;
    if (!baseOs && manifest?.baseImage) baseOs = manifest.baseImage;
    if (!baseOs && manifest?.metadata?.labels) {
      const labels = manifest.metadata.labels;
      baseOs = labels['baseOS'] || labels['base_os'] || labels['io.k8s.description'] || labels['org.opencontainers.image.os'] || '';
    }

    let baseOsVersion = '';
    if (!baseOs && vulnerabilities.length > 0) {
      // infer from the most common image string among vulnerabilities and collect versions
      const counts = {};
      const versions = {};
      vulnerabilities.forEach(v => {
        const iv = detectOSAndVersion(v.image || v.imageName || v.img || '');
        const os = iv.os;
        const ver = iv.version || '';
        if (os) {
          counts[os] = (counts[os] || 0) + 1;
          versions[os] = versions[os] || {};
          if (ver) versions[os][ver] = (versions[os][ver] || 0) + 1;
        }
      });
      const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
      if (sorted.length > 0) {
        baseOs = sorted[0][0];
        const verMap = versions[baseOs] || {};
        const verSorted = Object.entries(verMap).sort((a,b) => b[1] - a[1]);
        if (verSorted.length > 0) baseOsVersion = verSorted[0][0];
      }
    }

    const eolInfo = computeEOLInfo(baseOs, baseOsVersion);
    return { status: vulnerabilities.length > 0 ? 'ok' : 'clean', vulnerabilities, baseOs, baseOsVersion, baseOsStatus: eolInfo.status, baseOsEolLink: eolInfo.eolLink, baseOsNote: eolInfo.note };
  } catch (error) {
    return { status: 'error', vulnerabilities: [] };
  }
}

/**
 * Fetch VulnerabilityReport by exact name (fails when Trivy uses hash for names > 63 chars).
 */
async function fetchReportByUrl(reportUrl) {
  if (!reportUrl) return undefined;
  try {
    const response = await axios.get(reportUrl, { timeout: 7000 });
    return response;
  } catch (err) {
    return undefined;
  }
}

/**
 * Find VulnerabilityReport when direct fetch fails (e.g. Trivy uses hash-based names when full name > 63 chars).
 * Uses Argo CD resource-tree to discover all VulnerabilityReports in namespace, fetches each and matches by labels.
 * Note: Hash computation is not replicated (Trivy uses Go spew + k8s SafeEncodeString) - resource-tree is the fallback.
 */
async function findReportByLabels(fallbackConfig) {
  if (!fallbackConfig?.appName) return undefined;

  const { appName, resourceNamespace, resourceName, containerName } = fallbackConfig;
  const treeUrl = `${window.location.origin}/api/v1/applications/${appName}/resource-tree`;
  const resourceUrl = `${window.location.origin}/api/v1/applications/${appName}/resource`;

  const treeResponse = await axios.get(treeUrl).catch(() => undefined);
  if (!treeResponse?.data?.nodes) return undefined;

  // Get all VulnerabilityReports in namespace (parentRefs may be missing for operator-created resources)
  const reportNodes = treeResponse.data.nodes.filter(
    (n) =>
      (n.kind === 'VulnerabilityReport' || n.kind === 'vulnerabilityreport') &&
      (n.group === 'aquasecurity.github.io' || !n.group) &&
      n.namespace === resourceNamespace
  );

  for (const node of reportNodes) {
    const reportName = node.name;
    const fetchUrl = `${resourceUrl}?name=${encodeURIComponent(reportName)}&namespace=${encodeURIComponent(resourceNamespace)}&resourceName=${encodeURIComponent(reportName)}&version=v1alpha1&kind=VulnerabilityReport&group=aquasecurity.github.io`;
    const response = await axios.get(fetchUrl).catch(() => undefined);
    if (!response?.data) continue;

    // parse manifest defensively
    let manifest = response.data.manifest;
    if (typeof manifest === 'string') {
      try { manifest = JSON.parse(manifest); } catch (e) { manifest = undefined; }
    }
    const labels = manifest?.metadata?.labels || {};
    const reportContainer = labels['trivy-operator.container.name'] || labels['trivy-operator.container.name'.toLowerCase()];

    if (!containerName || reportContainer === containerName) {
      return response;
    }
  }
  return undefined;
}



export async function GridData(reportUrl, fallbackConfig) {
  const { status, vulnerabilities, baseOs, baseOsVersion, baseOsStatus, baseOsEolLink, baseOsNote } = await GetVulnerabilityData(reportUrl, fallbackConfig);
  // Default sort by score (descending). If scores tie, fall back to severity order.
  const severityOrder = { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4 };
  const sortedVulns = [...vulnerabilities].sort((a, b) => {
    const parseScore = (v) => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    const scoreA = parseScore(a.score);
    const scoreB = parseScore(b.score);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const orderA = severityOrder[a.severity?.toUpperCase()] ?? 5;
    const orderB = severityOrder[b.severity?.toUpperCase()] ?? 5;
    return orderA - orderB;
  });

  // Columns: resource, score, severity, discovered, fixedVersion, installedVersion, primaryLink, publishedDate(for age)
  const rows = sortedVulns.map(v => [
    v.resource || '',
    v.score,
    v.severity,
    v.publishedDate || '', // discovered
    v.fixedVersion || '',
    v.installedVersion || '',
    v.primaryLink || '',
    v.publishedDate || '' // used by age formatter
  ]);
  return { status, rows, baseOs, baseOsVersion, baseOsStatus, baseOsEolLink, baseOsNote };
}

export async function DashboardData(reportUrl, fallbackConfig) {
  const { status, vulnerabilities } = await GetVulnerabilityData(reportUrl, fallbackConfig);
  vulnerabilityData = vulnerabilities;

  if (status !== 'ok') {
    return { status };
  }

  return {
    status: 'ok',
    severityData: severityCountData(),
    patchSummaryData: patchSummaryData(),
    topVulnerableResourcesData: topVulnerableResourcesData(15),
    vulnerabilityAgeDistribution: vulnerabilityAgeDistribution(),
    severityTimeSeries: severityTimeSeries(),
        timelineSeries: movingAverageSeries(3),
    resourceTimeSeries: resourceTimeSeries(12),
    topPackages: topPackagesData(15),
    severitySummary: severitySummary(),
    vulnerabilities: vulnerabilityData,
    vulnerabilitiesByType: vulnerabilitiesByType(),
  };
}

function movingAverageSeries(windowSize = 3) {
  // build base yearly totals (same years as severityTimeSeries)
  const base = severityTimeSeries();
  if (!base || base.length === 0) return [];
  const totals = base.map(b => b.total || 0);
  const ma = [];
  for (let i = 0; i < totals.length; i++) {
    const start = Math.max(0, i - (windowSize - 1));
    const slice = totals.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    ma.push({ year: base[i].year, total: totals[i], movingAvg: Math.round(avg * 100) / 100 });
  }
  return ma;
}

function severityCountData() {
  const data = [];
  [
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
    "UNKNOWN"
  ].forEach(severity => {
    data.push({
      name: severity,
      count: vulnerabilityData.filter(d => d.severity === severity).length,
    })
  });
  return data;
}

function patchSummaryData() {
  const count = (severity, fixed = true) => {
    return vulnerabilityData.filter(v => (fixed ? v.fixedVersion !== "" : v.fixedVersion === "")
      && v.severity === severity).length
  }

  const data = []
  const severities = [
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
    "UNKNOWN"
  ]

  severities.forEach(severity => {
    data.push({
      severity: severity,
      fixed: count(severity),
      unfixed: count(severity, false)
    })
  })
  return data;
}

function topVulnerableResourcesData(size) {
  const data = []
  const resources = new Set()
  vulnerabilityData.forEach(v => { resources.add(v.resource) })

  const count = (resource, severity) => {
    return vulnerabilityData.filter(v => v.resource === resource && v.severity === severity).length
  }

  resources.forEach(resource => {
    data.push({
      name: resource,
      total: vulnerabilityData.filter(v => v.resource === resource).length,
      critical: count(resource, 'CRITICAL'),
      high: count(resource, 'HIGH'),
      medium: count(resource, 'MEDIUM'),
      low: count(resource, 'LOW')
    })
  })

  data.sort((a, b) => {
    return b.total - a.total
  })
  return data.slice(0, size)
}

function vulnerabilityAgeDistribution() {
  const data = []

  const count = (severity, year) => {
    return vulnerabilityData.filter(v => {
      return v.severity === severity && new Date(v.publishedDate).getFullYear() === year
    }).length
  }

  let year = new Date().getFullYear() - 7
  while (year <= new Date().getFullYear()) {
    data.push({
      year: year,
      critical: count("CRITICAL", year),
      high: count("HIGH", year),
      medium: count("MEDIUM", year),
      low: count("LOW", year),
    })

    year++
  }
  return data
}

function severityTimeSeries() {
  const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  const years = [];
  const startYear = new Date().getFullYear() - 7;
  const endYear = new Date().getFullYear();
  for (let y = startYear; y <= endYear; y++) years.push(y);

  return years.map(year => {
    const entry = { year };
    severities.forEach(s => {
      entry[s.toLowerCase()] = vulnerabilityData.filter(v => {
        const y = safeYear(v.publishedDate);
        return v.severity === s && y === year;
      }).length;
    });
    entry.total = severities.reduce((acc, s) => acc + entry[s.toLowerCase()], 0);
    return entry;
  });
}

function resourceTimeSeries(points = 12) {
  // Build per-resource series across recent years (same window as vulnerabilityAgeDistribution)
  const resources = Array.from(new Set(vulnerabilityData.map(v => v.resource)));
  const startYear = new Date().getFullYear() - 7;
  const endYear = new Date().getFullYear();
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  const data = resources.map(r => {
    const series = years.map(year => ({ year, count: vulnerabilityData.filter(v => v.resource === r && safeYear(v.publishedDate) === year).length }));
    return { name: r, series };
  });

  // return only top N resources by total count (points param used as limit here)
  data.sort((a, b) => b.series.reduce((s, p) => s + p.count, 0) - a.series.reduce((s, p) => s + p.count, 0));
  return data.slice(0, points);
}

function topPackagesData(size) {
  const map = new Map();
  vulnerabilityData.forEach(v => {
    const pkg = v.packageName || v.pkgName || v.package || v.title || 'unknown';
    const key = typeof pkg === 'string' ? pkg : JSON.stringify(pkg);
    map.set(key, (map.get(key) || 0) + 1);
  });
  const arr = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, size);
}

function severitySummary() {
  const total = vulnerabilityData.length;
  const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  return severities.map(s => {
    const count = vulnerabilityData.filter(v => v.severity === s).length;
    return { severity: s, count, percent: total === 0 ? 0 : Math.round((count / total) * 10000) / 100 };
  });
}

function safeYear(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return d.getFullYear();
}

function vulnerabilitiesByType() {
  const vulnTypes = [
    "Overflow",
    "Memory corruption",
    "SQL injection",
    "XSS",
    "Directory traversal",
    "File inclusion",
    "CSRF",
    "XXE",
    "SSRF",
    "Open redirect",
    "Input validation",
    "DoS"
  ]

  const data = [];
  vulnTypes.forEach(vulnType => {

    data.push({
      name: vulnType,
      count: vulnerabilityData.filter(v => v.title.toLowerCase().includes(vulnType.toLowerCase())).length
    })
  })
  return data
}