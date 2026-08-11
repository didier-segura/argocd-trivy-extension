import React, { Component } from 'react';
import { Area, AreaChart, RadarChart, PolarGrid, Radar, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Line } from 'recharts';
import { DashboardData } from '../../utils/data';
import "./dashboard.scss";
import "../grid/vulnerability-report.scss";

// Catches render-time errors from an individual chart so one broken chart
// doesn't silently render blank (or take down the whole dashboard) — shows
// the underlying error message instead so it's visible without devtools.
class ChartErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error(`[Dashboard] "${this.props.label}" chart failed to render:`, error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 12, color: '#8a1f1f', background: '#fdecec', borderRadius: 6, fontSize: 12 }}>
                    Failed to render "{this.props.label}": {this.state.error.message}
                </div>
            );
        }
        return this.props.children;
    }
}

// Shown instead of an empty chart when the underlying data array has no entries,
// so "no data" is visually distinguishable from a rendering bug.
function EmptyChartPlaceholder({ height = 120 }) {
    return (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
            No data available for this container.
        </div>
    );
}

// Recharts' <ResponsiveContainer width="100%"> can measure a 0 width on first
// mount inside this dashboard's CSS Grid layout and never recover, leaving the
// chart permanently blank even though the underlying data is present. This
// wrapper measures its own DOM node directly via ResizeObserver and hands the
// resolved pixel width to the child render-prop, bypassing ResponsiveContainer's
// internal measurement entirely.
class MeasuredChartContainer extends Component {
    state = { width: 0 };
    containerRef = React.createRef();

    componentDidMount() {
        this.measure();
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.measure());
            if (this.containerRef.current) {
                this.resizeObserver.observe(this.containerRef.current);
            }
        } else {
            window.addEventListener('resize', this.measure);
        }
    }

    componentWillUnmount() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        } else {
            window.removeEventListener('resize', this.measure);
        }
    }

    measure = () => {
        const node = this.containerRef.current;
        if (node) {
            const width = node.clientWidth;
            if (width && width !== this.state.width) {
                this.setState({ width });
            }
        }
    }

    render() {
        const { height, children } = this.props;
        const { width } = this.state;
        return (
            <div ref={this.containerRef} style={{ width: '100%', height }}>
                {width > 0 ? children(width) : null}
            </div>
        );
    }
}

class Dashboard extends Component {
    state = {
        selectedResource: null,
        hoveredResource: null,
    }
    componentDidMount() {
        this.fetchData();
    }

    componentDidUpdate(prevProp) {
        const prevFallback = JSON.stringify(prevProp.fallbackConfig || {});
        const nextFallback = JSON.stringify(this.props.fallbackConfig || {});
        if (prevProp.reportUrl !== this.props.reportUrl || prevFallback !== nextFallback) {
            this.fetchData();
        }
    }

    fetchData = async () => {
        const res = await DashboardData(this.props.reportUrl, this.props.fallbackConfig).then(data => {
            return data;
        });
        this.setState(res);
    }

    // small custom tooltip to show year + counts
    CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload) return null;
        return (
            <div className="recharts-tooltip-custom" style={{ background: 'white', padding: 8, borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                {payload.map((p, i) => (
                    <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between' }}>
                        <div>{p.name}</div>
                        <div style={{ fontWeight: 700 }}>{p.value}</div>
                    </div>
                ))}
            </div>
        );
    }

    onBarClick = (data, index) => {
        // data.payload contains the resource's data (name, total, critical, ...)
        const payload = data && data.payload ? data.payload : null;
        if (payload && payload.name) {
            this.setState({ selectedResource: payload.name });
        }
    }

    buildResourceTimeSeries(resourceName) {
        const { vulnerabilities } = this.state;
        const now = new Date();
        const startYear = now.getFullYear() - 7;
        const years = [];
        for (let y = startYear; y <= now.getFullYear(); y++) years.push(y);

        const series = years.map(year => {
            const count = (vulnerabilities || []).filter(v => {
                const rv = (v.resource || '').toString();
                if (rv !== resourceName) return false;
                const pd = v.publishedDate || v.published || v.date;
                if (!pd) return false;
                const py = new Date(pd).getFullYear();
                return py === year;
            }).length;
            return { year, count };
        });
        return series;
    }

    render() {
        const { severityData, patchSummaryData, topVulnerableResourcesData, vulnerabilitiesByType, vulnerabilityAgeDistribution, severityTimeSeries, timelineSeries, resourceTimeSeries, topPackages, severitySummary, status } = this.state;

        if (status === 'clean') {
            return (
                <div className="vulnerability-report__banner vulnerability-report__banner_success">
                    <span className="secure-flag" aria-hidden="true">✓ Secure</span>
                    <span style={{ marginLeft: 8 }}>No vulnerabilities found for this image.</span>
                </div>
            )
        }

        if (status === 'error') {
            return (
                <div className="vulnerability-report__banner vulnerability-report__banner_error">
                    No vulnerability report available for this container.
                </div>
            )
        }

        if (status !== 'ok') {
            return <div style={{ 'margin': '15px' }} />
        }

        // Temporary diagnostics: helps confirm whether "blank" charts stem from
        // empty arrays vs. a render error vs. a CSS sizing issue.
        console.log('[Dashboard] chart data lengths:', {
            topPackages: (topPackages || []).length,
            vulnerabilitiesByType: (vulnerabilitiesByType || []).length,
            patchSummaryData: (patchSummaryData || []).length,
            topVulnerableResourcesData: (topVulnerableResourcesData || []).length,
            severityTimeSeries: (severityTimeSeries || []).length,
            timelineSeries: (timelineSeries || []).length,
            vulnerabilityAgeDistribution: (vulnerabilityAgeDistribution || []).length,
        });

        const severityHexColors = [
            '#D22B2B', // Critical
            '#FF7E62', // High
            '#F1D86F', // Medium
            '#00C49F', // Low
            '#0088FE'  // Unknown
        ];

        const hexColors = [
            '#00A2B3', // ArgoCD main teal
            '#EE964B',
            '#299D8F',
            '#457B9D',
            '#1F8090',
            '#E8C469',
            '#299D8F',
            '#F4A261',
            '#2168A6',
            '#F16889',
            '#00C49F',
            '#1F5F8B'
        ];

        // compute radar axis max based on patchSummaryData so the chart scales to data
        const radarMax = (patchSummaryData && patchSummaryData.length) ? Math.max(1, Math.ceil(Math.max(...patchSummaryData.map(p => Math.max(p.fixed || 0, p.unfixed || 0))) * 1.25)) : 5;

        return (
            <div>
                <div className="vulnerability-charts__wrapper">
                    

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Severity Summary</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 8 }}>
                            <div style={{ width: 220, height: 180 }}>
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie
                                            data={(severitySummary && severitySummary.length) ? severitySummary.map(s => ({ name: s.severity, count: s.count })) : (severityData || [])}
                                            dataKey="count"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={80}
                                            paddingAngle={2}
                                        >
                                            {(severitySummary && severitySummary.length ? severitySummary : severityData || []).map((entry, index) => (
                                                <Cell key={`sevcell-${index}`} fill={severityHexColors[index % severityHexColors.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ flex: 1 }}>
                                {(() => {
                                    const list = (severitySummary && severitySummary.length) ? severitySummary : (severityData || []).map(d => ({ severity: d.name, count: d.count }));
                                    const total = list.reduce((s, p) => s + (p.count || 0), 0);
                                    const criticalCount = (list.find(x => x.severity === 'CRITICAL') || { count: 0 }).count || 0;
                                    const pctCrit = total ? Math.round((criticalCount / total) * 100) : 0;
                                    return (
                                        <div>
                                            <div style={{ fontSize: 28, fontWeight: 700 }}>{total}</div>
                                            <div style={{ color: '#64748b', marginTop: 6 }}>Total vulnerabilities</div>
                                            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ background: '#D22B2B', width: 12, height: 12, borderRadius: 3 }} />
                                                <div style={{ fontWeight: 700 }}>{criticalCount} CRITICAL</div>
                                                <div style={{ color: '#64748b' }}>({pctCrit}%)</div>
                                            </div>
                                            <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                                {list.map((s, i) => (
                                                    <div key={`sev-sm-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fbfeff', borderRadius: 6 }}>
                                                        <div style={{ width: 10, height: 10, background: severityHexColors[i % severityHexColors.length], borderRadius: 3 }} />
                                                        <div style={{ fontSize: 13 }}>{s.severity}</div>
                                                        <div style={{ marginLeft: 6, color: '#64748b' }}>{s.count}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Top Packages by Vulnerabilities</span>
                        <ChartErrorBoundary label="Top Packages by Vulnerabilities">
                            {(topPackages || []).length === 0 ? <EmptyChartPlaceholder height={300} /> : (
                                <MeasuredChartContainer height={300}>
                                    {(width) => {
                                        const pkgList = (topPackages || []).slice().sort((a,b) => (b.count||0) - (a.count||0));
                                        const truncate = (s, n=30) => typeof s === 'string' && s.length > n ? s.slice(0,n-1) + '…' : s;
                                        return (
                                            <BarChart width={width} height={300} layout="vertical" data={pkgList} margin={{ top: 10, right: 20, left: 60, bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis type="number" />
                                                <YAxis type="category" dataKey="name" width={200} tickFormatter={(t) => truncate(t, 40)} />
                                                <Tooltip formatter={(value) => [value, 'vulnerabilities']} labelFormatter={(label) => label} />
                                                <Bar dataKey="count" fill="#1F8090">
                                                    {/* optional: color per bar if needed */}
                                                </Bar>
                                            </BarChart>
                                        )
                                    }}
                                </MeasuredChartContainer>
                            )}
                        </ChartErrorBoundary>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Resource × Severity Heatmap</span>
                        <div style={{ padding: 12 }}>
                            {(() => {
                                const severitiesCols = ['CRITICAL','HIGH','MEDIUM','LOW','UNKNOWN'];
                                const topResources = (topVulnerableResourcesData || []).slice(0, 10);
                                // compute max for color scale
                                let max = 0;
                                topResources.forEach(r => {
                                    severitiesCols.forEach(s => { max = Math.max(max, r[s.toLowerCase()] || 0); });
                                });
                                if (max === 0) max = 1;
                                const colorFor = (count) => {
                                    if (!count) return '#f4f7f9';
                                    const pct = count / max;
                                    if (pct > 0.75) return '#D22B2B';
                                    if (pct > 0.5) return '#FF8B8B';
                                    if (pct > 0.25) return '#FFBEBE';
                                    return '#FFE7E7';
                                }

                                return (
                                    <div style={{ overflowX: 'auto' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: `200px repeat(${severitiesCols.length}, 1fr)`, gap: 8, alignItems: 'center' }}>
                                            <div style={{ fontWeight: 700 }}></div>
                                            {severitiesCols.map((s, i) => <div key={`h-${i}`} style={{ fontWeight: 700, textAlign: 'center' }}>{s}</div>)}
                                            {topResources.map((r, idx) => (
                                                <React.Fragment key={`row-${idx}`}>
                                                    <div style={{ padding: '6px 8px', fontSize: 13 }}>{r.name}</div>
                                                    {severitiesCols.map((s, j) => {
                                                        const v = r[s.toLowerCase()] || 0;
                                                        return (
                                                            <div key={`cell-${idx}-${j}`} style={{ padding: 6, textAlign: 'center', background: colorFor(v), borderRadius: 4 }}>
                                                                <div style={{ fontWeight: 700 }}>{v}</div>
                                                            </div>
                                                        )
                                                    })}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Vulnerabilities by Type</span>
                        <ChartErrorBoundary label="Vulnerabilities by Type">
                            {(!vulnerabilitiesByType || vulnerabilitiesByType.every(d => !d.count)) ? <EmptyChartPlaceholder height={350} /> : (
                                <MeasuredChartContainer height={350}>
                                    {(width) => (
                                        <PieChart width={width} height={350}>
                                            <Pie
                                                dataKey="count"
                                                data={vulnerabilitiesByType}
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={110}
                                                fill="#8884d8"
                                            >
                                                {vulnerabilitiesByType?.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={hexColors[index % hexColors.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                            <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                                        </PieChart>
                                    )}
                                </MeasuredChartContainer>
                            )}
                        </ChartErrorBoundary>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Patchable Vulnerabilities</span>
                        <ChartErrorBoundary label="Patchable Vulnerabilities">
                            {(!patchSummaryData || patchSummaryData.every(d => !d.fixed && !d.unfixed)) ? <EmptyChartPlaceholder height={350} /> : (
                                <MeasuredChartContainer height={350}>
                                    {(width) => (
                                        <RadarChart width={width} height={350} cx="50%" cy="50%" data={patchSummaryData}>
                                            <PolarGrid />
                                            <PolarAngleAxis dataKey="severity" />
                                            <PolarRadiusAxis angle={30} domain={[0, radarMax]} tickCount={5} />
                                            <Radar name="fixed" dataKey="fixed" stroke="#00C49F" fill="#00C49F" fillOpacity={0.6} />
                                            <Radar name="unfixed" dataKey="unfixed" stroke="#FF7E62" fill="#FF7E62" fillOpacity={0.6} />
                                            <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                                            <Tooltip />
                                        </RadarChart>
                                    )}
                                </MeasuredChartContainer>
                            )}
                        </ChartErrorBoundary>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Top Vulnerable Resources</span>
                        <ChartErrorBoundary label="Top Vulnerable Resources">
                            {(topVulnerableResourcesData || []).length === 0 ? <EmptyChartPlaceholder height={350} /> : (
                                <MeasuredChartContainer height={350}>
                                    {(width) => (
                                        <BarChart
                                            width={width}
                                            height={350}
                                            data={topVulnerableResourcesData}
                                            margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                                        >
                                            <defs>
                                                <linearGradient id="gradCritical" x1="0" x2="1">
                                                    <stop offset="0%" stopColor="#FF6B6B" />
                                                    <stop offset="100%" stopColor="#D22B2B" />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="name" tick={{fontSize: 12}} />
                                            <YAxis />
                                            <Tooltip content={this.CustomTooltip} />
                                            <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                                            <Bar dataKey="critical" stackId="a" fill="url(#gradCritical)" radius={[0, 0, 0, 0]} onClick={this.onBarClick} className="resource-bar" onMouseEnter={(e)=>this.setState({hoveredResource: e && e.payload ? e.payload.name : null})} onMouseLeave={()=>this.setState({hoveredResource: null})} />
                                            <Bar dataKey="high" stackId="a" fill="#FFB37E" radius={[0, 0, 0, 0]} onClick={this.onBarClick} className="resource-bar" onMouseEnter={(e)=>this.setState({hoveredResource: e && e.payload ? e.payload.name : null})} onMouseLeave={()=>this.setState({hoveredResource: null})} />
                                            <Bar dataKey="medium" stackId="a" fill="#F1D86F" radius={[0, 0, 0, 0]} onClick={this.onBarClick} className="resource-bar" onMouseEnter={(e)=>this.setState({hoveredResource: e && e.payload ? e.payload.name : null})} onMouseLeave={()=>this.setState({hoveredResource: null})} />
                                            <Bar dataKey="low" stackId="a" fill="#7EE6C8" radius={[4, 4, 0, 0]} onClick={this.onBarClick} className="resource-bar" onMouseEnter={(e)=>this.setState({hoveredResource: e && e.payload ? e.payload.name : null})} onMouseLeave={()=>this.setState({hoveredResource: null})} />
                                        </BarChart>
                                    )}
                                </MeasuredChartContainer>
                            )}
                        </ChartErrorBoundary>

                        {/* Sparklines per resource (prefer precomputed series if available) */}
                        <div style={{ marginTop: 12 }}>
                            {(topVulnerableResourcesData || []).slice(0,6).map((r, idx) => {
                                const pre = (resourceTimeSeries || []).find(rr => rr.name === r.name);
                                const dataSeries = pre ? pre.series : this.buildResourceTimeSeries(r.name);
                                const total = pre ? pre.series.reduce((s, p) => s + (p.count || 0), 0) : (r.total || (r.critical + r.high + r.medium + r.low));
                                return (
                                <div key={`spark-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                    <div style={{ width: 160, fontSize: 13 }}>{r.name}</div>
                                    <div style={{ flex: 1, height: 48 }}>
                                        <MeasuredChartContainer height={48}>
                                            {(width) => (
                                                <AreaChart width={width} height={48} data={dataSeries}>
                                                    <Area type="monotone" dataKey="count" stroke="#FF7E62" fill="#FFBFB2" fillOpacity={0.6} />
                                                </AreaChart>
                                            )}
                                        </MeasuredChartContainer>
                                    </div>
                                    <div style={{ width: 80, textAlign: 'right', fontWeight: 700 }}>{total}</div>
                                </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Vulnerabilities by Year</span>
                        <ChartErrorBoundary label="Vulnerabilities by Year">
                            {(() => {
                                const yearData = severityTimeSeries && severityTimeSeries.length ? severityTimeSeries : vulnerabilityAgeDistribution;
                                const hasData = (yearData || []).some(d => (d.critical||0)+(d.high||0)+(d.medium||0)+(d.low||0)+(d.unknown||0) > 0);
                                if (!hasData) return <EmptyChartPlaceholder height={350} />;
                                return (
                                    <MeasuredChartContainer height={350}>
                                        {(width) => (
                                            <AreaChart
                                                width={width}
                                                height={350}
                                                data={yearData}
                                                margin={{ top: 15, right: 30, left: 0, bottom: 0 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="year" />
                                                <YAxis />
                                                <Tooltip />
                                                <Area type="monotone" dataKey="critical" stackId="1" stroke="#D22B2B" fill="#D22B2B" fillOpacity={0.8} />
                                                <Area type="monotone" dataKey="high" stackId="1" stroke="#FF7E62" fill="#FF7E62" fillOpacity={0.8} />
                                                <Area type="monotone" dataKey="medium" stackId="1" stroke="#F1D86F" fill="#F1D86F" fillOpacity={0.8} />
                                                <Area type="monotone" dataKey="low" stackId="1" stroke="#00C49F" fill="#00C49F" fillOpacity={0.8} />
                                                <Area type="monotone" dataKey="unknown" stackId="1" stroke="#0088FE" fill="#0088FE" fillOpacity={0.8} />
                                            </AreaChart>
                                        )}
                                    </MeasuredChartContainer>
                                );
                            })()}
                        </ChartErrorBoundary>
                    </div>
                    
                        <div className="vulnerability-charts__card">
                            <span className="vulnerability-charts__title">Timeline (Total & Moving Avg)</span>
                            <ChartErrorBoundary label="Timeline (Total & Moving Avg)">
                                {(() => {
                                    const tlData = timelineSeries && timelineSeries.length ? timelineSeries : severityTimeSeries;
                                    const hasData = (tlData || []).some(d => (d.total||0) > 0);
                                    if (!hasData) return <EmptyChartPlaceholder height={260} />;
                                    return (
                                        <MeasuredChartContainer height={260}>
                                            {(width) => (
                                                <AreaChart width={width} height={260} data={tlData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="year" />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Area type="monotone" dataKey="total" stroke="#1F8090" fill="#DFF7F7" fillOpacity={0.6} />
                                                    <Line type="monotone" dataKey="movingAvg" stroke="#FF7E62" strokeWidth={2} dot={false} />
                                                </AreaChart>
                                            )}
                                        </MeasuredChartContainer>
                                    );
                                })()}
                            </ChartErrorBoundary>
                        </div>
                            {/* Selected resource drill-down */}
                            {this.state.selectedResource && (
                                <div className="vulnerability-charts__card">
                                    <span className="vulnerability-charts__title">Details: {this.state.selectedResource}</span>
                                    <div style={{ marginTop: 8 }}>
                                        {/* sparkline for selected resource */}
                                        <MeasuredChartContainer height={80}>
                                            {(width) => (
                                                <AreaChart width={width} height={80} data={(resourceTimeSeries && resourceTimeSeries.find(r=>r.name===this.state.selectedResource) ? resourceTimeSeries.find(r=>r.name===this.state.selectedResource).series : this.buildResourceTimeSeries(this.state.selectedResource))}>
                                                    <Area type="monotone" dataKey="count" stroke="#D22B2B" fill="#FFD6D6" fillOpacity={0.6} />
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="year" />
                                                    <YAxis />
                                                </AreaChart>
                                            )}
                                        </MeasuredChartContainer>
                                        {/* list vulnerabilities */}
                                        <div style={{ marginTop: 12 }}>
                                            {(this.state.vulnerabilities || []).filter(v => (v.resource === this.state.selectedResource)).map((v, i) => (
                                                <div key={`v-${i}`} style={{ padding: 8, borderBottom: '1px solid #eef6f8' }}>
                                                    <strong style={{ marginRight: 8 }}>{v.title}</strong>
                                                    <span style={{ marginLeft: 8 }} className={`sev-badge sev-${(v.severity||'UNKNOWN').toUpperCase()}`}>{(v.severity||'UNKNOWN').toUpperCase()}</span>
                                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{v.primaryLink ? <a href={v.primaryLink} target="_blank" rel="noreferrer">{v.primaryLink}</a> : null}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                </div>
            </div>
        )
    }
}

export default Dashboard;