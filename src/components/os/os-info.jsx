import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getBaseOSInfo } from '../../utils/data';
import './os-info.scss';

const STATUS_META = {
  supported: { icon: '✅', label: 'Supported' },
  eol: { icon: '⚠️', label: 'End of life' },
  unknown: { icon: '❓', label: 'Unknown' },
};

function StatusPill({ status, note }) {
  const meta = STATUS_META[status] || STATUS_META.unknown;
  return (
    <span className={`baseos-pill baseos-${status || 'unknown'}`} title={note || ''}>
      {meta.icon} {meta.label}
    </span>
  );
}

/**
 * Dedicated "OS" tab: shows the detected base OS for every container/init-container
 * in the resource (not just the currently-selected one), preferring the accurate
 * report-based detection (Trivy Operator's `report.os.{family,name}`) and falling
 * back to an image-tag heuristic while the report loads or if none is available.
 */
const OSInfo = ({ containers, currentContainer, fetchContainerOS }) => {
  // entry shape: { image, heuristic, report, loading, error }
  const [entries, setEntries] = useState({});

  const containerKey = useMemo(() => (containers || []).map(c => `${c.name}=${c.image}`).join('|'), [containers]);

  // Seed heuristic (synchronous, no network) results immediately, then kick off
  // the async report-based lookup for each container.
  useEffect(() => {
    let cancelled = false;

    setEntries(() => {
      const seeded = {};
      (containers || []).forEach(({ name, image }) => {
        seeded[name] = { image, heuristic: getBaseOSInfo(image), report: null, loading: true, error: false };
      });
      return seeded;
    });

    (containers || []).forEach(({ name }) => {
      if (typeof fetchContainerOS !== 'function') return;
      fetchContainerOS(name)
        .then((report) => {
          if (cancelled) return;
          setEntries((prev) => ({ ...prev, [name]: { ...prev[name], report, loading: false } }));
        })
        .catch(() => {
          if (cancelled) return;
          setEntries((prev) => ({ ...prev, [name]: { ...prev[name], loading: false, error: true } }));
        });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerKey, fetchContainerOS]);

  const refreshContainer = useCallback((name) => {
    if (typeof fetchContainerOS !== 'function') return;
    setEntries((prev) => ({ ...prev, [name]: { ...prev[name], loading: true, error: false } }));
    fetchContainerOS(name)
      .then((report) => setEntries((prev) => ({ ...prev, [name]: { ...prev[name], report, loading: false } })))
      .catch(() => setEntries((prev) => ({ ...prev, [name]: { ...prev[name], loading: false, error: true } })));
  }, [fetchContainerOS]);

  const rows = (containers || []).map(({ name, image }) => {
    const entry = entries[name] || { image, heuristic: getBaseOSInfo(image), report: null, loading: true, error: false };
    // Prefer report-detected OS (accurate, from the actual scanned image), fall back to heuristic.
    const detected = entry.report?.os ? entry.report : (entry.heuristic?.os ? entry.heuristic : null);
    const source = entry.report?.os ? 'report' : (entry.heuristic?.os ? 'heuristic' : null);
    return { name, image, entry, detected, source };
  });

  const summary = rows.reduce((acc, r) => {
    const status = r.detected?.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { supported: 0, eol: 0, unknown: 0 });

  // Sort so EOL/unsupported containers surface first, then unknown, then supported.
  const statusRank = { eol: 0, unknown: 1, supported: 2 };
  const sortedRows = [...rows].sort((a, b) => {
    const ra = statusRank[a.detected?.status || 'unknown'];
    const rb = statusRank[b.detected?.status || 'unknown'];
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="os-info">
      <div className="os-info__summary">
        <div className="os-info__summary-card os-info__summary-card--eol">
          <span className="os-info__summary-count">{summary.eol}</span>
          <span className="os-info__summary-label">End of life</span>
        </div>
        <div className="os-info__summary-card os-info__summary-card--unknown">
          <span className="os-info__summary-count">{summary.unknown}</span>
          <span className="os-info__summary-label">Unknown</span>
        </div>
        <div className="os-info__summary-card os-info__summary-card--supported">
          <span className="os-info__summary-count">{summary.supported}</span>
          <span className="os-info__summary-label">Supported</span>
        </div>
      </div>

      <table className="os-info__table">
        <thead>
          <tr>
            <th>Container</th>
            <th>Image</th>
            <th>Base OS</th>
            <th>Version</th>
            <th>Status</th>
            <th>Source</th>
            <th>EOL info</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(({ name, image, entry, detected, source }) => (
            <tr key={name} className={name === currentContainer ? 'os-info__row--current' : ''}>
              <td>
                🐳 {name}
                {name === currentContainer && <span className="os-info__current-badge">selected</span>}
              </td>
              <td className="os-info__image" title={image}>{image}</td>
              <td>{detected?.os || (entry.loading ? '…' : '—')}</td>
              <td>{detected?.version || '—'}</td>
              <td>
                {entry.loading ? (
                  <span className="os-info__loading">Checking…</span>
                ) : (
                  <StatusPill status={detected?.status || 'unknown'} note={detected?.note} />
                )}
              </td>
              <td className="os-info__source">{source === 'report' ? 'Scan report' : source === 'heuristic' ? 'Image tag guess' : '—'}</td>
              <td>
                {detected?.eolLink ? (
                  <a href={detected.eolLink} target="_blank" rel="noopener noreferrer">endoflife.date</a>
                ) : '—'}
              </td>
              <td>
                <button
                  type="button"
                  className="os-info__refresh"
                  title="Re-check this container"
                  onClick={() => refreshContainer(name)}
                  disabled={entry.loading}
                >
                  ↻
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sortedRows.some(r => r.detected?.note) && (
        <ul className="os-info__notes">
          {sortedRows.filter(r => r.detected?.note).map(r => (
            <li key={r.name}><strong>{r.name}:</strong> {r.detected.note}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OSInfo;
