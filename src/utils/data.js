import axios from 'axios';

var vulnerabilityData = {}

async function GetVulnerabilityData(reportUrl, fallbackConfig) {
  try {
    let response = await fetchReportByUrl(reportUrl);

    if (response === undefined && fallbackConfig) {
      response = await findReportByLabels(fallbackConfig);
    }

    if (response === undefined) {
      return { status: 'error', vulnerabilities: [] };
    }

    const manifest = JSON.parse(response?.data?.manifest);
    const vulnerabilities = manifest?.report?.vulnerabilities ?? [];
    return {
      status: vulnerabilities.length > 0 ? 'ok' : 'clean',
      vulnerabilities,
    };
  } catch (error) {
    return { status: 'error', vulnerabilities: [] };
  }
}

/**
 * Fetch VulnerabilityReport by exact name (fails when Trivy uses hash for names > 63 chars).
 */
async function fetchReportByUrl(reportUrl) {
  const response = await axios.get(reportUrl)
    .catch(function () {
      return undefined;
    });
  return response;
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
    if (!response?.data?.manifest) continue;

    const manifest = JSON.parse(response.data.manifest);
    const labels = manifest?.metadata?.labels || {};
    const reportContainer = labels['trivy-operator.container.name'];

    if (!containerName || reportContainer === containerName) {
      return response;
    }
  }
  return undefined;
}



export async function GridData(reportUrl, fallbackConfig) {
  const { status, vulnerabilities } = await GetVulnerabilityData(reportUrl, fallbackConfig);
  const rows = vulnerabilities.map(v => [
    v.resource,
    v.score,
    v.severity,
    v.fixedVersion,
    v.installedVersion,
    v.primaryLink,
    v.publishedDate,
    v.lastModifiedDate,
    v.title,
  ]);
  return { status, rows };
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
    vulnerabilitiesByType: vulnerabilitiesByType(),
  };
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
  return data.slice(0, size - 1)
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