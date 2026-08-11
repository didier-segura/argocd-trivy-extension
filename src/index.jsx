import React, { useState, useEffect } from "react";
import "./index.css";
import { Tab, Tabs } from "@mui/material";
import DataGrid from "./components/grid/vulnerability-report";
import Dashboard from "./components/dashboard/dashboard";
import { GridData } from './utils/data';

// Fetch VulnerabilityReport using ArgoCD resource-tree endpoint
const fetchVulnerabilityReport = async (
  appName,
  resourceName,
  resourceNamespace,
  resourceKind,
  containerName
) => {
  const baseURI = `${window.location.origin}/api/v1/applications/${appName}/resource-tree`;

  try {
    // Use resource-tree endpoint to get all related resources including VulnerabilityReports
    const url = `${baseURI}?group=&kind=${resourceKind}&name=${resourceName}&namespace=${resourceNamespace}`;

    console.log("Fetching resource tree from:", url);
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log("Resource tree response:", data);

      // Look for VulnerabilityReport nodes in the resource tree
      const vulnerabilityReports =
        data.nodes?.filter(
          (node) =>
            node.kind === "VulnerabilityReport" &&
            node.group === "aquasecurity.github.io" &&
            node.namespace === resourceNamespace
        ) || [];

      console.log("Found vulnerability reports:", vulnerabilityReports);

      if (vulnerabilityReports.length > 0) {
        // Try to find report matching the container
        const matchingReport = vulnerabilityReports.find((report) => {
          const containerLabel =
            report.labels?.["trivy-operator.container.name"];
          return containerLabel === containerName;
        });

        if (matchingReport) {
          console.log(
            "Found vulnerability report for container:",
            matchingReport.name
          );
          return matchingReport.name;
        }

        // If no exact container match, return first report
        console.log(
          "Found vulnerability report (container not matched):",
          vulnerabilityReports[0].name
        );
        return vulnerabilityReports[0].name;
      }

      console.log(
        "Available reports in tree:",
        (data.nodes || [])
          .filter((n) => n.kind === "VulnerabilityReport")
          .map((r) => ({
            name: r.name,
            container: r.labels?.["trivy-operator.container.name"],
          }))
      );
    } else {
      const errorText = await response.text();
      console.warn(
        "API response not ok:",
        response.status,
        response.statusText,
        errorText
      );
    }
  } catch (error) {
    console.error("Failed to fetch vulnerability reports:", error);
  }

  console.warn(
    `No vulnerability report found for ${resourceKind}/${resourceName}/${containerName}`
  );
  return null;
};

const Extension = (props) => {
  const { resource, application } = props;
  const appName = application?.metadata?.name || "";
  const resourceNamespace = resource?.metadata?.namespace || "";
  const isPod = resource?.kind === "Pod";
  const isCronJob = resource?.kind === "CronJob";

  // Get resource info (handle Pod case where we need to get from ownerReferences)
  const resourceName = isPod
    ? resource?.metadata?.ownerReferences[0]?.name?.toLowerCase()
    : resource?.metadata?.name?.toLowerCase();
  const resourceKind = isPod
    ? resource?.metadata?.ownerReferences[0]?.kind
    : resource?.kind;

  let containers = [];
  if (isPod) {
    containers = [
      ...(resource?.spec?.containers ?? []),
      ...(resource?.spec?.initContainers ?? []),
    ];
  } else if (isCronJob) {
    containers = [
      ...(resource?.spec?.jobTemplate?.spec?.template?.spec?.containers ?? []),
      ...(resource?.spec?.jobTemplate?.spec?.template?.spec?.initContainers ?? []),
    ];
  } else {
    containers = [
      ...(resource?.spec?.template?.spec?.containers ?? []),
      ...(resource?.spec?.template?.spec?.initContainers ?? []),
    ];
  }

  const containerNames = containers.map((c) => c.name);
  const images = containers.map((c) => c.image);

  function getContainerIcon(image, container) {
    // Always use Docker whale emoji in the container selector
    return '🐳';
  }

  function parseImageTag(image) {
    if (!image) return { name: '', tag: '' };
    // examples: 'nginx:1.21', 'ubuntu:20.04', 'busybox'
    const parts = image.split('/').pop().split(':');
    return { name: parts[0], tag: parts[1] || 'latest' };
  }

  function getBaseOSInfo(image) {
    // best-effort heuristics to detect base OS from image name/tag
    const { name, tag } = parseImageTag(image || '');
    const lname = name.toLowerCase();
    const tagLower = (tag || '').toLowerCase();

    // defaults
    let os = null;
    let version = tagLower === 'latest' ? '' : tagLower;
    let status = 'unknown';
    let note = '';
    let eolLink = null;

    // Helper to build endoflife.date links
    const eolUrl = (distro, ver) => `https://endoflife.date/${distro}/${encodeURIComponent(ver)}`;

    // Ubuntu
    if (lname.includes('ubuntu')) {
      os = 'Ubuntu';
      const major = parseInt((version || '').split('.')[0], 10) || null;
      if (major) {
        status = major >= 20 ? 'supported' : 'eol';
        eolLink = eolUrl('ubuntu', version || `${major}.04`);
      }
    }

    // Debian
    else if (lname.includes('debian')) {
      os = 'Debian';
      const major = parseInt((version || '').split('.')[0], 10) || null;
      if (major) {
        status = major >= 11 ? 'supported' : 'eol';
        eolLink = eolUrl('debian', String(major));
      }
    }

    // Alpine
    else if (lname.includes('alpine')) {
      os = 'Alpine';
      const m = parseFloat(version) || null;
      if (m) {
        status = m >= 3.14 ? 'supported' : 'eol';
        eolLink = eolUrl('alpine', String(m));
      }
    }

    // Alma/Rocky/CentOS
    else if (lname.includes('almalinux') || lname.includes('rockylinux')) {
      os = lname.includes('almalinux') ? 'AlmaLinux' : 'RockyLinux';
      status = 'supported';
      eolLink = eolUrl(lname.includes('almalinux') ? 'alma' : 'rocky', '');
    } else if (lname.includes('centos')) {
      os = 'CentOS';
      status = 'eol';
      note = 'CentOS Linux has upstream EOL for many stream releases; consider Alma/Rocky.';
      eolLink = eolUrl('centos', '');
    }

    // Common application images often tag with base distro tokens
    else if (lname.includes('nginx') || lname.includes('redis') || lname.includes('postgres') || lname.includes('mysql')) {
      if (tagLower.includes('alpine')) {
        os = 'Alpine';
        version = tagLower.replace('alpine', '').replace(/[^0-9.]/g, '') || version;
        const m = parseFloat(version) || null;
        if (m) status = m >= 3.14 ? 'supported' : 'eol';
        eolLink = eolUrl('alpine', String(m || ''));
      } else if (tagLower.includes('buster') || tagLower.includes('bullseye') || tagLower.includes('bookworm')) {
        const map = { buster: '10', bullseye: '11', bookworm: '12' };
        const key = Object.keys(map).find(k => tagLower.includes(k));
        os = 'Debian';
        version = map[key] || version;
        status = 'supported';
        eolLink = eolUrl('debian', version);
      } else if (tagLower.includes('focal') || tagLower.includes('jammy') || tagLower.includes('bionic')) {
        const map = { bionic: '18.04', focal: '20.04', jammy: '22.04' };
        const key = Object.keys(map).find(k => tagLower.includes(k));
        os = 'Ubuntu';
        version = map[key] || version;
        status = key === 'jammy' || key === 'focal' ? 'supported' : 'eol';
        eolLink = eolUrl('ubuntu', version);
      } else {
        os = null;
      }
    }

    return { os, version, status, note, eolLink };
  }

  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [currentContainer, setCurrentContainer] = useState(containerNames[0]);
  const [reportUrl, setReportUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [baseOSInfo, setBaseOSInfo] = useState(null);
  const [reportBaseOS, setReportBaseOS] = useState(null);

  const baseURI = `${window.location.origin}/api/v1/applications/${appName}/resource`;
  const fallbackConfig = React.useMemo(() => ({ appName, resourceNamespace, resourceKind, resourceName, containerName: currentContainer }), [appName, resourceNamespace, resourceKind, resourceName, currentContainer]);

  // Fetch report name when container changes
  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      const reportName = await fetchVulnerabilityReport(
        appName,
        resourceName,
        resourceNamespace,
        resourceKind,
        currentContainer
      );

      if (reportName) {
        setReportUrl(
          `${baseURI}?name=${reportName}&namespace=${resourceNamespace}&resourceName=${reportName}&version=v1alpha1&kind=VulnerabilityReport&group=aquasecurity.github.io`
        );
      } else {
        setReportUrl("");
      }
      setLoading(false);
    };

    if (appName && resourceName && resourceNamespace && currentContainer) {
      loadReport();
    }
  }, [
    appName,
    resourceName,
    resourceNamespace,
    resourceKind,
    currentContainer,
    baseURI,
  ]);

  // Fetch report-level base OS when reportUrl is available
  useEffect(() => {
    let cancelled = false;
    if (!reportUrl) { setReportBaseOS(null); return; }
    GridData(reportUrl, fallbackConfig).then(res => {
      if (cancelled) return;
      if (res && res.baseOs) setReportBaseOS({ os: res.baseOs, version: res.baseOsVersion || '', status: res.baseOsStatus || 'unknown', eolLink: res.baseOsEolLink || null, note: res.baseOsNote || '' });
      else setReportBaseOS(null);
    }).catch(() => { if (!cancelled) setReportBaseOS(null); });
    return () => { cancelled = true; };
  }, [reportUrl, fallbackConfig]);

  // update base OS info when selected container changes
  useEffect(() => {
    const idx = containerNames.indexOf(currentContainer);
    const image = images[idx] || '';
    const info = getBaseOSInfo(image);
    setBaseOSInfo(info);
  }, [currentContainer, images.join(',')]);

  const handleTabChange = (_e, tabIndex) => {
    setCurrentTabIndex(tabIndex);
  };

  const onOptionChangeHandler = (event) => {
    setCurrentContainer(event.target.value);
  };

  return (
    <div>
      <React.Fragment>
        <select
          className="vulnerability-report__container_top_select"
          value={currentContainer}
          onChange={onOptionChangeHandler}
        >
          {containerNames.map((container, index) => {
            return (
              <option key={container || index} value={container}>
                {`${getContainerIcon(images[index], container)}  ${container} (${images[index]})`}
              </option>
            );
          })}
        </select>
          {/* Prefer report-detected Base OS (from vulnerability report). Fall back to container heuristics. */}
          {reportBaseOS?.os ? (
            <div style={{ display: 'inline-block', marginLeft: 12 }}>
              <span className={`baseos-pill`} title={reportBaseOS.note || 'Detected from vulnerability report'}>
                {reportBaseOS.status === 'supported' ? '✅' : reportBaseOS.status === 'eol' ? '⚠️' : '❓'} 🐳 {reportBaseOS.os} {reportBaseOS.version || ''}
              </span>
              {reportBaseOS.eolLink && (
                <a href={reportBaseOS.eolLink} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>EOL info</a>
              )}
            </div>
          ) : baseOSInfo && baseOSInfo.os && (
            <div style={{ display: 'inline-block', marginLeft: 12 }}>
              <span className={`baseos-pill baseos-${baseOSInfo.status || 'unknown'}`} title={baseOSInfo.note || ''}>
                {baseOSInfo.status === 'supported' ? '✅' : baseOSInfo.status === 'eol' ? '⚠️' : '❓'} {baseOSInfo.os} {baseOSInfo.version || ''}
              </span>
            </div>
          )}
        <Tabs value={currentTabIndex} onChange={handleTabChange}>
          <Tab key="table" label="Table" />
          <Tab key="dashboard" label="Dashboard" />
        </Tabs>
        {loading ? (
          <div>Loading vulnerability report...</div>
        ) : reportUrl ? (
          <>
            {currentTabIndex === 0 && (
              <DataGrid key={reportUrl} reportUrl={reportUrl} fallbackConfig={fallbackConfig} />
            )}
            {currentTabIndex === 1 && <Dashboard reportUrl={reportUrl} fallbackConfig={fallbackConfig} />}
          </>
        ) : (
          <div>No vulnerability report found for this container.</div>
        )}
      </React.Fragment>
    </div>
  );
};

const component = Extension;

((window) => {
  window?.extensionsAPI?.registerResourceExtension(
    component,
    "*",
    "ReplicaSet",
    "Vulnerabilities",
    { icon: "fa fa-triangle-exclamation" }
  );
  window?.extensionsAPI?.registerResourceExtension(
    component,
    "*",
    "Pod",
    "Vulnerabilities",
    { icon: "fa fa-triangle-exclamation" }
  );
  window?.extensionsAPI?.registerResourceExtension(
    component,
    "*",
    "StatefulSet",
    "Vulnerabilities",
    { icon: "fa fa-triangle-exclamation" }
  );
  window?.extensionsAPI?.registerResourceExtension(
    component,
    "*",
    "CronJob",
    "Vulnerabilities",
    { icon: "fa fa-triangle-exclamation" }
  );
  window?.extensionsAPI?.registerResourceExtension(
    component,
    "*",
    "Job",
    "Vulnerabilities",
    { icon: "fa fa-triangle-exclamation" }
  );
  
  // Backward compatibility for ArgoCD
  window.tmp = window.tmp || {};
  window.tmp.extensions = component;
})(window);
