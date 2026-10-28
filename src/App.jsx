import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Droplet, Factory, Gauge, History, LayoutDashboard,
  Leaf, LogIn, LogOut, Menu, ShieldCheck, Thermometer, TrendingUp, Wifi,
  WifiOff, Wind, X
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { auth, db, isFirebaseConfigured } from "./firebase.js";

const DEMO_LIVE = {
  status: "Dehydrating",
  currentStep: "Dehydration cycle",
  progress: 68,
  temperature: 62.4,
  dehydratorTemperature: 54.8,
  humidity: 31,
  loadedMolders: 4,
  targetMolders: 6,
  online: true,
  updatedAt: Date.now(),
  fault: false
};

const DEMO_NOTIFICATIONS = [
  { id: "n1", title: "Dehydration cycle in progress", message: "The current batch is in the drying stage.", type: "info", createdAt: Date.now() - 120000, read: false },
  { id: "n2", title: "Temperature reading updated", message: "Dehydrator temperature is within the demo operating range.", type: "success", createdAt: Date.now() - 900000, read: false },
  { id: "n3", title: "Molder transfer completed", message: "4 of 6 molders loaded in this demo batch.", type: "success", createdAt: Date.now() - 3600000, read: true },
  { id: "n4", title: "Demo mode enabled", message: "These are sample records, not readings from your machine.", type: "warning", createdAt: Date.now() - 7200000, read: true }
];

const DEMO_HISTORY = [
  { id: "b-104", batchId: "EP-2026-0104", startedAt: "2026-10-28T07:12:00+08:00", endedAt: "2026-10-28T08:02:00+08:00", durationMinutes: 50, status: "Completed", molders: 6, maxTemperature: 64.2 },
  { id: "b-103", batchId: "EP-2026-0103", startedAt: "2026-10-27T15:20:00+08:00", endedAt: "2026-10-27T16:09:00+08:00", durationMinutes: 49, status: "Completed", molders: 6, maxTemperature: 63.8 },
  { id: "b-102", batchId: "EP-2026-0102", startedAt: "2026-10-27T10:03:00+08:00", endedAt: "2026-10-27T10:41:00+08:00", durationMinutes: 38, status: "Interrupted", molders: 3, maxTemperature: 67.1 },
  { id: "b-101", batchId: "EP-2026-0101", startedAt: "2026-10-26T13:15:00+08:00", endedAt: "2026-10-26T14:06:00+08:00", durationMinutes: 51, status: "Completed", molders: 6, maxTemperature: 62.9 },
  { id: "b-100", batchId: "EP-2026-0100", startedAt: "2026-10-26T09:04:00+08:00", endedAt: "2026-10-26T09:25:00+08:00", durationMinutes: 21, status: "Interrupted", molders: 2, maxTemperature: 71.5 }
];

const DEMO_TREND = [
  { time: "07:00", temperature: 38, humidity: 46 },
  { time: "07:10", temperature: 43, humidity: 43 },
  { time: "07:20", temperature: 49, humidity: 40 },
  { time: "07:30", temperature: 55, humidity: 36 },
  { time: "07:40", temperature: 59, humidity: 34 },
  { time: "07:50", temperature: 62, humidity: 31 },
  { time: "08:00", temperature: 61, humidity: 32 }
];

const PROCESS_STEPS = [
  "Grinding", "Raw material dispensing", "Mixing & cooking",
  "Molder dispensing", "Molder transfer", "Dehydrating"
];

function formatClock(value) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relativeTime(value) {
  if (!value) return "Time unavailable";
  const ms = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(ms)) return "Time unavailable";
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + " min ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " hr ago";
  return Math.floor(hours / 24) + " day ago";
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item, i) => ({ id: item.id || String(i), ...item }));
  return Object.entries(value).map(([id, item]) => ({ id, ...(item || {}) }));
}

function StatusPill({ children, tone = "neutral" }) {
  return <span className={"status-pill " + tone}><span className="pill-dot" />{children}</span>;
}

function MetricCard({ icon: Icon, label, value, unit, caption, tone = "green" }) {
  return (
    <article className="metric-card">
      <div className={"metric-icon " + tone}><Icon size={19} strokeWidth={1.9} /></div>
      <div className="metric-copy">
        <span className="metric-label">{label}</span>
        <div className="metric-value">{value}<small>{unit}</small></div>
        <span className="metric-caption">{caption}</span>
      </div>
    </article>
  );
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><CircleHelp size={24} /><strong>{title}</strong><span>{text}</span></div>;
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [live, setLive] = useState(isFirebaseConfigured ? null : DEMO_LIVE);
  const [notifications, setNotifications] = useState(isFirebaseConfigured ? [] : DEMO_NOTIFICATIONS);
  const [history, setHistory] = useState(isFirebaseConfigured ? [] : DEMO_HISTORY);
  const [trend, setTrend] = useState(isFirebaseConfigured ? [] : DEMO_TREND);
  const [firebaseError, setFirebaseError] = useState("");
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(Boolean(auth));
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");

  const demoMode = !isFirebaseConfigured;
  const isAdmin = Boolean(user);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const currentStatus = live?.status || live?.currentState || "Waiting for device";
  const machineOnline = demoMode ? true : Boolean(live && (live.online === true || live.isOnline === true));
  const currentProgress = Math.min(100, Math.max(0, Number(live?.progress || 0)));
  const visibleHistory = useMemo(
    () => historyFilter === "All" ? history : history.filter((item) => String(item.status || "").toLowerCase() === historyFilter.toLowerCase()),
    [history, historyFilter]
  );

  useEffect(() => {
    if (!db) return undefined;
    const stops = [];
    stops.push(onValue(ref(db, "ecopeel/live"), (snapshot) => {
      setLive(snapshot.exists() ? snapshot.val() : null);
      setFirebaseError("");
    }, () => setFirebaseError("Could not read live data. Check your Firebase Realtime Database rules.")));
    stops.push(onValue(ref(db, "ecopeel/notifications"), (snapshot) => {
      const rows = normalizeList(snapshot.val());
      rows.sort((a, b) => Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0));
      setNotifications(rows);
    }, () => setFirebaseError("Could not read notifications. Check your database rules.")));
    stops.push(onValue(ref(db, "ecopeel/telemetry"), (snapshot) => {
      const rows = normalizeList(snapshot.val());
      rows.sort((a, b) => new Date(a.timestamp || a.time || 0).getTime() - new Date(b.timestamp || b.time || 0).getTime());
      setTrend(rows.map((row) => ({
        ...row,
        time: row.time || formatClock(row.timestamp),
        temperature: Number(row.dehydratorTemperature ?? row.temperature ?? 0),
        humidity: Number(row.humidity ?? 0)
      })).slice(-24));
    }, () => {}));
    if (isAdmin) {
      stops.push(onValue(ref(db, "ecopeel/history"), (snapshot) => {
        const rows = normalizeList(snapshot.val());
        rows.sort((a, b) => new Date(b.startedAt || b.timestamp || 0).getTime() - new Date(a.startedAt || a.timestamp || 0).getTime());
        setHistory(rows);
      }, () => setFirebaseError("Could not read history. Check admin database permissions.")));
    } else {
      setHistory([]);
    }
    return () => stops.forEach((stop) => stop());
  }, [isAdmin]);

  useEffect(() => {
    if (!auth) return undefined;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setAuthChecking(false);
        return;
      }
      try {
        const result = await firebaseUser.getIdTokenResult();
        if (result.claims.admin === true) {
          setUser(firebaseUser);
        } else {
          setUser(null);
          await signOut(auth);
        }
      } catch {
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    });
    return unsubscribe;
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    if (!auth) {
      setLoginError("Connect EcoPeel to Firebase first. Admin sign-in is unavailable in demo mode.");
      return;
    }
    if (!loginIdentifier.trim() || !password) {
      setLoginError("Enter your admin email and password.");
      return;
    }
    setLoginBusy(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, loginIdentifier.trim(), password);
      const result = await credential.user.getIdTokenResult(true);
      if (result.claims.admin !== true) {
        await signOut(auth);
        setLoginError("This account is not authorized as an EcoPeel administrator.");
        return;
      }
      setUser(credential.user);
      setPage("dashboard");
    } catch (error) {
      const messages = {
        "auth/invalid-credential": "The email or password is incorrect.",
        "auth/user-not-found": "No admin account was found for that email.",
        "auth/wrong-password": "The password is incorrect.",
        "auth/too-many-requests": "Too many attempts. Try again later."
      };
      setLoginError(messages[error.code] || "Sign-in failed. Check Firebase Authentication settings.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    if (auth) await signOut(auth);
    setUser(null);
    setPage("dashboard");
  }

  function navigate(nextPage) {
    if ((nextPage === "history" || nextPage === "analytics") && !isAdmin) {
      setPage("login");
    } else {
      setPage(nextPage);
    }
    setSidebarOpen(false);
  }

  const navItems = [
    { id: "dashboard", label: "Live dashboard", icon: LayoutDashboard, section: "MONITORING" },
    { id: "machine", label: "Machine status", icon: Factory },
    { id: "notifications", label: "Notifications", icon: Bell, count: unreadCount },
    ...(isAdmin ? [
      { id: "history", label: "Production history", icon: History, section: "ADMINISTRATION" },
      { id: "analytics", label: "Analytics", icon: TrendingUp }
    ] : [])
  ];

  return (
    <div className="app-shell">
      {sidebarOpen && <button aria-label="Close navigation" className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark"><Leaf size={22} fill="currentColor" /></div>
          <div><div className="brand-name">EcoPeel</div><div className="brand-subtitle">BIOPLASTIC SYSTEMS</div></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="sidebar-project">
          <span className="project-avatar"><Factory size={16} /></span>
          <span><strong>Bioplastic machine</strong><small>Monitoring station 01</small></span>
          <ChevronDown size={15} className="project-chevron" />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <div key={item.id}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <button className={"nav-item " + (page === item.id ? "active" : "")} onClick={() => navigate(item.id)}>
                <item.icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.count > 0 && <span className="nav-count">{item.count}</span>}
                {page === item.id && <span className="nav-active-line" />}
              </button>
            </div>
          ))}
          {!isAdmin && <div className="nav-section admin-section">ADMINISTRATION</div>}
          {!isAdmin && (
            <button className={"nav-item " + (page === "login" ? "active" : "")} onClick={() => navigate("login")}>
              <ShieldCheck size={18} strokeWidth={1.8} /><span>Admin sign in</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><div className="help-icon"><CircleHelp size={18} /></div><div><strong>Need assistance?</strong><span>View system information</span></div><ChevronRight size={16} /></div>
          <div className="sidebar-profile">
            <div className="profile-avatar">{isAdmin ? (user.email || "A").slice(0, 1).toUpperCase() : "EP"}</div>
            <div className="profile-details"><strong>{isAdmin ? "EcoPeel Admin" : "Public viewer"}</strong><span>{isAdmin ? "Administrator access" : "Read-only access"}</span></div>
            {isAdmin ? <button aria-label="Log out" className="icon-button" onClick={handleLogout}><LogOut size={17} /></button> : <ShieldCheck size={17} className="profile-lock" />}
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
            <div className="breadcrumbs"><span>EcoPeel</span><ChevronRight size={14} /><strong>{page === "dashboard" ? "Live dashboard" : page === "machine" ? "Machine status" : page === "notifications" ? "Notifications" : page === "history" ? "Production history" : page === "analytics" ? "Analytics" : "Admin sign in"}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="updated-label"><span className={"connection-dot " + (machineOnline ? "" : "offline")} />{demoMode ? "Preview environment" : machineOnline ? "Device connected" : "Waiting for device"}</div>
            {demoMode && <span className="demo-badge">DEMO DATA</span>}
            {isAdmin ? <button className="topbar-avatar" title="Sign out" onClick={handleLogout}>{(user.email || "A").slice(0, 1).toUpperCase()}</button> : <button className="topbar-login" onClick={() => navigate("login")}><ShieldCheck size={16} /> Admin</button>}
          </div>
        </header>

        {demoMode && <div className="demo-banner"><AlertTriangle size={16} /><span><strong>Preview data is active.</strong> Values and records are examples for interface testing, not live machine readings.</span></div>}
        {firebaseError && <div className="error-banner"><AlertTriangle size={16} /><span>{firebaseError}</span></div>}

        {page === "dashboard" && (
          <div className="page-content">
            <div className="page-heading">
              <div><div className="eyebrow">MONITORING OVERVIEW</div><h1>Good day, welcome to EcoPeel</h1><p>Monitor your banana-peel bioplastic production process in real time.</p></div>
              <div className="heading-actions"><span className="date-chip"><Clock3 size={15} /> {new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span><button className="refresh-button" onClick={() => window.location.reload()}><Activity size={16} /> Refresh view</button></div>
            </div>

            <div className="overview-strip">
              <div className="overview-label"><span className="overview-pulse" /><div><strong>Machine overview</strong><small>{demoMode ? "Sample machine status" : live ? "Latest Firebase status" : "Waiting for first device update"}</small></div></div>
              <div className="overview-divider" />
              <div className="overview-stat"><span>Current state</span><strong>{currentStatus}</strong></div>
              <div className="overview-stat"><span>Current process</span><strong>{live?.currentStep || live?.process || (live ? currentStatus : "No data yet")}</strong></div>
              <div className="overview-stat"><span>Last update</span><strong>{live ? relativeTime(live.updatedAt || live.timestamp) : "No update yet"}</strong></div>
              <div className="overview-end"><StatusPill tone={machineOnline ? "success" : "warning"}>{demoMode ? "Demo online" : machineOnline ? "Online" : "Offline"}</StatusPill></div>
            </div>

            <div className="section-heading"><div><h2>Live sensor readings</h2><p>Key temperatures and environmental conditions</p></div><span className="section-note"><span className="live-dot" /> Live data</span></div>
            <div className="metric-grid">
              <MetricCard icon={Thermometer} label="Mixing temperature" value={live?.temperature ?? live?.mixingTemperature ?? "—"} unit={live?.temperature != null || live?.mixingTemperature != null ? "°C" : ""} caption="Cooking and mixing unit" tone="green" />
              <MetricCard icon={Thermometer} label="Dehydrator temperature" value={live?.dehydratorTemperature ?? "—"} unit={live?.dehydratorTemperature != null ? "°C" : ""} caption="Drying chamber" tone="orange" />
              <MetricCard icon={Droplet} label="Dehydrator humidity" value={live?.humidity ?? "—"} unit={live?.humidity != null ? "%" : ""} caption="Relative humidity" tone="blue" />
              <MetricCard icon={Factory} label="Molders loaded" value={live ? (live.loadedMolders ?? 0) + " / " + (live.targetMolders ?? 6) : "—"} unit="" caption="Dehydrator capacity" tone="purple" />
            </div>

            <div className="dashboard-grid">
              <section className="panel temperature-panel">
                <div className="panel-header"><div><h3>Dehydrator environment</h3><p>Temperature and humidity trend</p></div><span className="chart-period">Recent readings <ChevronDown size={14} /></span></div>
                {trend.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="temperatureFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#43875e" stopOpacity={0.18} /><stop offset="100%" stopColor="#43875e" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eee7" /><XAxis dataKey="time" tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebe2", fontSize: 12 }} /><Area type="monotone" dataKey="temperature" name="Temperature °C" stroke="#43875e" strokeWidth={2.5} fill="url(#temperatureFill)" /><Area type="monotone" dataKey="humidity" name="Humidity %" stroke="#5d91c9" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div> : <EmptyState title="No sensor history yet" text="Telemetry readings will appear here when the ESP32 starts sending data to Firebase." />}
                <div className="chart-legend"><span><i className="legend-line green-line" /> Temperature (°C)</span><span><i className="legend-line blue-line" /> Humidity (%)</span></div>
              </section>

              <section className="panel process-panel">
                <div className="panel-header"><div><h3>Production workflow</h3><p>Process progress at a glance</p></div><span className="workflow-icon"><Activity size={17} /></span></div>
                <div className="workflow-progress"><div className="workflow-progress-top"><span>Current batch</span><strong>{currentProgress}%</strong></div><div className="progress-track"><div className="progress-value" style={{ width: currentProgress + "%" }} /></div></div>
                <div className="process-list">
                  {PROCESS_STEPS.map((step, index) => {
                    const currentStep = String(live?.currentStep || live?.process || live?.status || "").toLowerCase();
                    const matchIndex = PROCESS_STEPS.findIndex((label) => currentStep.includes(label.toLowerCase().split(" ")[0]));
                    const activeIndex = matchIndex >= 0 ? matchIndex : (demoMode ? 5 : -1);
                    const complete = activeIndex >= 0 && index < activeIndex;
                    const active = index === activeIndex;
                    return <div className={"process-step " + (complete ? "complete" : "") + (active ? " current" : "")} key={step}><div className="step-marker">{complete ? <CheckCircle2 size={16} /> : <span>{index + 1}</span>}</div><div className="step-label"><strong>{step}</strong>{active && <small>Current stage</small>}</div>{active && <span className="step-active-tag">Active</span>}</div>;
                  })}
                </div>
                <button className="text-link" onClick={() => navigate("machine")}>View machine details <ChevronRight size={15} /></button>
              </section>
            </div>

            <div className="bottom-grid">
              <section className="panel alerts-panel">
                <div className="panel-header"><div><h3>Recent notifications</h3><p>System alerts and process updates</p></div><button className="text-link" onClick={() => navigate("notifications")}>View all <ChevronRight size={15} /></button></div>
                {notifications.length ? <div className="notification-list compact-list">{notifications.slice(0, 3).map((item) => <NotificationRow key={item.id} item={item} />)}</div> : <EmptyState title="No notifications" text="New alerts will appear here when recorded in Firebase." />}
              </section>
              <section className="panel capacity-panel">
                <div className="panel-header"><div><h3>Dehydrator capacity</h3><p>Molder loading progress</p></div><Factory size={18} className="muted-icon" /></div>
                <div className="capacity-number"><strong>{live?.loadedMolders ?? (demoMode ? 4 : 0)}</strong><span>/ {live?.targetMolders ?? 6} molders loaded</span></div>
                <div className="capacity-slots">{Array.from({ length: Number(live?.targetMolders ?? 6) || 6 }, (_, i) => <span key={i} className={i < Number(live?.loadedMolders ?? (demoMode ? 4 : 0)) ? "slot filled" : "slot"} />)}</div>
                <div className="capacity-footer"><span><i className="slot-key filled-key" /> Loaded</span><span><i className="slot-key empty-key" /> Available</span></div>
              </section>
            </div>
            <footer className="page-footer"><span>© 2026 EcoPeel · Banana-peel bioplastic machine monitoring</span><span><ShieldCheck size={14} /> Read-only monitoring portal</span></footer>
          </div>
        )}

        {page === "machine" && (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow">DEVICE DETAILS</div><h1>Machine status</h1><p>Current operating state and sensor health for the EcoPeel machine.</p></div><StatusPill tone={machineOnline ? "success" : "warning"}>{demoMode ? "Demo environment" : machineOnline ? "Connected" : "Waiting for device"}</StatusPill></div>
            <div className="status-summary-card"><div className="machine-status-emblem"><Factory size={28} /></div><div className="machine-status-main"><span className="metric-label">CURRENT MACHINE STATE</span><h2>{currentStatus}</h2><p>{live?.currentStep || live?.process || "Waiting for process state data."}</p></div><div className="machine-status-meta"><span>Latest update</span><strong>{live ? formatDate(live.updatedAt || live.timestamp) : "No data received"}</strong><StatusPill tone={machineOnline ? "success" : "warning"}>{machineOnline ? "Connected" : "Offline"}</StatusPill></div></div>
            <div className="section-heading"><div><h2>Operating sensors</h2><p>Values reported by the controller</p></div></div>
            <div className="metric-grid"><MetricCard icon={Thermometer} label="Mixing temperature" value={live?.temperature ?? live?.mixingTemperature ?? "—"} unit={live?.temperature != null || live?.mixingTemperature != null ? "°C" : ""} caption="DS18B20 / cooking vessel" /><MetricCard icon={Thermometer} label="Dehydrator temperature" value={live?.dehydratorTemperature ?? "—"} unit={live?.dehydratorTemperature != null ? "°C" : ""} caption="Dehydrator chamber" tone="orange" /><MetricCard icon={Droplet} label="Humidity" value={live?.humidity ?? "—"} unit={live?.humidity != null ? "%" : ""} caption="Dehydrator chamber" tone="blue" /><MetricCard icon={Gauge} label="Process progress" value={live ? currentProgress : "—"} unit={live ? "%" : ""} caption="Current batch" tone="purple" /></div>
            <div className="panel workflow-full-panel"><div className="panel-header"><div><h3>Production sequence</h3><p>Process states reported or expected by the machine controller</p></div></div><div className="full-process-grid">{PROCESS_STEPS.map((step, i) => <div key={step} className="full-process-card"><span className="full-step-index">0{i + 1}</span><strong>{step}</strong><span className="full-step-status">{String(live?.currentStep || live?.process || live?.status || "").toLowerCase().includes(step.toLowerCase().split(" ")[0]) ? "Current stage" : "Awaiting status mapping"}</span></div>)}</div></div>
            <div className="page-footer"><span>Machine actions are not available from this website.</span><span><ShieldCheck size={14} /> Hardware safety stays on the controller</span></div>
          </div>
        )}

        {page === "notifications" && (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow">SYSTEM MESSAGES</div><h1>Notifications</h1><p>Review process events, warnings, and machine updates.</p></div><div className="notification-count-card"><Bell size={17} /><strong>{unreadCount}</strong><span>unread</span></div></div>
            <section className="panel notifications-page-panel"><div className="panel-header"><div><h3>All notifications</h3><p>{notifications.length} notification record{notifications.length === 1 ? "" : "s"}</p></div></div>{notifications.length ? <div className="notification-list">{notifications.map((item) => <NotificationRow key={item.id} item={item} expanded />)}</div> : <EmptyState title="No notifications yet" text="When the controller or ESP32 records a notification in Firebase, it will be listed here." />}</section>
            <div className="page-footer"><span>Notifications are currently read-only.</span><span><Bell size={14} /> {demoMode ? "Example messages" : "Firebase notification stream"}</span></div>
          </div>
        )}

        {page === "history" && isAdmin && (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow">BATCH RECORDS</div><h1>Production history</h1><p>Review past batches and their recorded outcomes.</p></div><div className="heading-actions"><span className="date-chip"><History size={15} /> {history.length} records</span></div></div>
            <div className="metric-grid history-metrics"><MetricCard icon={CheckCircle2} label="Completed batches" value={history.filter((r) => String(r.status).toLowerCase() === "completed").length} unit="" caption="From available records" /><MetricCard icon={AlertTriangle} label="Interrupted batches" value={history.filter((r) => String(r.status).toLowerCase() === "interrupted").length} unit="" caption="Review for issues" tone="orange" /><MetricCard icon={Factory} label="Molders produced" value={history.reduce((sum, r) => sum + Number(r.molders || r.loadedMolders || 0), 0)} unit="" caption="Across listed batches" tone="blue" /><MetricCard icon={Clock3} label="Average cycle time" value={history.length ? Math.round(history.reduce((sum, r) => sum + Number(r.durationMinutes || 0), 0) / history.length) : "—"} unit={history.length ? " min" : ""} caption="Based on stored durations" tone="purple" /></div>
            <section className="panel history-panel"><div className="panel-header"><div><h3>Batch records</h3><p>Production activity log</p></div><select className="filter-select" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}><option>All</option><option>Completed</option><option>Interrupted</option></select></div>
              {visibleHistory.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Batch ID</th><th>Started</th><th>Finished</th><th>Duration</th><th>Molders</th><th>Max. temperature</th><th>Status</th></tr></thead><tbody>{visibleHistory.map((row) => <tr key={row.id || row.batchId}><td><strong>{row.batchId || row.id || "Batch"}</strong></td><td>{formatDate(row.startedAt || row.timestamp)}</td><td>{formatDate(row.endedAt || row.completedAt)}</td><td>{row.durationMinutes != null ? row.durationMinutes + " min" : "—"}</td><td>{row.molders ?? row.loadedMolders ?? "—"}</td><td>{row.maxTemperature != null ? row.maxTemperature + " °C" : "—"}</td><td><StatusPill tone={String(row.status).toLowerCase() === "completed" ? "success" : String(row.status).toLowerCase() === "interrupted" ? "warning" : "neutral"}>{row.status || "Unknown"}</StatusPill></td></tr>)}</tbody></table></div> : <EmptyState title="No production history" text="When the ESP32 writes completed or interrupted batches to Firebase, they will show here." />}
            </section>
            {demoMode && <div className="info-banner"><AlertTriangle size={16} /><span>These sample history records are for layout testing only. They are not real production records.</span></div>}
            <div className="page-footer"><span>History access is restricted to authenticated administrators.</span><span><ShieldCheck size={14} /> Admin view</span></div>
          </div>
        )}

        {page === "analytics" && isAdmin && (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow">PRODUCTION INSIGHTS</div><h1>Analytics</h1><p>Understand dehydrator conditions and recent batch outcomes.</p></div><span className="date-chip"><TrendingUp size={15} /> Recent activity</span></div>
            <div className="metric-grid"><MetricCard icon={CheckCircle2} label="Success rate" value={history.length ? Math.round(history.filter((r) => String(r.status).toLowerCase() === "completed").length / history.length * 100) : "—"} unit={history.length ? "%" : ""} caption="Recorded batch outcomes" /><MetricCard icon={Factory} label="Total molders" value={history.reduce((sum, r) => sum + Number(r.molders || r.loadedMolders || 0), 0)} unit="" caption="Across visible history" tone="blue" /><MetricCard icon={Thermometer} label="Highest recorded temperature" value={history.length ? Math.max(...history.map((r) => Number(r.maxTemperature || 0))) : "—"} unit={history.length ? "°C" : ""} caption="Stored batch maximum" tone="orange" /><MetricCard icon={Clock3} label="Average batch duration" value={history.length ? Math.round(history.reduce((sum, r) => sum + Number(r.durationMinutes || 0), 0) / history.length) : "—"} unit={history.length ? " min" : ""} caption="Based on stored durations" tone="purple" /></div>
            <section className="panel analytics-chart-panel"><div className="panel-header"><div><h3>Dehydrator readings</h3><p>Temperature and humidity from telemetry</p></div></div>{trend.length ? <div className="chart-wrap large-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eee7" /><XAxis dataKey="time" tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebe2", fontSize: 12 }} /><Area type="monotone" dataKey="temperature" name="Temperature °C" stroke="#43875e" fill="#43875e" fillOpacity={0.10} strokeWidth={2.5} /><Area type="monotone" dataKey="humidity" name="Humidity %" stroke="#5d91c9" fill="#5d91c9" fillOpacity={0.06} strokeWidth={2} /></AreaChart></ResponsiveContainer></div> : <EmptyState title="No telemetry data" text="Connect Firebase and start storing sensor readings to show trends." />}</section>
            <section className="panel analytics-chart-panel"><div className="panel-header"><div><h3>Batch outcomes</h3><p>Completed and interrupted batches in the available records</p></div></div>{history.length ? <div className="chart-wrap large-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ outcome: "Completed", count: history.filter((r) => String(r.status).toLowerCase() === "completed").length }, { outcome: "Interrupted", count: history.filter((r) => String(r.status).toLowerCase() === "interrupted").length }]} margin={{ top: 14, right: 10, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eee7" /><XAxis dataKey="outcome" tick={{ fill: "#89938a", fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebe2", fontSize: 12 }} /><Bar dataKey="count" name="Batches" fill="#43875e" radius={[6, 6, 0, 0]} barSize={54} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No batch outcome data" text="Stored production history will be summarized here." />}</section>
            {demoMode && <div className="info-banner"><AlertTriangle size={16} /><span>Analytics are based on illustrative demo records until real data is available.</span></div>}
          </div>
        )}

        {page === "login" && (
          <div className="login-page">
            <div className="login-card">
              <div className="login-brand-mark"><Leaf size={27} fill="currentColor" /></div>
              <div className="eyebrow">RESTRICTED AREA</div>
              <h1>Administrator sign in</h1>
              <p className="login-description">Sign in with your authorized EcoPeel administrator account to access production history and analytics.</p>
              {demoMode && <div className="login-demo-notice"><AlertTriangle size={16} /><span>Firebase is not configured yet. Demo mode is for interface testing; admin sign-in will become available after Firebase setup.</span></div>}
              <form className="login-form" onSubmit={handleLogin}>
                <label htmlFor="adminEmail">Admin email</label>
                <input id="adminEmail" type="email" autoComplete="username" placeholder="admin@example.com" value={loginIdentifier} onChange={(e) => setLoginIdentifier(e.target.value)} required />
                <label htmlFor="adminPassword">Password</label>
                <input id="adminPassword" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                {loginError && <div className="login-error"><AlertTriangle size={16} />{loginError}</div>}
                <button className="sign-in-button" disabled={loginBusy || authChecking || demoMode} type="submit">{loginBusy ? "Signing in…" : <><LogIn size={17} /> Sign in securely</>}</button>
              </form>
              <div className="login-security"><ShieldCheck size={16} /><span>Admin access is verified through Firebase Authentication and an administrator custom claim.</span></div>
              <button className="back-link" onClick={() => setPage("dashboard")}>← Back to public dashboard</button>
            </div>
          </div>
        )}

        <div className="mobile-bottom-spacer" />
      </main>
    </div>
  );
}

function NotificationRow({ item, expanded = false }) {
  const type = String(item.type || item.level || "info").toLowerCase();
  const Icon = type.includes("warn") || type.includes("fault") || type.includes("error") ? AlertTriangle : type.includes("success") || type.includes("complete") ? CheckCircle2 : Bell;
  const tone = type.includes("warn") || type.includes("fault") || type.includes("error") ? "warning" : type.includes("success") || type.includes("complete") ? "success" : "info";
  return (
    <div className={"notification-row " + (!item.read ? "unread" : "")}>
      <div className={"notification-icon " + tone}><Icon size={17} /></div>
      <div className="notification-content"><div className="notification-title-line"><strong>{item.title || item.event || "Machine update"}</strong>{!item.read && <span className="unread-dot" />}</div><p>{item.message || item.description || item.details || "A machine event was recorded."}</p>{expanded && item.details && item.message && <small>{item.details}</small>}</div>
      <time>{relativeTime(item.createdAt || item.timestamp)}</time>
    </div>
  );
}
