import React, { Component } from 'react';
import { Area, AreaChart, RadarChart, PolarGrid, Radar, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { DashboardData } from '../../utils/data';
import "./dashboard.scss";
import "../grid/vulnerability-report.scss";

class Dashboard extends Component {
    state = {
    }
    componentDidMount() {
        this.fetchData();
    }

    componentDidUpdate(prevProp) {
        if (prevProp.reportUrl !== this.props.reportUrl) {
            this.fetchData();
        }
    }

    fetchData = async () => {
        const res = await DashboardData(this.props.reportUrl, this.props.fallbackConfig).then(data => {
            return data;
        });
        this.setState(res);
    }

    render() {
        const { severityData, patchSummaryData, topVulnerableResourcesData, vulnerabilitiesByType, vulnerabilityAgeDistribution, status } = this.state;

        if (status === 'clean') {
            return (
                <div className="vulnerability-report__banner vulnerability-report__banner_success">
                    No vulnerabilities found for this image.
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

        return (
            <div>
                <div className="vulnerability-charts__wrapper">
                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Vulnerabilities by Severity</span>
                        <ResponsiveContainer width="100%" height={350}>
                            <PieChart>
                                <Pie
                                    dataKey="count"
                                    data={severityData}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={110}
                                    fill="#8884d8"
                                >
                                    {severityData?.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={severityHexColors[index % severityHexColors.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Vulnerabilities by Type</span>
                        <ResponsiveContainer width="100%" height={350}>
                            <PieChart>
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
                        </ResponsiveContainer>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Patchable Vulnerabilities</span>
                        <ResponsiveContainer width="100%" height={350}>
                            <RadarChart cx="50%" cy="50%" data={patchSummaryData}>
                                <PolarGrid />
                                <PolarAngleAxis dataKey="severity" />
                                <PolarRadiusAxis angle={30} domain={[0, 150]} />
                                <Radar name="fixed" dataKey="fixed" stroke="#00C49F" fill="#00C49F" fillOpacity={0.6} />
                                <Radar name="unfixed" dataKey="unfixed" stroke="#FF7E62" fill="#FF7E62" fillOpacity={0.6} />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                                <Tooltip />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Top Vulnerable Resources</span>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart
                                data={topVulnerableResourcesData}
                                margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{fontSize: 12}} />
                                <YAxis />
                                <Tooltip />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                                <Bar dataKey="critical" stackId="a" fill="#D22B2B" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="high" stackId="a" fill="#FF7E62" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="medium" stackId="a" fill="#F1D86F" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="low" stackId="a" fill="#00C49F" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="vulnerability-charts__card">
                        <span className="vulnerability-charts__title">Vulnerabilities by Year</span>
                        <ResponsiveContainer width="100%" height={350}>
                            <AreaChart
                                data={vulnerabilityAgeDistribution}
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
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        )
    }
}

export default Dashboard;