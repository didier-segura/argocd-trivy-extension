import React, { useState, useEffect } from "react";
import "./index.css";
import { Tab, Tabs } from "@mui/material";
import DataGrid from "./components/grid/vulnerability-report";
import Dashboard from "./components/dashboard/dashboard";

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
      ...resource?.spec?.containers,
      ...(resource.spec?.initContainers ?? []),
    ];
  } else if (isCronJob) {
    containers = [
      ...resource?.spec?.jobTemplate?.spec?.template?.spec.containers,
      ...(resource?.spec?.jobTemplate?.spec?.template?.spec.initContainers ??
        []),
    ];
  } else {
    containers = [
      ...resource?.spec?.template?.spec?.containers,
      ...(resource?.spec?.template?.spec?.initContainers ?? []),
    ];
  }

  const containerNames = containers.map((c) => c.name);
  const images = containers.map((c) => c.image);

  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [currentContainer, setCurrentContainer] = useState(containerNames[0]);
  const [reportUrl, setReportUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const baseURI = `${window.location.origin}/api/v1/applications/${appName}/resource`;
  const fallbackConfig = { appName, resourceNamespace, resourceKind, resourceName, containerName: currentContainer };

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
          className="vulnerability-report__container_dropdown"
          value={currentContainer}
          onChange={onOptionChangeHandler}
        >
          {containerNames.map((container, index) => {
            return (
              <option key={index} value={container}>
                {`${container} (${images[index]})`}
              </option>
            );
          })}
        </select>
        <Tabs value={currentTabIndex} onChange={handleTabChange}>
          <Tab label="Table" />
          <Tab label="Dashboard" />
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

export default component;
