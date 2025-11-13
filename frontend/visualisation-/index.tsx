import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// --- MOCK DATA ---
const mockMetrics = [
    { id: 'm1', title: 'Active Systems', value: '847', change: '+12', trend: 'up' },
    { id: 'm2', title: 'Security Events', value: '1,234', change: '+89', trend: 'up' },
    { id: 'm3', title: 'Active Alerts', value: '23', change: '-5', trend: 'down' },
    { id: 'm4', title: 'CPU Usage', value: '67%', change: '+3%', trend: 'up' },
];

const mockAlerts = [
    { id: 'a1', severity: 'Critical', title: 'Failed Login Attempt', description: 'Multiple failed login attempts from IP 192.168.1.45', time: '14:32:15' },
    { id: 'a2', severity: 'Critical', title: 'Port Scan Detected', description: 'Suspicious port scanning activity from external IP', time: '14:29:33' },
    { id: 'a3', severity: 'Warning', title: 'High Memory Usage', description: 'DB-SRV-03 memory usage at 89%', time: '14:31:42' },
    { id: 'a4', severity: 'Warning', title: 'Spam Filter Alert', description: 'Spam threshold exceeded on MAIL-SRV-01', time: '14:27:05' },
    { id: 'a5', severity: 'Success', title: 'Security Patch Applied', description: 'WEB-SRV-02 successfully updated', time: '14:28:17' },
];

const mockLogs = [
    { id: 'l1', severity: 'Critical', timestamp: '2025-10-06 14:32:15', category: 'Authentication', server: 'WEB-SRV-01', message: 'Failed login attempt detected from IP 192.168.1.45' },
    { id: 'l2', severity: 'Warning', timestamp: '2025-10-06 14:31:42', category: 'Performance', server: 'DB-SRV-03', message: 'High memory usage detected - 89%' },
    { id: 'l3', severity: 'Info', timestamp: '2025-10-06 14:30:58', category: 'Backup', server: 'APP-SRV-12', message: 'System backup completed successfully' },
    { id: 'l4', severity: 'Critical', timestamp: '2025-10-06 14:29:33', category: 'Intrusion', server: 'FW-PERIMETER', message: 'Port scan from 103.45.12.99 detected and blocked.' },
    { id: 'l5', severity: 'Info', timestamp: '2025-10-06 14:28:17', category: 'Update', server: 'WEB-SRV-02', message: 'Security patch KB501234 applied successfully.' },
];

const networkTopologyData = {
    nodes: [
        { id: 'center-hub', label: 'Centr...', icon: 'Server', status: 'online', position: { top: '50%', left: '50%' } },
        { id: 'agent-alpha', label: 'Ag...', icon: 'Laptop', status: 'online', position: { top: '20%', left: '25%' }, badge: 1 },
        { id: 'agent-beta', label: 'Ag...', icon: 'Laptop', status: 'online', position: { top: '25%', left: '75%' }, badge: 1 },
        { id: 'agent-gamma', label: 'Ag...', icon: 'Laptop', status: 'warning', position: { top: '70%', left: '80%' } },
        { id: 'agent-delta', label: 'Ag...', icon: 'Laptop', status: 'online', position: { top: '85%', left: '55%' } },
        { id: 'agent-epsilon', label: 'Ag...', icon: 'Laptop', status: 'online', position: { top: '70%', left: '20%' }, badge: 1 },
        { id: 'mobile-1', label: 'M...', icon: 'Mobile', status: 'online', position: { top: '35%', left: '10%' } },
        { id: 'usb-drive', label: 'usb', icon: 'Usb', status: 'online', position: { top: '15%', left: '40%' } },
        { id: 'keyboard-1', label: 'keyb...', icon: 'Keyboard', status: 'online', position: { top: '20%', left: '90%' } },
        { id: 'monitor-1', label: 'mon...', icon: 'Monitor', status: 'online', position: { top: '80%', left: '8%' } },
        { id: 'unknown-device', label: '0', icon: 'Circle', status: 'offline', position: { top: '90%', left: '70%' } },
    ],
    connections: [
        { from: 'center-hub', to: 'agent-alpha' }, { from: 'center-hub', to: 'agent-beta' },
        { from: 'center-hub', to: 'agent-gamma' }, { from: 'center-hub', to: 'agent-delta' },
        { from: 'center-hub', to: 'agent-epsilon' }, { from: 'center-hub', to: 'mobile-1' },
        { from: 'agent-alpha', to: 'usb-drive', dashed: true },
        { from: 'agent-beta', to: 'keyboard-1', dashed: true },
        { from: 'agent-epsilon', to: 'monitor-1', dashed: true },
        { from: 'agent-delta', to: 'unknown-device', dashed: true },
    ]
};

// --- ICON COMPONENTS ---
const ShieldIcon = () => <svg style={{ width: '32px', height: '32px', marginRight: '12px', color: 'var(--active-nav-color)' }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>;
const SunIcon = () => <svg style={styles.themeIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.106a.75.75 0 010 1.06l-1.591 1.59a.75.75 0 11-1.06-1.06l1.59-1.59a.75.75 0 011.06 0zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.803 17.803a.75.75 0 01-1.06 0l-1.59-1.591a.75.75 0 111.06-1.06l1.59 1.59a.75.75 0 010 1.06zM12 21a.75.75 0 01-.75-.75v-2.25a.75.75 0 011.5 0v2.25A.75.75 0 0112 21zM5.106 17.803a.75.75 0 010-1.06l1.591-1.59a.75.75 0 011.06 1.06l-1.59 1.59a.75.75 0 01-1.06 0zM3 12a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H3.75A.75.75 0 013 12zM6.106 5.106a.75.75 0 011.06 0l1.59 1.591a.75.75 0 01-1.06 1.06l-1.59-1.59a.75.75 0 010-1.06z"></path></svg>;
const MoonIcon = () => <svg style={styles.themeIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 004.472-.948.75.75 0 01.97.97A10.5 10.5 0 119.528 1.718z" clipRule="evenodd"></path></svg>;
const MetricIcons = {
    'Active Systems': () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg>,
    'Security Events': () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>,
    'Active Alerts': () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>,
    'CPU Usage': () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 21v-1.5M15.75 3v1.5M12 4.5v-1.5m0 18v-1.5M15.75 21v-1.5M18 8.25h1.5M18 15.75h1.5M12 18h-1.5v1.5h1.5v-1.5zm-3-3h-1.5v1.5h1.5v-1.5zm-3-3h-1.5v1.5h1.5v-1.5zm0-3h-1.5v1.5h1.5v-1.5zm3 0h-1.5v1.5h1.5v-1.5zm3 0h-1.5v1.5h1.5v-1.5zm3-3h-1.5v1.5h1.5v-1.5zm0 3h-1.5v1.5h1.5v-1.5zm0 3h-1.5v1.5h1.5v-1.5zm0 3h-1.5v1.5h1.5v-1.5zm-3 0h-1.5v1.5h1.5v-1.5zm-3 0h-1.5v1.5h1.5v-1.5zm-3-3h-1.5v1.5h1.5v-1.5zm0-3h-1.5v1.5h1.5v-1.5zm3 0h-1.5v1.5h1.5v-1.5zm3 0h-1.5v1.5h1.5v-1.5zm3-3h-1.5v1.5h1.5v-1.5z" /></svg>,
};
const AlertIcons = {
    Critical: () => <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>,
    Warning: () => <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>,
    Success: () => <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};

const DeviceIcons = {
    Server: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3V7.5a3 3 0 013-3h13.5a3 3 0 013 3v3.75a3 3 0 01-3 3m-13.5 0h13.5m-13.5 0a3 3 0 00-3 3v.75a3 3 0 003 3h13.5a3 3 0 003-3v-.75a3 3 0 00-3-3z" /></svg>,
    Laptop: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m-6 0h6m-6 0v-4.5m6 4.5v-4.5m-9-3.75h12a2.25 2.25 0 002.25-2.25v-6.75A2.25 2.25 0 0016.5 3H7.5A2.25 2.25 0 005.25 5.25v6.75A2.25 2.25 0 007.5 14.25z" /></svg>,
    Mobile: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0h3" /></svg>,
    Usb: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>,
    Keyboard: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 0a2.25 2.25 0 01-2.25-2.25V7.5a2.25 2.25 0 012.25-2.25h7.5a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5z" /></svg>,
    Monitor: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m-6 0h6" /></svg>,
    Circle: () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};


// --- COMPONENTS ---

const Header = ({ theme, toggleTheme }) => (
    <header style={styles.header}>
        <div style={styles.headerLeft}>
            <ShieldIcon />
            <div>
                <h1 style={styles.title}>Security Operations Center</h1>
                <p style={styles.subtitle}>Real-time monitoring and threat detection</p>
            </div>
        </div>
        <div style={styles.headerRight}>
            <div style={styles.systemStatus}>
                <div style={styles.statusIndicatorOnline}></div>
                System Active
            </div>
            <button onClick={toggleTheme} style={styles.themeToggle} aria-label="Toggle theme">
                {theme === 'light' ? <SunIcon /> : <MoonIcon />}
            </button>
        </div>
    </header>
);

const DashboardMetrics = ({ metrics }) => {
    const getTrendColor = (trend) => {
        if (trend === 'up') return 'var(--status-online)';
        if (trend === 'down') return 'var(--status-offline)';
        return 'var(--text-color-secondary)';
    };

    return (
        <div style={styles.grid}>
            {metrics.map(metric => {
                const Icon = MetricIcons[metric.title];
                return (
                    <div key={metric.id} style={styles.metricCard}>
                        <div style={styles.metricContent}>
                            <p style={styles.metricTitle}>{metric.title}</p>
                            <h2 style={styles.metricValue}>{metric.value}</h2>
                            <p style={{ ...styles.metricChange, color: getTrendColor(metric.trend) }}>
                                {metric.trend === 'up' ? '▲' : '▼'} {metric.change}
                            </p>
                        </div>
                        <div style={styles.metricIconWrapper}>
                            <Icon />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const Devices = ({ nodes }) => {
    const [deviceSearch, setDeviceSearch] = useState('');
    const [deviceStatusFilter, setDeviceStatusFilter] = useState('All');

    const filteredDevices = useMemo(() => {
        return nodes.filter(node => {
            const statusMatch = (() => {
                if (deviceStatusFilter === 'All') return true;
                if (deviceStatusFilter === 'Online') return node.status === 'online';
                if (deviceStatusFilter === 'Offline') return node.status === 'offline';
                if (deviceStatusFilter === 'Warning') return node.status === 'warning';
                return false;
            })();
            
            const searchMatch = node.label.toLowerCase().includes(deviceSearch.toLowerCase()) ||
                                node.id.toLowerCase().includes(deviceSearch.toLowerCase());

            return statusMatch && searchMatch;
        });
    }, [nodes, deviceSearch, deviceStatusFilter]);
    
    const getStatusColor = (status) => {
        if (status === 'online') return 'var(--status-online)';
        if (status === 'warning') return 'var(--status-warning)';
        return 'var(--status-offline)';
    };

    return (
        <div style={styles.widget}>
            <h2 style={styles.widgetTitle}>Devices</h2>
            <div style={styles.deviceFilters}>
                 <input
                    type="text"
                    placeholder="Search devices..."
                    value={deviceSearch}
                    onChange={e => setDeviceSearch(e.target.value)}
                    style={{...styles.searchInput, flexGrow: 0, minWidth: '250px'}}
                />
                <div style={styles.statusFilterButtons}>
                    <button onClick={() => setDeviceStatusFilter('All')} style={deviceStatusFilter === 'All' ? styles.activeFilterButton : styles.filterButton}>All</button>
                    <button onClick={() => setDeviceStatusFilter('Online')} style={deviceStatusFilter === 'Online' ? styles.activeFilterButton : styles.filterButton}>Online</button>
                    <button onClick={() => setDeviceStatusFilter('Offline')} style={deviceStatusFilter === 'Offline' ? styles.activeFilterButton : styles.filterButton}>Offline</button>
                    <button onClick={() => setDeviceStatusFilter('Warning')} style={deviceStatusFilter === 'Warning' ? styles.activeFilterButton : styles.filterButton}>Warning</button>
                </div>
            </div>
            <div style={styles.deviceGrid}>
                {filteredDevices.map(node => {
                    const Icon = DeviceIcons[node.icon];
                    return (
                        <div key={node.id} style={styles.deviceCard}>
                            <div style={styles.deviceCardIcon}><Icon /></div>
                            <div style={styles.deviceCardInfo}>
                                <div style={styles.deviceCardLabel}>{node.id}</div>
                                <div style={styles.deviceCardStatus}>
                                    <span style={{...styles.deviceStatusIndicator, backgroundColor: getStatusColor(node.status)}}></span>
                                    {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const TopologyNode = ({ node }) => {
    const getStatusColor = (status) => {
        if (status === 'online') return 'var(--status-online)';
        if (status === 'warning') return 'var(--status-warning)';
        return 'var(--status-offline)';
    };
    const Icon = DeviceIcons[node.icon];
    const isPeripheral = ['Usb', 'Keyboard', 'Monitor', 'Circle'].includes(node.icon);
    
    return (
        <div style={{
            ...styles.topologyNode,
            ...(isPeripheral ? styles.peripheralNode : styles.mainNode),
            top: node.position.top,
            left: node.position.left,
        }}>
            <div style={styles.nodeIconWrapper}>
                <Icon/>
            </div>
            <span style={styles.nodeLabel}>{node.label}</span>
            <div style={{ ...styles.nodeStatus, backgroundColor: getStatusColor(node.status) }}></div>
            {node.badge && <div style={styles.nodeBadge}>{node.badge}</div>}
        </div>
    );
};


const NetworkTopology = () => {
    const containerRef = React.useRef(null);

    const getNodeCoords = (node) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        const x = parseFloat(node.position.left) / 100 * containerWidth;
        const y = parseFloat(node.position.top) / 100 * containerHeight;
        return { x, y };
    };

    return (
        <div style={styles.widget}>
            <h2 style={styles.widgetTitle}>Network Topology</h2>
            <div ref={containerRef} style={styles.topologyContainer}>
                <svg style={styles.topologySvg}>
                    {networkTopologyData.connections.map((conn, index) => {
                        const fromNode = networkTopologyData.nodes.find(n => n.id === conn.from);
                        const toNode = networkTopologyData.nodes.find(n => n.id === conn.to);

                        if (!fromNode || !toNode) return null;
                        
                        const fromCoords = getNodeCoords(fromNode);
                        const toCoords = getNodeCoords(toNode);

                        return (
                            <line
                                key={index}
                                x1={fromCoords.x}
                                y1={fromCoords.y}
                                x2={toCoords.x}
                                y2={toCoords.y}
                                stroke="var(--border-color)"
                                strokeWidth="2"
                                strokeDasharray={conn.dashed ? "5 5" : "none"}
                            />
                        );
                    })}
                </svg>
                {networkTopologyData.nodes.map(node => (
                    <TopologyNode key={node.id} node={node} />
                ))}
            </div>
        </div>
    );
};


const ActiveAlerts = ({ alerts }) => {
    const getSeverityStyles = (severity) => {
        switch (severity) {
            case 'Critical': return { backgroundColor: 'var(--critical-bg)', color: 'var(--critical-text)', iconColor: 'var(--critical-text)' };
            case 'Warning': return { backgroundColor: 'var(--warning-bg)', color: 'var(--warning-text)', iconColor: 'var(--warning-text)' };
            case 'Success': return { backgroundColor: 'var(--success-bg)', color: 'var(--success-text)', iconColor: 'var(--success-text)' };
            default: return {};
        }
    };
    return (
        <div style={styles.widget}>
            <div style={styles.widgetHeader}>
                <h2 style={styles.widgetTitle}>Active Alerts</h2>
                <span style={styles.criticalCount}>2 Critical</span>
            </div>
            <div style={styles.alertList}>
                {alerts.map(alert => {
                    const severityStyles = getSeverityStyles(alert.severity);
                    const Icon = AlertIcons[alert.severity];
                    return (
                        <div key={alert.id} style={{ ...styles.alertCard, ...severityStyles }}>
                            <div style={{ ...styles.alertIcon, color: severityStyles.iconColor }}>
                               {Icon && <Icon />}
                            </div>
                            <div style={styles.alertContent}>
                                <h3 style={styles.alertTitle}>{alert.title}</h3>
                                <p style={styles.alertDescription}>{alert.description}</p>
                            </div>
                            <span style={styles.alertTime}>{alert.time}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

const SecurityEventLogs = ({ logs }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [severityFilter, setSeverityFilter] = useState('All');
    const [dateFilter, setDateFilter] = useState('');

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || log.server.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesSeverity = severityFilter === 'All' || log.severity === severityFilter;
            const matchesDate = !dateFilter || log.timestamp.startsWith(dateFilter);
            return matchesSearch && matchesSeverity && matchesDate;
        });
    }, [logs, searchTerm, severityFilter, dateFilter]);
    
    const getSeverityTagColor = (severity) => {
      switch (severity) {
        case 'Critical': return 'var(--critical-tag-bg)';
        case 'Warning': return 'var(--warning-tag-bg)';
        case 'Info': return 'var(--info-tag-bg)';
        default: return 'var(--text-color-secondary)';
      }
    };

    return (
        <div style={styles.widget}>
            <div style={styles.widgetHeader}>
                <h2 style={styles.widgetTitle}>Security Event Logs</h2>
                <button style={styles.exportButton}>Export</button>
            </div>
            <div style={styles.filters}>
                <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={styles.searchInput}
                />
                 <input
                    type="date"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    style={styles.dateInput}
                />
                 <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={styles.selectInput}>
                    <option value="All">All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="Warning">Warning</option>
                    <option value="Info">Info</option>
                </select>
            </div>
            <div style={styles.logList}>
                {filteredLogs.map(log => (
                    <div key={log.id} style={styles.logCard}>
                        <div style={styles.logCardHeader}>
                            <span style={{...styles.severityTag, backgroundColor: getSeverityTagColor(log.severity)}}>{log.severity}</span>
                            <span style={styles.logTimestamp}>{log.timestamp}</span>
                            <span style={styles.logCategory}>{log.category}</span>
                        </div>
                        <div style={styles.logCardBody}>
                            <p style={styles.logServer}>{log.server}</p>
                            <p style={styles.logMessage}>{log.message}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


const App = () => {
    const [theme, setTheme] = useState('dark');

    useEffect(() => {
        document.body.className = `${theme}-theme`;
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    };

    return (
        <div style={styles.app}>
            <Header theme={theme} toggleTheme={toggleTheme} />
            <main style={styles.main}>
                <DashboardMetrics metrics={mockMetrics} />
                <div style={styles.layoutGrid}>
                    <div style={styles.mainColumn}>
                       <Devices nodes={networkTopologyData.nodes} />
                       <NetworkTopology />
                       <SecurityEventLogs logs={mockLogs} />
                    </div>
                    <div style={styles.sideColumn}>
                        <ActiveAlerts alerts={mockAlerts} />
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---

const styles: { [key: string]: React.CSSProperties } = {
    app: { backgroundColor: 'var(--bg-color)', color: 'var(--text-color)', minHeight: '100vh', },
    main: { padding: '24px', maxWidth: '1600px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', backgroundColor: 'var(--header-bg-color)', borderBottom: '1px solid var(--border-color)', },
    headerLeft: { display: 'flex', alignItems: 'center', },
    title: { fontSize: '24px', fontWeight: 600, margin: '0', color: 'var(--text-color)' },
    subtitle: { margin: '0', fontSize: '14px', color: 'var(--text-color-secondary)' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
    systemStatus: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-color-secondary)', fontWeight: 500 },
    statusIndicatorOnline: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--status-online)' },
    themeToggle: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-color-secondary)', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', },
    themeIcon: { width: '24px', height: '24px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' },
    metricCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--card-bg-color)', borderRadius: '12px', padding: '24px', border: '1px solid var(--border-color)', },
    metricContent: {},
    metricTitle: { margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-color-secondary)' },
    metricValue: { margin: '0', fontSize: '30px', fontWeight: 700, color: 'var(--text-color)' },
    metricChange: { margin: '8px 0 0 0', fontSize: '14px', fontWeight: 500 },
    metricIconWrapper: { color: 'var(--text-color-secondary)', width: '32px', height: '32px' },
    widget: { backgroundColor: 'var(--card-bg-color)', borderRadius: '12px', padding: '24px', border: '1px solid var(--border-color)', marginBottom: '24px' },
    widgetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
    widgetTitle: { margin: '0', fontSize: '20px', fontWeight: 600, color: 'var(--text-color)' },
    criticalCount: { backgroundColor: 'var(--critical-bg)', color: 'var(--critical-text)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 },
    alertList: { display: 'flex', flexDirection: 'column', gap: '12px' },
    alertCard: { display: 'flex', alignItems: 'center', gap: '16px', borderRadius: '8px', padding: '16px' },
    alertIcon: { flexShrink: 0, width: '24px', height: '24px' },
    alertContent: { flexGrow: 1 },
    alertTitle: { margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, color: 'inherit' },
    alertDescription: { margin: '0', fontSize: '14px', color: 'inherit', opacity: 0.9 },
    alertTime: { fontSize: '14px', color: 'inherit', opacity: 0.9, whiteSpace: 'nowrap' },
    topologyContainer: { position: 'relative', minHeight: '450px', paddingTop: '24px' },
    topologySvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', },
    topologyNode: { position: 'absolute', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', },
    mainNode: { backgroundColor: 'var(--card-bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', minWidth: '60px', textAlign: 'center', fontSize: '12px' },
    peripheralNode: { backgroundColor: 'var(--card-bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', minWidth: '50px', textAlign: 'center', fontSize: '12px', color: 'var(--text-color-secondary)' },
    nodeIconWrapper: { fontSize: '24px', width: '28px', height: '28px', color: 'var(--active-nav-color)' },
    nodeLabel: { fontSize: '12px', fontWeight: 500 },
    nodeStatus: { position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', borderRadius: '50%', border: '2px solid var(--card-bg-color)' },
    nodeBadge: { position: 'absolute', top: '-5px', right: '-5px', backgroundColor: 'var(--button-bg-color)', color: 'var(--button-text-color)', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', border: '2px solid var(--card-bg-color)' },
    deviceFilters: { display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' },
    statusFilterButtons: { display: 'flex', gap: '8px', backgroundColor: 'var(--bg-color)', padding: '4px', borderRadius: '8px' },
    filterButton: { background: 'none', border: 'none', color: 'var(--text-color-secondary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 },
    activeFilterButton: { backgroundColor: 'var(--card-bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-color)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 },
    exportButton: { background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-color)', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    filters: { display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', },
    searchInput: { padding: '10px 14px', fontSize: '16px', backgroundColor: 'var(--input-bg-color)', color: 'var(--text-color)', border: '1px solid var(--input-border-color)', borderRadius: '8px', flexGrow: 1, minWidth: '200px', },
    dateInput: { padding: '8px 12px', fontSize: '16px', backgroundColor: 'var(--input-bg-color)', color: 'var(--text-color)', border: '1px solid var(--input-border-color)', borderRadius: '8px', fontFamily: 'inherit', colorScheme: 'var(--color-scheme, light)', },
    selectInput: { padding: '10px 14px', fontSize: '16px', backgroundColor: 'var(--input-bg-color)', color: 'var(--text-color)', border: '1px solid var(--input-border-color)', borderRadius: '8px', fontFamily: 'inherit' },
    logList: { display: 'flex', flexDirection: 'column', gap: '12px' },
    logCard: { backgroundColor: 'var(--bg-color)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-color)' },
    logCardHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' },
    severityTag: { padding: '2px 8px', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 500 },
    logTimestamp: { fontSize: '12px', color: 'var(--text-color-secondary)' },
    logCategory: { fontSize: '12px', color: 'var(--text-color-secondary)', backgroundColor: 'var(--card-bg-color)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border-color)' },
    logCardBody: {},
    logServer: { margin: '0 0 4px 0', fontWeight: 600, color: 'var(--text-color)' },
    logMessage: { margin: '0', fontSize: '14px', color: 'var(--text-color-secondary)' },
    layoutGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' },
    mainColumn: {},
    sideColumn: {},
    deviceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '24px' },
    deviceCard: { display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-color)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' },
    deviceCardIcon: { width: '32px', height: '32px', color: 'var(--active-nav-color)', flexShrink: 0 },
    deviceCardInfo: { flexGrow: 1, overflow: 'hidden' },
    deviceCardLabel: { fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    deviceCardStatus: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-color-secondary)', marginTop: '4px' },
    deviceStatusIndicator: { width: '10px', height: '10px', borderRadius: '50%' },
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);