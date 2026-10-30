import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bell, CalendarClock, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock3,
  Droplet, Factory, Gauge, History, Layers, LayoutDashboard, Banana, Info, LogIn,
  LogOut, Menu, Power, Search, ShieldCheck, Thermometer, Trash2, Wifi, WifiOff,
  Wind, X, Database, GitBranch, Cpu, Server, ArrowLeftRight
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import {
  EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential,
  signInWithEmailAndPassword, signOut, updatePassword
} from "firebase/auth";
import { get, onValue, push, ref, remove, update } from "firebase/database";
import { auth, db, isFirebaseConfigured } from "./firebase.js";

const DEMO_LIVE = {
  status: "Dehydrating",
  machineOn: true,
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
  { id: "n3", title: "Molder Transfer Completed", message: "4 of 6 molders loaded in this demo batch.", type: "success", createdAt: Date.now() - 3600000, read: true },
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
  "Grinding", "Raw Material Dispensing", "Mixing & Cooking",
  "Molder Dispensing", "Molder Transfer", "Dehydrating"
];

const MATERIAL_SENSORS = [
  { key: "water", label: "Water", sensorType: "Non-contact liquid sensor", Icon: Droplet },
  { key: "vinegar", label: "Vinegar", sensorType: "Non-contact liquid sensor", Icon: Droplet },
  { key: "glycerin", label: "Glycerin", sensorType: "Non-contact liquid sensor", Icon: Droplet },
  { key: "cornStarch", label: "Corn starch", sensorType: "IR sensor", Icon: Activity }
];

const NOTIFICATION_FILTERS = [
  { value: "all", label: "All notification types" },
  { value: "malfunction", label: "Malfunction" },
  { value: "empty_chamber", label: "Empty chamber" },
  { value: "no_molder", label: "No molder" },
  { value: "over_temperature", label: "Over temperature" },
  { value: "batch_done", label: "Batch done" },
  { value: "empty_material", label: "Empty material" },
  { value: "other", label: "Other / general" }
];

function getMaterialSensorStatus(live, sensorKey) {
  if (!live) return "unknown";
  const aliases = sensorKey === "cornStarch"
    ? ["cornStarch", "corn_starch", "corn starch", "cornStarchSensor", "cornStarchIR"]
    : [sensorKey, sensorKey + "Sensor"];
  const sources = [
    live.materialSensors,
    live.materials,
    live.ingredientSensors,
    live.ingredients
  ].filter((source) => source && typeof source === "object");

  let value;
  let found = false;
  for (const source of sources) {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(source, alias)) {
        value = source[alias];
        found = true;
        break;
      }
    }
    if (found) break;
  }

  const directEmptyKeys = [
    sensorKey + "Empty",
    sensorKey.charAt(0).toLowerCase() + sensorKey.slice(1) + "_empty"
  ];
  if (!found) {
    const directKey = directEmptyKeys.find((key) => typeof live[key] === "boolean");
    if (directKey) return live[directKey] ? "empty" : "available";
  }
  if (!found) {
    const directLevelKeys = [sensorKey + "Level", sensorKey + "_level"];
    const directLevelKey = directLevelKeys.find((key) => typeof live[key] === "string");
    if (directLevelKey) value = live[directLevelKey];
    else return "unknown";
  }

  if (typeof value === "string") {
    const state = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (["empty", "not_available", "not_present", "low", "dry"].includes(state)) return "empty";
    if (["available", "present", "ok", "normal", "full", "detected", "occupied", "not_empty"].includes(state)) return "available";
    return "unknown";
  }
  if (!value || typeof value !== "object") return "unknown";
  if (typeof value.empty === "boolean") return value.empty ? "empty" : "available";
  if (typeof value.isEmpty === "boolean") return value.isEmpty ? "empty" : "available";
  if (typeof value.available === "boolean") return value.available ? "available" : "empty";
  if (typeof value.present === "boolean") return value.present ? "available" : "empty";
  if (typeof value.detected === "boolean") return value.detected ? "available" : "empty";
  if (typeof value.status === "string") return getMaterialSensorStatus({ materialSensors: { [sensorKey]: value.status } }, sensorKey);
  if (typeof value.state === "string") return getMaterialSensorStatus({ materialSensors: { [sensorKey]: value.state } }, sensorKey);
  if (typeof value.level === "string") return getMaterialSensorStatus({ materialSensors: { [sensorKey]: value.level } }, sensorKey);
  return "unknown";
}

function getNotificationCategory(item) {
  const text = [
    item.category, item.eventType, item.type, item.title, item.event,
    item.message, item.description, item.details
  ].filter(Boolean).join(" ").toLowerCase().replace(/[_-]+/g, " ");

  if (/emergency stop|e stop|estop|emergency halt/.test(text)) return "malfunction";
  if (/over temperature|overtemp|over temp|temperature too high|high temperature|temperature limit/.test(text)) return "over_temperature";
  if (/empty chamber|chamber empty|dehydrator chamber empty/.test(text)) return "empty_chamber";
  if (/no molder|no mould|molder missing|mould(er)? missing|zero molders/.test(text)) return "no_molder";
  if (/batch done|batch complete|batch completed|production complete|cycle complete/.test(text)) return "batch_done";
  if (/empty material|material empty|water is empty|water tank empty|vinegar is empty|vinegar tank empty|glycerin is empty|glycerin tank empty|corn starch is empty|corn starch empty|reservoir empty/.test(text)) return "empty_material";
  if (/malfunction|fault|failure|system error|machine error/.test(text)) return "malfunction";

  const type = String(item.type || item.level || "").toLowerCase();
  if (type.includes("fault") || type.includes("error")) return "malfunction";
  if (type.includes("complete") || type.includes("success")) return "batch_done";
  return "other";
}

function notificationCategoryLabel(category) {
  return NOTIFICATION_FILTERS.find((entry) => entry.value === category)?.label || "Other / general";
}

function getCurrentStepIndex(live) {
  if (!live) return null;
  const text = [
    live.currentStep, live.process, live.status, live.currentState, live.machineState
  ].filter((value) => typeof value === "string").join(" ").trim().toLowerCase();

  if (!text) return null;
  if (/raw material|water dispensing|glycerin|corn starch|vinegar dispensing|dispensing raw/.test(text)) return 1;
  if (/molder dispensing|dispensing molder/.test(text)) return 3;
  if (/molder transfer|transfer molder|transferring molder|linear actuator|lift motor|layer position|transfer(?!ring?)/.test(text)) return 4;
  if (/mixing|mix(?:ing)?\b|cooking|cook(?:ing)?\b/.test(text)) return 2;
  if (/dehydrat|dehydration|drying|dry cycle/.test(text)) return 5;
  if (/grind|pulver/.test(text)) return 0;
  return null;
}

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

function getManilaDateParts(value) {
  if (value === undefined || value === null || value === "") return null;
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    date = new Date(value > 0 && value < 1e12 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, part.value])
  );
}

function getDateKey(parts) {
  return parts ? parts.year + "-" + parts.month + "-" + parts.day : "";
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item, i) => ({ id: item?.id || String(i), ...(item || {}), firebaseKey: String(i) }));
  }
  return Object.entries(value).map(([id, item]) => ({ id, ...(item || {}), firebaseKey: id }));
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
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(Boolean(auth));
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [deletingHistoryId, setDeletingHistoryId] = useState(null);
  const [historyActionError, setHistoryActionError] = useState("");
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [notificationActionError, setNotificationActionError] = useState("");
  const [notificationBusyKey, setNotificationBusyKey] = useState(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [batchCountPeriod, setBatchCountPeriod] = useState("day");
  const [moldersPeriod, setMoldersPeriod] = useState("day");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const demoMode = !isFirebaseConfigured;
  const isAdmin = Boolean(user);

  const materialSensorStates = useMemo(
    () => MATERIAL_SENSORS.map((sensor) => ({ ...sensor, status: getMaterialSensorStatus(live, sensor.key) })),
    [live]
  );
  const materialSensorSignature = materialSensorStates.map((sensor) => sensor.key + ":" + sensor.status).join("|");
  const notificationRecords = notifications.filter((item) => !item.systemRecord && !item._systemRecord);
  const notificationTotal = notificationRecords.length;
  const resolvedNotificationCount = notificationRecords.filter((item) => item.active === false).length;
  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !item.systemRecord && !item._systemRecord &&
      (notificationFilter === "all" || getNotificationCategory(item) === notificationFilter)),
    [notifications, notificationFilter]
  );
  const unreadCount = notificationRecords.filter((item) => !item.read).length;
  const currentStatus = live?.status || live?.currentState || "Waiting for device";
  const machineOnline = demoMode ? true : Boolean(live && (live.online === true || live.isOnline === true));
  const explicitPowerState = [
    live?.machineOn, live?.isMachineOn, live?.powerOn, live?.isOn
  ].find((value) => typeof value === "boolean");
  const reportedMachineState = String(
    live?.machineState || live?.currentState || live?.status || live?.process || ""
  ).trim().toLowerCase();
  const activeProcessText = String(
    live?.currentStep || live?.process || live?.status || live?.currentState || ""
  ).trim().toLowerCase();
  const machinePowerOn = typeof explicitPowerState === "boolean"
    ? explicitPowerState
    : !live || !reportedMachineState
      ? null
      : /^(off|machine off|stopped|stop|idle|standby|shutdown|shut down|not running|emergency stop|e-stop|estop)$/.test(reportedMachineState)
        ? false
        : /^(on|machine on|running|operating|active)$/.test(reportedMachineState) ||
          ["grind", "dispens", "mix", "cook", "molder", "dehydrat", "transfer"].some((term) => activeProcessText.includes(term))
          ? true
          : null;
  const currentStepIndex = getCurrentStepIndex(live);
  const hasReportedProgress = live?.progress !== undefined && live?.progress !== null &&
    live?.progress !== "" && Number.isFinite(Number(live.progress));
  const currentProgress = hasReportedProgress
    ? Math.min(100, Math.max(0, Number(live.progress)))
    : currentStepIndex !== null
      ? Math.round((currentStepIndex / PROCESS_STEPS.length) * 100)
      : 0;
  const hasProgressData = hasReportedProgress || currentStepIndex !== null;
  const visibleHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return history.filter((item) => {
      const statusMatches = historyFilter === "All" ||
        String(item.status || "").toLowerCase() === historyFilter.toLowerCase();
      if (!statusMatches) return false;
      if (!query) return true;

      const searchableValues = [
        item.batchId, item.id, item.status,
        formatDate(item.startedAt || item.timestamp),
        formatDate(item.endedAt || item.completedAt || item.finishedAt),
        item.durationMinutes, item.molders, item.loadedMolders
      ];
      return searchableValues.some((value) =>
        value !== undefined && value !== null &&
        String(value).toLowerCase().includes(query)
      );
    });
  }, [history, historyFilter, historySearch]);
  const historyPageSize = 5;
  const historyPageCount = Math.max(1, Math.ceil(visibleHistory.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistory = useMemo(() => {
    const start = (currentHistoryPage - 1) * historyPageSize;
    return visibleHistory.slice(start, start + historyPageSize);
  }, [visibleHistory, currentHistoryPage]);

  const productionBatchCount = useMemo(() => {
    const nowParts = getManilaDateParts(Date.now());
    if (!nowParts) return 0;
    const todayKey = getDateKey(nowParts);
    const monthKey = nowParts.year + "-" + nowParts.month;
    const todayUtc = new Date(Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day)));
    const weekday = todayUtc.getUTCDay();
    todayUtc.setUTCDate(todayUtc.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    const weekStartKey = todayUtc.toISOString().slice(0, 10);

    return history.filter((row) => {
      if (String(row.status || "").trim().toLowerCase() !== "completed") return false;
      // Exclude only records explicitly marked as test data. A batch ID alone
      // should not hide a completed record from the period count.
      if (row.isTest === true) return false;

      const completedAt = row.endedAt || row.completedAt || row.finishedAt ||
        row.completedTimestamp || row.timestamp || row.startedAt;
      const parts = getManilaDateParts(completedAt);
      if (!parts) return false;
      const key = getDateKey(parts);

      if (batchCountPeriod === "day") return key === todayKey;
      if (batchCountPeriod === "week") return key >= weekStartKey && key <= todayKey;
      if (batchCountPeriod === "month") return parts.year + "-" + parts.month === monthKey && key <= todayKey;
      if (batchCountPeriod === "year") return parts.year === nowParts.year && key <= todayKey;
      return false;
    }).length;
  }, [history, batchCountPeriod]);

  const totalMoldersByPeriod = useMemo(() => {
    const nowParts = getManilaDateParts(Date.now());
    if (!nowParts) return 0;
    const todayKey = getDateKey(nowParts);
    const monthKey = nowParts.year + "-" + nowParts.month;
    const todayUtc = new Date(Date.UTC(Number(nowParts.year), Number(nowParts.month) - 1, Number(nowParts.day)));
    const weekday = todayUtc.getUTCDay();
    todayUtc.setUTCDate(todayUtc.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
    const weekStartKey = todayUtc.toISOString().slice(0, 10);

    return history.reduce((total, row) => {
      if (row.isTest === true) return total;
      const batchDate = row.endedAt || row.completedAt || row.finishedAt ||
        row.completedTimestamp || row.timestamp || row.startedAt;
      const parts = getManilaDateParts(batchDate);
      if (!parts) return total;
      const key = getDateKey(parts);
      const inPeriod = moldersPeriod === "day"
        ? key === todayKey
        : moldersPeriod === "week"
          ? key >= weekStartKey && key <= todayKey
          : moldersPeriod === "month"
            ? parts.year + "-" + parts.month === monthKey && key <= todayKey
            : moldersPeriod === "year"
              ? parts.year === nowParts.year && key <= todayKey
              : false;
      if (!inPeriod) return total;

      const count = Number(row.molders ?? row.loadedMolders ?? 0);
      return total + (Number.isFinite(count) ? count : 0);
    }, 0);
  }, [history, moldersPeriod]);

  useEffect(() => {
    if (!db) return undefined;
    const stops = [];
    stops.push(onValue(ref(db, ".info/connected"), (snapshot) => {
      setFirebaseConnected(snapshot.val() === true);
    }, () => setFirebaseConnected(false)));
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
    if (!db || !isAdmin) return undefined;
    let cancelled = false;

    async function syncMaterialNotifications() {
      try {
        const snapshot = await get(ref(db, "ecopeel/notifications"));
        if (cancelled) return;
        const rows = normalizeList(snapshot.val()).filter((row) => !row.systemRecord && !row._systemRecord);

        for (const sensor of materialSensorStates) {
          if (cancelled) return;
          const related = rows.filter((row) => row.autoGenerated === true && row.materialKey === sensor.key);
          const activeAlert = related.find((row) => row.active !== false);
          if (sensor.status === "empty" && !activeAlert) {
            const created = await push(ref(db, "ecopeel/notifications"), {
              title: sensor.label + " is empty",
              message: "The " + sensor.label.toLowerCase() + " sensor reports an empty supply. Refill or replenish it before starting the relevant process.",
              type: "empty_material",
              category: "empty_material",
              materialKey: sensor.key,
              autoGenerated: true,
              active: true,
              createdAt: Date.now(),
              read: false
            });
            if (created?.key) {
              rows.push({
                id: created.key,
                firebaseKey: created.key,
                title: sensor.label + " is empty",
                type: "empty_material",
                category: "empty_material",
                materialKey: sensor.key,
                autoGenerated: true,
                active: true
              });
            }
          } else if (sensor.status === "available" && activeAlert) {
            await update(ref(db, "ecopeel/notifications/" + activeAlert.firebaseKey), {
              active: false,
              resolvedAt: Date.now()
            });
            activeAlert.active = false;
          }
        }
      } catch {
        // The public page remains read-only. Auto-generated alerts need an authorized admin session;
        // the ESP32 should also send sensor-empty notifications for unattended operation.
      }
    }

    syncMaterialNotifications();
    return () => { cancelled = true; };
  }, [isAdmin, materialSensorSignature]);

  useEffect(() => {
    if (!auth) return undefined;
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (active) {
          setUser(null);
          setAuthChecking(false);
        }
        return;
      }
      try {
        if (!db) throw new Error("Database not configured");
        const adminSnapshot = await get(ref(db, "ecopeel/admins/" + firebaseUser.uid));
        if (!active) return;
        if (adminSnapshot.val() === true) {
          setUser(firebaseUser);
        } else {
          setUser(null);
          await signOut(auth);
        }
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setAuthChecking(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
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
      if (!db) {
        await signOut(auth);
        setLoginError("Firebase Realtime Database is not configured.");
        return;
      }
      const adminSnapshot = await get(ref(db, "ecopeel/admins/" + credential.user.uid));
      if (adminSnapshot.val() !== true) {
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

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!auth || !user) {
      setPasswordError("Sign in with an administrator account before changing the password.");
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Complete all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Choose a new password with at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("Your new password must be different from the current password.");
      return;
    }
    if (!user.email) {
      setPasswordError("This account has no email/password sign-in. Contact the system administrator.");
      return;
    }

    setPasswordBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Your EcoPeel admin password has been changed successfully.");
    } catch (error) {
      const messages = {
        "auth/invalid-credential": "The current password is incorrect.",
        "auth/wrong-password": "The current password is incorrect.",
        "auth/weak-password": "Firebase rejected this password. Choose a stronger password.",
        "auth/requires-recent-login": "For security, sign out and sign back in before trying again.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed": "Network error. Check your connection and try again."
      };
      setPasswordError(messages[error.code] || "Could not change the password. Please verify your current password and try again.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleNotificationAction(item, action) {
    const recordKey = item.firebaseKey ?? item.id;
    if (recordKey === undefined || recordKey === null || recordKey === "") {
      setNotificationActionError("Could not identify this notification record.");
      return;
    }
    if (action === "delete" && !window.confirm(`Delete notification "${item.title || item.event || "Machine update"}"? This cannot be undone.`)) return;

    const busyKey = String(recordKey);
    setNotificationBusyKey(busyKey);
    setNotificationActionError("");
    try {
      if (demoMode && !db) {
        if (action === "read") {
          setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, read: true } : row)));
        } else {
          setNotifications((current) => current.filter((row) => row.id !== item.id));
        }
      } else {
        if (!db || !isAdmin) throw new Error("Admin access is required to modify notifications.");
        const recordRef = ref(db, "ecopeel/notifications/" + recordKey);
        if (action === "read") await update(recordRef, { read: true });
        else await remove(recordRef);
      }
    } catch {
      setNotificationActionError(action === "read"
        ? "Could not mark this notification as read. Check admin Firebase write permissions."
        : "Could not delete this notification. Check admin Firebase write permissions.");
    } finally {
      setNotificationBusyKey(null);
    }
  }

  async function handleMarkAllNotificationsRead() {
    const unread = notifications.filter((item) => !item.read && !item.systemRecord && !item._systemRecord);
    if (!unread.length || markingAllRead) return;

    setMarkingAllRead(true);
    setNotificationActionError("");
    try {
      if (demoMode && !db) {
        setNotifications((current) => current.map((item) =>
          !item.systemRecord && !item._systemRecord ? { ...item, read: true } : item
        ));
        return;
      }

      if (!db || !isAdmin) throw new Error("Admin access is required to modify notifications.");
      const updates = {};
      for (const item of unread) {
        const recordKey = item.firebaseKey ?? item.id;
        if (recordKey !== undefined && recordKey !== null && String(recordKey) !== "") {
          updates[String(recordKey) + "/read"] = true;
        }
      }
      if (!Object.keys(updates).length) throw new Error("No writable notification records were found.");
      await update(ref(db, "ecopeel/notifications"), updates);
    } catch {
      setNotificationActionError("Could not mark all notifications as read. Check admin Firebase write permissions and try again.");
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function handleDeleteHistory(row) {
    const recordKey = row.firebaseKey ?? row.id;
    if (!db || !isAdmin || recordKey === undefined || recordKey === null || recordKey === "") {
      setHistoryActionError("Could not identify this record or verify administrator access.");
      return;
    }

    const label = row.batchId || row.id || "this batch";
    if (!window.confirm(`Delete batch record "${label}"? This cannot be undone.`)) return;

    setDeletingHistoryId(String(recordKey));
    setHistoryActionError("");
    try {
      await remove(ref(db, "ecopeel/history/" + recordKey));
      setHistoryPage((pageNumber) => Math.min(pageNumber, Math.max(1, Math.ceil((visibleHistory.length - 1) / historyPageSize))));
    } catch {
      setHistoryActionError("Could not delete this batch. Check Firebase administrator write permissions and try again.");
    } finally {
      setDeletingHistoryId(null);
    }
  }

  async function handleLogout() {
    if (auth) await signOut(auth);
    setUser(null);
    setPage("dashboard");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordMessage("");
  }

  function navigate(nextPage) {
    if (nextPage === "history" && !isAdmin) {
      setPage("login");
    } else {
      setPage(nextPage);
    }
    setSidebarOpen(false);
  }

  const navItems = [
    { id: "dashboard", label: "Live Dashboard", icon: LayoutDashboard, section: "MONITORING" },
    { id: "machine", label: "Machine Status", icon: Factory },
    { id: "notifications", label: "Notifications", icon: Bell, count: unreadCount },
    ...(isAdmin ? [
      { id: "history", label: "Production History", icon: History, section: "ADMINISTRATION" },
      { id: "change-password", label: "Change Password", icon: ShieldCheck }
    ] : [])
  ];

  return (
    <div className="app-shell">
      {sidebarOpen && <button aria-label="Close navigation" className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={"sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark"><Banana size={22} strokeWidth={2.2} /></div>
          <div><div className="brand-name">EcoPeel</div><div className="brand-subtitle">BIOPLASTIC SYSTEMS</div></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="sidebar-project">
          <span className="project-avatar"><Factory size={16} /></span>
          <span><strong>Bioplastic Machine</strong><small>Monitoring Station</small></span>
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
          <button type="button" className="sidebar-about" onClick={() => navigate("about")}>
            <div className="about-icon"><Info size={18} /></div>
            <div><strong>About EcoPeel</strong><span>Learn about the project</span></div>
            <ChevronRight size={16} />
          </button>
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
            <div className="breadcrumbs"><span>EcoPeel</span><ChevronRight size={14} /><strong>{page === "dashboard" ? "Live dashboard" : page === "machine" ? "Machine status" : page === "notifications" ? "Notifications" : page === "history" ? "Production history" : page === "change-password" ? "Change password" : page === "about" ? "About EcoPeel" : "Admin sign in"}</strong></div>
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
              <div className="overview-label"><span className="overview-pulse" /><div><strong>Machine Overview</strong><small>{demoMode ? "Sample machine status" : live ? "Latest Firebase status" : "Waiting for first device update"}</small></div></div>
              <div className="overview-divider" />
              <div className="overview-stat"><span>Current state</span><strong>{currentStatus}</strong></div>
              <div className="overview-stat"><span>Current process</span><strong>{live?.currentStep || live?.process || (live ? currentStatus : "No data yet")}</strong></div>
              <div className="overview-stat"><span>Last update</span><strong>{live ? relativeTime(live.updatedAt || live.timestamp) : "No update yet"}</strong></div>
              <div className="overview-power">
                <Power size={17} />
                <div><span>Machine power</span><strong>{machinePowerOn === null ? "Unknown" : machinePowerOn ? "ON" : "OFF"}</strong></div>
                <StatusPill tone={machinePowerOn === null ? "neutral" : machinePowerOn ? "success" : "warning"}>{machinePowerOn === null ? "No state" : machinePowerOn ? "Running" : "Stopped"}</StatusPill>
              </div>
              <div className="overview-end"><StatusPill tone={machineOnline ? "success" : "warning"}>{demoMode ? "Demo online" : machineOnline ? "Device online" : "Device offline"}</StatusPill></div>
            </div>

            <div className="section-heading"><div><h2>Live Sensor Readings</h2><p>Key temperatures and environmental conditions</p></div><span className="section-note"><span className="live-dot" /> Live data</span></div>
            <div className="metric-grid">
              <MetricCard icon={Thermometer} label="Mixing Temperature" value={live?.temperature ?? live?.mixingTemperature ?? "—"} unit={live?.temperature != null || live?.mixingTemperature != null ? "°C" : ""} caption="Cooking and mixing unit" tone="green" />
              <MetricCard icon={Thermometer} label="Dehydrator Temperature" value={live?.dehydratorTemperature ?? "—"} unit={live?.dehydratorTemperature != null ? "°C" : ""} caption="Drying chamber" tone="orange" />
              <MetricCard icon={Droplet} label="Dehydrator Humidity" value={live?.humidity ?? "—"} unit={live?.humidity != null ? "%" : ""} caption="Relative humidity" tone="blue" />
              <MetricCard icon={Factory} label="Molders Loaded" value={live ? (live.loadedMolders ?? 0) + " / " + (live.targetMolders ?? 6) : "—"} unit="" caption="Dehydrator capacity" tone="purple" />
            </div>

            <div className="section-heading material-sensor-section-heading">
              <div><h2>Material Availability</h2><p>Live status of water, vinegar, glycerin, and corn starch supplies</p></div>
              <span className="section-note"><span className="live-dot" /> Live sensor status</span>
            </div>
            <div className="material-sensor-grid dashboard-material-sensors">
              {materialSensorStates.map((sensor) => {
                const isEmpty = sensor.status === "empty";
                const isAvailable = sensor.status === "available";
                const stateLabel = isEmpty ? "Empty" : isAvailable ? "Available" : "Waiting for data";
                const stateTone = isEmpty ? "warning" : isAvailable ? "success" : "neutral";
                const SensorIcon = sensor.Icon;
                return <article key={sensor.key} className={"material-sensor-card " + (isEmpty ? "is-empty" : isAvailable ? "is-available" : "is-unknown")}>
                  <div className={"material-sensor-icon " + (isEmpty ? "warning" : isAvailable ? "success" : "")}><SensorIcon size={20} strokeWidth={1.9} /></div>
                  <div className="material-sensor-main">
                    <span className="material-sensor-label">{sensor.label}</span>
                    <div className="material-sensor-state"><StatusPill tone={stateTone}>{stateLabel}</StatusPill></div>
                    <p>{sensor.sensorType}</p>
                  </div>
                  <span className="material-sensor-state-copy">{isEmpty ? "Refill required" : isAvailable ? "Supply detected" : "No status received"}</span>
                </article>;
              })}
            </div>

            <div className="dashboard-grid">
              <section className="panel temperature-panel">
                <div className="panel-header"><div><h3>Dehydrator Environment</h3><p>Temperature and humidity trend</p></div><span className="chart-period">Recent Readings <ChevronDown size={14} /></span></div>
                {trend.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="temperatureFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#43875e" stopOpacity={0.18} /><stop offset="100%" stopColor="#43875e" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eee7" /><XAxis dataKey="time" tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#89938a", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebe2", fontSize: 12 }} /><Area type="monotone" dataKey="temperature" name="Temperature °C" stroke="#43875e" strokeWidth={2.5} fill="url(#temperatureFill)" /><Area type="monotone" dataKey="humidity" name="Humidity %" stroke="#5d91c9" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div> : <EmptyState title="No sensor history yet" text="Telemetry readings will appear here when the ESP32 starts sending data to Firebase." />}
                <div className="chart-legend"><span><i className="legend-line green-line" /> Temperature (°C)</span><span><i className="legend-line blue-line" /> Humidity (%)</span></div>
              </section>

              <section className="panel process-panel">
                <div className="panel-header"><div><h3>Production Workflow</h3><p>Process progress at a glance</p></div><span className="workflow-icon"><Activity size={17} /></span></div>
                <div className="workflow-progress"><div className="workflow-progress-top"><span>Current batch</span><strong>{currentProgress}%</strong></div><div className="progress-track"><div className="progress-value" style={{ width: currentProgress + "%" }} /></div></div>
                <div className="process-list">
                  {PROCESS_STEPS.map((step, index) => {
                    const detectedIndex = currentStepIndex === null && demoMode ? 5 : currentStepIndex;
                    const activeIndex = detectedIndex ?? -1;
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
                <div className="panel-header"><div><h3>Recent Notifications</h3><p>System alerts and process updates</p></div><button className="text-link" onClick={() => navigate("notifications")}>View all <ChevronRight size={15} /></button></div>
                {notifications.length ? <div className="notification-list compact-list">{notifications.slice(0, 3).map((item) => <NotificationRow key={item.id} item={item} />)}</div> : <EmptyState title="No notifications" text="New alerts will appear here when recorded in Firebase." />}
              </section>
              <section className="panel capacity-panel">
                <div className="panel-header"><div><h3>Dehydrator Capacity</h3><p>Molder loading progress</p></div><Factory size={18} className="muted-icon" /></div>
                <div className="capacity-number"><strong>{live?.loadedMolders ?? (demoMode ? 4 : 0)}</strong><span>/ {live?.targetMolders ?? 6} molders loaded</span></div>
                <div className="capacity-slots">{Array.from({ length: Number(live?.targetMolders ?? 6) || 6 }, (_, i) => <span key={i} className={i < Number(live?.loadedMolders ?? (demoMode ? 4 : 0)) ? "slot filled" : "slot"} />)}</div>
                <div className="capacity-footer"><span><i className="slot-key filled-key" /> Loaded</span><span><i className="slot-key empty-key" /> Available</span></div>
              </section>
            </div>
            <footer className="page-footer"><span>© 2026 EcoPeel · Banana-peel bioplastic machine monitoring</span><span><ShieldCheck size={14} /> Read-only monitoring portal</span></footer>
          </div>
        )}

        {page === "machine" && (
          <div className="page-content machine-status-page">
            <div className="page-heading"><div><div className="eyebrow">DEVICE DETAILS</div><h1>Machine Status</h1><p>Current operating state and sensor health for the EcoPeel machine.</p></div><StatusPill tone={machineOnline ? "success" : "warning"}>{demoMode ? "Demo environment" : machineOnline ? "Connected" : "Waiting for device"}</StatusPill></div>
            <div className="status-summary-card"><div className="machine-status-emblem"><Factory size={28} /></div><div className="machine-status-main"><span className="metric-label">CURRENT MACHINE STATE</span><h2>{currentStatus}</h2><p>{live?.currentStep || live?.process || "Waiting for process state data."}</p></div><div className="machine-status-meta"><span>Machine power</span><strong className={"power-reading " + (machinePowerOn === true ? "is-on" : machinePowerOn === false ? "is-off" : "is-unknown")}>{machinePowerOn === null ? "Unknown" : machinePowerOn ? "ON" : "OFF"}</strong><span>Device connection</span><StatusPill tone={machineOnline ? "success" : "warning"}>{machineOnline ? "Connected" : "Offline"}</StatusPill><small className="machine-updated">{live ? formatDate(live.updatedAt || live.timestamp) : "No data received"}</small></div></div>
            <div className="section-heading"><div><h2>Operating Sensors</h2><p>Values reported by the controller</p></div></div>
            <div className="metric-grid"><MetricCard icon={Thermometer} label="Mixing Temperature" value={live?.temperature ?? live?.mixingTemperature ?? "—"} unit={live?.temperature != null || live?.mixingTemperature != null ? "°C" : ""} caption="DS18B20 / cooking vessel" /><MetricCard icon={Thermometer} label="Dehydrator Temperature" value={live?.dehydratorTemperature ?? "—"} unit={live?.dehydratorTemperature != null ? "°C" : ""} caption="Dehydrator chamber" tone="orange" /><MetricCard icon={Droplet} label="Humidity" value={live?.humidity ?? "—"} unit={live?.humidity != null ? "%" : ""} caption="Dehydrator chamber" tone="blue" /><MetricCard icon={Gauge} label="Process Progress" value={live ? currentProgress : "—"} unit={live ? "%" : ""} caption="Current batch" tone="purple" /></div>
            <div className="section-heading material-sensor-section-heading">
              <div><h2>Material Availability</h2><p>Live status of water, vinegar, glycerin, and corn starch supplies</p></div>
              <span className="section-note"><span className="live-dot" /> Live sensor status</span>
            </div>
            <div className="material-sensor-grid machine-material-sensors">
              {materialSensorStates.map((sensor) => {
                const isEmpty = sensor.status === "empty";
                const isAvailable = sensor.status === "available";
                const stateLabel = isEmpty ? "Empty" : isAvailable ? "Available" : "Waiting for data";
                const stateTone = isEmpty ? "warning" : isAvailable ? "success" : "neutral";
                const SensorIcon = sensor.Icon;
                return <article key={sensor.key} className={"material-sensor-card " + (isEmpty ? "is-empty" : isAvailable ? "is-available" : "is-unknown")}>
                  <div className={"material-sensor-icon " + (isEmpty ? "warning" : isAvailable ? "success" : "")}><SensorIcon size={20} strokeWidth={1.9} /></div>
                  <div className="material-sensor-main">
                    <span className="material-sensor-label">{sensor.label}</span>
                    <div className="material-sensor-state"><StatusPill tone={stateTone}>{stateLabel}</StatusPill></div>
                    <p>{sensor.sensorType}</p>
                  </div>
                  <span className="material-sensor-state-copy">{isEmpty ? "Refill required" : isAvailable ? "Supply detected" : "No status received"}</span>
                </article>;
              })}
            </div>
            <div className="panel workflow-full-panel">
              <div className="panel-header">
                <div><h3>Production Sequence</h3><p>Process states reported or expected by the machine controller</p></div>
                <span className="workflow-stage-count">{currentStepIndex === null ? "6 stages" : "Stage " + (currentStepIndex + 1) + " of " + PROCESS_STEPS.length}</span>
              </div>
              <div className="machine-progress-block">
                <div className="machine-progress-heading">
                  <div><span>Overall production progress</span><small>{hasReportedProgress ? "Reported by the machine controller" : hasProgressData ? "Estimated from the current process stage" : "Waiting for machine status"}</small></div>
                  <strong>{hasProgressData ? currentProgress + "%" : "—"}</strong>
                </div>
                <div className="machine-progress-track" role="progressbar" aria-label="Overall production progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={hasProgressData ? currentProgress : 0}>
                  <div className="machine-progress-value" style={{ width: (hasProgressData ? currentProgress : 0) + "%" }} />
                </div>
                <div className="machine-progress-caption">
                  <span>Start</span>
                  <span>{currentStepIndex === null ? "Current Step Not Identified" : "Current Stage: " + PROCESS_STEPS[currentStepIndex]}</span>
                  <span>Complete</span>
                </div>
              </div>
              <div className="full-process-grid">
                {PROCESS_STEPS.map((step, i) => {
                  const stepIsCurrent = currentStepIndex === i || (currentStepIndex === null && demoMode && i === 5);
                  const stepIsComplete = currentStepIndex !== null && i < currentStepIndex;
                  const stepClass = stepIsCurrent ? "current" : stepIsComplete ? "complete" : "upcoming";
                  const statusLabel = stepIsCurrent ? "Current Stage" : stepIsComplete ? "Completed Stage" : currentStepIndex === null ? "Awaiting Status Mapping" : "Upcoming Stage";
                  const StepIcon = [Factory, Droplet, Activity, Layers, ArrowLeftRight, Wind][i];
                  return <div key={step} className={"full-process-card " + stepClass}>
                    <div className="full-process-card-top">
                      <span className="full-step-index">{String(i + 1).padStart(2, "0")}</span>
                      <span className="full-process-icon"><StepIcon size={18} strokeWidth={1.9} /></span>
                    </div>
                    <strong>{step}</strong>
                    <span className="full-step-status">{statusLabel}</span>
                  </div>;
                })}
              </div>
            </div>

            <section className="panel capacity-panel machine-capacity-panel">
              <div className="panel-header">
                <div><h3>Dehydrator Capacity</h3><p>Molder loading progress</p></div>
                <Factory size={19} className="muted-icon" />
              </div>
              <div className="capacity-number">
                <strong>{live?.loadedMolders ?? (demoMode ? 4 : 0)}</strong>
                <span>/ {live?.targetMolders ?? 6} molders loaded</span>
              </div>
              <div className="capacity-slots">
                {Array.from({ length: Number(live?.targetMolders ?? 6) || 6 }, (_, i) => (
                  <span key={i} className={i < Number(live?.loadedMolders ?? (demoMode ? 4 : 0)) ? "slot filled" : "slot"} />
                ))}
              </div>
              <div className="capacity-footer">
                <span><i className="slot-key filled-key" /> Loaded</span>
                <span><i className="slot-key empty-key" /> Available</span>
              </div>
            </section>

            <div className="page-footer"><span>Machine actions are not available from this website.</span><span><ShieldCheck size={14} /> Hardware safety stays on the controller</span></div>
          </div>
        )}

        {page === "notifications" && (
          <div className="page-content notifications-page">
            <div className="page-heading notifications-page-heading">
              <div>
                <div className="eyebrow">SYSTEM ACTIVITY</div>
                <h1>Notifications</h1>
                <p>Review machine alerts, production updates, and important system events.</p>
              </div>
              <div className="notification-heading-status">
                <span className="notification-heading-icon"><Bell size={17} /></span>
                <div><strong>{unreadCount}</strong><span>Unread Notifications</span></div>
              </div>
            </div>

            <div className="notifications-overview-grid">
              <article className="notification-overview-card">
                <span className="notification-overview-icon total"><Bell size={17} /></span>
                <div><span className="notification-overview-label">Total Notifications</span><strong>{notificationTotal}</strong><small>Recorded machine events</small></div>
              </article>
              <article className="notification-overview-card unread">
                <span className="notification-overview-icon unread"><Clock3 size={17} /></span>
                <div><span className="notification-overview-label">Unread</span><strong>{unreadCount}</strong><small>Awaiting review</small></div>
              </article>
              <article className="notification-overview-card resolved">
                <span className="notification-overview-icon resolved"><CheckCircle2 size={17} /></span>
                <div><span className="notification-overview-label">Resolved</span><strong>{resolvedNotificationCount}</strong><small>Issues cleared or restored</small></div>
              </article>
            </div>

            <section className="panel notifications-page-panel">
              <div className="panel-header notification-panel-header">
                <div className="notification-panel-title">
                  <div className="notification-panel-title-icon"><Bell size={17} /></div>
                  <div><h3>Notification Center</h3><p>Machine alerts and production updates from your EcoPeel system.</p></div>
                </div>
                <div className="notification-header-tools">
                  {isAdmin && <button type="button" className="notification-action-button mark-read notification-mark-all-button" disabled={markingAllRead || unreadCount === 0} onClick={handleMarkAllNotificationsRead} title={unreadCount > 0 ? "Mark all " + unreadCount + " unread notifications as read" : "All notifications are already read"}>
                    {markingAllRead ? <span className="notification-button-spinner" /> : <Check size={14} />}
                    <span>{markingAllRead ? "Marking..." : "Mark all as read"}</span>
                    <span className="notification-mark-all-count">{unreadCount}</span>
                  </button>}
                  <label className="notification-type-filter"><span>Filter By Type</span><select className="filter-select" aria-label="Filter notifications by type" value={notificationFilter} onChange={(event) => setNotificationFilter(event.target.value)}>{NOTIFICATION_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                </div>
              </div>
              {notificationActionError && <div className="history-action-error" role="alert"><AlertTriangle size={15} /><span>{notificationActionError}</span></div>}
              {visibleNotifications.length ? <div className="notification-list">{visibleNotifications.map((item) => <NotificationRow key={item.firebaseKey || item.id} item={item} expanded isAdmin={isAdmin} busy={notificationBusyKey === String(item.firebaseKey ?? item.id)} onMarkRead={() => handleNotificationAction(item, "read")} onDelete={() => handleNotificationAction(item, "delete")} />)}</div> : <EmptyState title="No matching notifications" text={notificationFilter === "all" ? "When the controller or ESP32 records a notification in Firebase, it will be listed here." : "No notifications match this type yet."} />}
            </section>
            <div className="page-footer"><span>{isAdmin ? "Administrators can mark alerts as read or delete records." : "Notification actions are available to authenticated administrators."}</span><span><Bell size={14} /> {demoMode ? "Example messages" : "Firebase notification stream"}</span></div>
          </div>
        )}

        {page === "history" && isAdmin && (
          <div className="page-content">
            <div className="page-heading"><div><div className="eyebrow">BATCH RECORDS</div><h1>Production History</h1><p>Review past batches and their recorded outcomes.</p></div><div className="heading-actions"><span className="date-chip"><History size={15} /> {history.length} records</span></div></div>
            <section className="panel production-count-panel history-production-summary">
              <div className="production-count-header">
                <div><h3>Production Summary</h3><p>Batch totals and overall performance</p></div>
              </div>
              <div className="production-summary-grid">
                <div className="production-supporting-metric is-primary">
                  <div className="production-supporting-icon"><Factory size={20} strokeWidth={1.9} /></div>
                  <div className="production-supporting-copy">
                    <div className="production-metric-heading">
                      <span className="production-supporting-label">Completed Batches</span>
                      <select className="filter-select production-period-select" aria-label="Period for completed batches" value={batchCountPeriod} onChange={(event) => setBatchCountPeriod(event.target.value)}>
                        <option value="day">Today</option>
                        <option value="week">This week</option>
                        <option value="month">This month</option>
                        <option value="year">This year</option>
                      </select>
                    </div>
                    <div className="production-supporting-value">{productionBatchCount}</div>
                    <span className="production-supporting-caption">{batchCountPeriod === "day" ? "Today" : batchCountPeriod === "week" ? "This week" : batchCountPeriod === "month" ? "This month" : "This year"} · Philippine time</span>
                  </div>
                </div>
                <div className="production-supporting-metric">
                  <div className="production-supporting-icon"><CheckCircle2 size={20} strokeWidth={1.9} /></div>
                  <div className="production-supporting-copy">
                    <span className="production-supporting-label">Success Rate</span>
                    <div className="production-supporting-value">{history.length ? Math.round(history.filter((r) => String(r.status).toLowerCase() === "completed").length / history.length * 100) : "—"}<small>{history.length ? "%" : ""}</small></div>
                    <span className="production-supporting-caption">Recorded batch outcomes</span>
                  </div>
                </div>
                <div className="production-supporting-metric">
                  <div className="production-supporting-icon blue"><Factory size={20} strokeWidth={1.9} /></div>
                  <div className="production-supporting-copy">
                    <div className="production-metric-heading">
                      <span className="production-supporting-label">Total Molders</span>
                      <select className="filter-select production-period-select" aria-label="Period for total molders" value={moldersPeriod} onChange={(event) => setMoldersPeriod(event.target.value)}>
                        <option value="day">Today</option>
                        <option value="week">This week</option>
                        <option value="month">This month</option>
                        <option value="year">This year</option>
                      </select>
                    </div>
                    <div className="production-supporting-value">{totalMoldersByPeriod}</div>
                    <span className="production-supporting-caption">{moldersPeriod === "day" ? "Today" : moldersPeriod === "week" ? "This week" : moldersPeriod === "month" ? "This month" : "This year"} · Across recorded batches</span>
                  </div>
                </div>
                <div className="production-supporting-metric">
                  <div className="production-supporting-icon warning"><AlertTriangle size={20} strokeWidth={1.9} /></div>
                  <div className="production-supporting-copy">
                    <span className="production-supporting-label">Interrupted Batches</span>
                    <div className="production-supporting-value">{history.length ? history.filter((row) => String(row.status || "").trim().toLowerCase() === "interrupted").length : "—"}</div>
                    <span className="production-supporting-caption">Across all recorded batches</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="panel history-panel">
              <div className="panel-header history-panel-header">
                <div><h3>Batch Records</h3><p>Production activity log · {visibleHistory.length} matching record{visibleHistory.length === 1 ? "" : "s"}</p></div>
              </div>
              <div className="history-toolbar">
                <label className="history-search-box">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    value={historySearch}
                    aria-label="Search batch records"
                    placeholder="Search batch ID, status, date..."
                    onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(1); }}
                  />
                  {historySearch && <button type="button" className="history-search-clear" aria-label="Clear search" title="Clear search" onClick={() => { setHistorySearch(""); setHistoryPage(1); }}><X size={14} /></button>}
                </label>
                <label className="history-status-filter">
                  <span>Status</span>
                  <select className="filter-select" value={historyFilter} aria-label="Filter batch records by status" onChange={(event) => { setHistoryFilter(event.target.value); setHistoryPage(1); }}>
                    <option>All</option><option>Completed</option><option>Interrupted</option>
                  </select>
                </label>
              </div>
              {historyActionError && <div className="history-action-error" role="alert"><AlertTriangle size={15} /><span>{historyActionError}</span></div>}
              {visibleHistory.length ? <>
                <div className="table-scroll">
                  <table className="data-table history-records-table">
                    <thead>
                      <tr>
                        <th><span className="table-heading"><ClipboardList size={13} /> Batch ID</span></th>
                        <th><span className="table-heading"><CalendarClock size={13} /> Started</span></th>
                        <th><span className="table-heading"><CalendarClock size={13} /> Finished</span></th>
                        <th><span className="table-heading"><Clock3 size={13} /> Duration</span></th>
                        <th><span className="table-heading"><Layers size={13} /> Molders</span></th>
                        <th><span className="table-heading"><CheckCircle2 size={13} /> Status</span></th>
                        <th><span className="table-heading"><Trash2 size={13} /> Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((row) => {
                        const recordKey = String(row.firebaseKey ?? row.id ?? "");
                        return <tr key={recordKey || row.batchId}>
                          <td><strong className="batch-id-cell">{row.batchId || row.id || "Batch"}</strong></td>
                          <td>{formatDate(row.startedAt || row.timestamp)}</td>
                          <td>{formatDate(row.endedAt || row.completedAt || row.finishedAt)}</td>
                          <td>{row.durationMinutes != null ? row.durationMinutes + " min" : "—"}</td>
                          <td>{row.molders ?? row.loadedMolders ?? "—"}</td>
                          <td><StatusPill tone={String(row.status).toLowerCase() === "completed" ? "success" : String(row.status).toLowerCase() === "interrupted" ? "warning" : "neutral"}>{row.status || "Unknown"}</StatusPill></td>
                          <td><button className="table-delete-button" type="button" title={`Delete ${row.batchId || "batch record"}`} aria-label={`Delete ${row.batchId || "batch record"}`} disabled={deletingHistoryId === recordKey} onClick={() => handleDeleteHistory(row)}>{deletingHistoryId === recordKey ? <span className="delete-spinner" /> : <Trash2 size={15} />}<span>{deletingHistoryId === recordKey ? "Deleting" : "Delete"}</span></button></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="history-pagination">
                  <span className="pagination-summary">Showing {Math.min((currentHistoryPage - 1) * historyPageSize + 1, visibleHistory.length)}–{Math.min(currentHistoryPage * historyPageSize, visibleHistory.length)} of {visibleHistory.length}</span>
                  <div className="pagination-controls">
                    <button type="button" className="pagination-button" disabled={currentHistoryPage <= 1} onClick={() => setHistoryPage((pageNumber) => Math.max(1, Math.min(pageNumber, historyPageCount) - 1))}><ChevronLeft size={15} /> Previous</button>
                    <span className="pagination-page">Page {currentHistoryPage} of {historyPageCount}</span>
                    <button type="button" className="pagination-button" disabled={currentHistoryPage >= historyPageCount} onClick={() => setHistoryPage((pageNumber) => Math.min(historyPageCount, Math.max(pageNumber, currentHistoryPage) + 1))}>Next <ChevronRight size={15} /></button>
                  </div>
                </div>
              </> : <EmptyState title="No production history" text="When the ESP32 writes completed or interrupted batches to Firebase, they will show here." />}
            </section>
            {demoMode && <div className="info-banner"><AlertTriangle size={16} /><span>These sample history records are for layout testing only. They are not real production records.</span></div>}
            <div className="page-footer"><span>History access is restricted to authenticated administrators.</span><span><ShieldCheck size={14} /> Admin view</span></div>
          </div>
        )}

        {page === "change-password" && isAdmin && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">ACCOUNT SECURITY</div>
                <h1>Change Password</h1>
                <p>Update the password used to sign in to your EcoPeel administrator account.</p>
              </div>
              <StatusPill tone="success">Administrator account</StatusPill>
            </div>
            <div className="security-layout">
              <section className="panel security-form-panel">
                <div className="security-panel-heading">
                  <div className="security-panel-icon"><ShieldCheck size={21} /></div>
                  <div><h3>Update Your Password</h3><p>Confirm your current password before choosing a new one.</p></div>
                </div>
                <form className="login-form password-form" onSubmit={handlePasswordChange}>
                  <label htmlFor="currentPassword">Current password</label>
                  <input id="currentPassword" type="password" autoComplete="current-password" placeholder="Enter current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                  <label htmlFor="newPassword">New password</label>
                  <input id="newPassword" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
                  <label htmlFor="confirmPassword">Confirm new password</label>
                  <input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
                  <div className="password-hint"><ShieldCheck size={15} /><span>Use at least 8 characters. Never share your administrator password.</span></div>
                  {passwordError && <div className="login-error"><AlertTriangle size={16} />{passwordError}</div>}
                  {passwordMessage && <div className="password-success"><CheckCircle2 size={17} /><span>{passwordMessage}</span></div>}
                  <button className="sign-in-button" type="submit" disabled={passwordBusy}>
                    {passwordBusy ? "Updating password…" : <><ShieldCheck size={17} /> Save new password</>}
                  </button>
                </form>
              </section>
              <aside className="panel security-info-panel">
                <div className="security-info-icon"><ShieldCheck size={20} /></div>
                <h3>Keep Your Account Secure</h3>
                <p>EcoPeel asks you to re-enter your current password before it changes your sign-in credentials.</p>
                <div className="security-check"><CheckCircle2 size={16} /><span>Current password verified</span></div>
                <div className="security-check"><CheckCircle2 size={16} /><span>New password confirmed</span></div>
                <div className="security-check"><CheckCircle2 size={16} /><span>Saved through Firebase Authentication</span></div>
                <div className="security-note">Changing this password does not affect machine operation or stored production records.</div>
              </aside>
            </div>
            <div className="page-footer"><span>Password changes apply to the current administrator account.</span><span><ShieldCheck size={14} /> Protected by Firebase Authentication</span></div>
          </div>
        )}

        {page === "about" && (
          <div className="page-content about-page">
            <section className="about-hero panel">
              <div className="about-hero-main">
                <div className="about-hero-mark"><Banana size={29} strokeWidth={1.9} /></div>
                <div className="about-hero-copy">
                  <div className="about-hero-kicker"><span className="about-kicker-line" /> ABOUT THE PROJECT</div>
                  <h2>EcoPeel: A Banana-Peel Bioplastic Production and Monitoring System</h2>
                  <p>EcoPeel is a prototype automated system designed to transform prepared banana-peel material through controlled ingredient dispensing, mixing and cooking, molding, mechanical transfer, and dehydration. Its connected dashboard brings machine telemetry, raw-material availability, alerts, and production history into one place.</p>
                  <div className="about-hero-tags">
                    <span><Factory size={12} /> Automated Processing</span>
                    <span><Droplet size={12} /> Raw Material Sensors</span>
                    <span><Activity size={12} /> IoT Machine Monitoring</span>
                    <span><History size={12} /> Production Records</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="about-system-panel panel">
              <div className="about-panel-heading">
                <div className="about-panel-title">
                  <span className="about-heading-icon"><Wifi size={19} /></span>
                  <div><h2>System connection</h2><p>Live connectivity and controller information</p></div>
                </div>
                <span className="about-item-count">05</span>
              </div>

              <div className={"about-telemetry-banner " + (machineOnline && !demoMode ? "is-connected" : "is-waiting")}>
                <div className="about-telemetry-left">
                  <span className="about-telemetry-icon">{machineOnline && !demoMode ? <Activity size={18} /> : <WifiOff size={18} />}</span>
                  <div>
                    <strong>{demoMode ? "Preview telemetry" : machineOnline ? "Machine telemetry available" : "Waiting for machine telemetry"}</strong>
                    <p>{demoMode ? "Sample status is displayed in preview mode." : machineOnline ? "Latest controller data is available to the dashboard." : "No current controller update has been received."}</p>
                  </div>
                </div>
                <StatusPill tone={demoMode ? "neutral" : machineOnline ? "success" : "warning"}>
                  {demoMode ? "Preview" : machineOnline ? "Connected" : "Waiting"}
                </StatusPill>
              </div>

              <div className="about-connection-list">
                <div className="about-connection-row">
                  <span className="about-connection-icon"><Server size={16} /></span>
                  <div className="about-connection-name"><strong>Frontend hosting</strong><small>EcoPeel web application</small></div>
                  <div className="about-connection-value"><strong>Vercel</strong><span className="about-connection-state is-neutral">Production hosting</span></div>
                </div>
                <div className="about-connection-row">
                  <span className="about-connection-icon"><GitBranch size={16} /></span>
                  <div className="about-connection-name"><strong>Source control</strong><small>Project code repository</small></div>
                  <div className="about-connection-value"><strong>GitHub</strong><span className="about-connection-state is-neutral">Repository</span></div>
                </div>
                <div className="about-connection-row">
                  <span className="about-connection-icon"><Database size={16} /></span>
                  <div className="about-connection-name"><strong>Database</strong><small>Realtime machine data and records</small></div>
                  <div className="about-connection-value"><strong>Firebase</strong><span className={"about-connection-state " + (demoMode ? "is-neutral" : firebaseConnected ? "is-connected" : "is-offline")}>{demoMode ? "Not configured" : firebaseConnected ? "Connected" : "Disconnected"}</span></div>
                </div>
                <div className="about-connection-row">
                  <span className="about-connection-icon"><Cpu size={16} /></span>
                  <div className="about-connection-name"><strong>Machine controller</strong><small>Production sequence and sensor inputs</small></div>
                  <div className="about-connection-value"><strong>Arduino Mega 2560</strong><span className={"about-connection-state " + (demoMode ? "is-neutral" : machineOnline ? "is-connected" : "is-offline")}>{demoMode ? "Preview only" : machineOnline ? "Telemetry received" : "Waiting for data"}</span></div>
                </div>
                <div className="about-connection-row">
                  <span className="about-connection-icon"><Wifi size={16} /></span>
                  <div className="about-connection-name"><strong>Network controller</strong><small>Wi-Fi and Firebase bridge</small></div>
                  <div className="about-connection-value"><strong>ESP32</strong><span className={"about-connection-state " + (demoMode ? "is-neutral" : firebaseConnected && machineOnline ? "is-connected" : "is-offline")}>{demoMode ? "Preview only" : firebaseConnected && machineOnline ? "Data received" : "Awaiting update"}</span></div>
                </div>
              </div>
              <p className="about-connection-note">Controller availability is based on the latest machine telemetry received through the ESP32 bridge. Firebase connectivity reflects the web app's Realtime Database connection.</p>
            </section>

            <div className="about-section-heading">
              <div><span className="about-section-eyebrow">HOW IT WORKS</span><h2>Production process</h2><p>Six coordinated stages take the material through the machine workflow.</p></div>
              <span className="about-section-side-note">01 — 06 <span>PROCESS FLOW</span></span>
            </div>
            <div className="about-process-grid">
              <article className="about-process-card"><div className="about-process-card-top"><span className="about-process-number">01</span><span className="about-process-icon"><Factory size={18} /></span></div><h3>Grinding</h3><p>The pulverizer prepares the banana-peel material for the next production stage.</p></article>
              <article className="about-process-card"><div className="about-process-card-top"><span className="about-process-number">02</span><span className="about-process-icon"><Droplet size={18} /></span></div><h3>Raw Material Dispensing</h3><p>Water, glycerin, corn starch, and vinegar are dispensed in sequence.</p></article>
              <article className="about-process-card"><div className="about-process-card-top"><span className="about-process-number">03</span><span className="about-process-icon"><Activity size={18} /></span></div><h3>Mixing &amp; Cooking</h3><p>The ingredients are combined and heated during the mixing stage.</p></article>
              <article className="about-process-card"><div className="about-process-card-top"><span className="about-process-number">04</span><span className="about-process-icon"><Layers size={18} /></span></div><h3>Molder Dispensing</h3><p>The prepared mixture is dispensed into a molder when the machine is ready.</p></article>
              <article className="about-process-card"><div className="about-process-card-top"><span className="about-process-number">05</span><span className="about-process-icon"><Gauge size={18} /></span></div><h3>Molder Transfer</h3><p>The lift and linear actuators position filled molders inside the dehydrator.</p></article>
              <article className="about-process-card"><div className="about-process-card-top"><span className="about-process-number">06</span><span className="about-process-icon"><Wind size={18} /></span></div><h3>Dehydrating</h3><p>The filled molders pass through the machine's drying stage.</p></article>
            </div>

            <div className="about-details-grid">
              <section className="panel about-info-panel">
                <div className="about-info-heading"><div className="about-info-icon"><Droplet size={18} /></div><div><h3>Raw materials &amp; sensors</h3><p>Material availability is checked before a batch begins.</p></div></div>
                <div className="about-material-grid">
                  <div><strong>Water</strong><span>Non-contact liquid sensor</span></div>
                  <div><strong>Vinegar</strong><span>Non-contact liquid sensor</span></div>
                  <div><strong>Glycerin</strong><span>Non-contact liquid sensor</span></div>
                  <div><strong>Corn starch</strong><span>IR sensor</span></div>
                </div>
                <p className="about-note">The machine start interlock checks all four material sensors. If a supply is empty, the process remains stopped until the material is replenished.</p>
              </section>

              <section className="panel about-info-panel">
                <div className="about-info-heading"><div className="about-info-icon"><Activity size={18} /></div><div><h3>Monitoring &amp; production records</h3><p>Machine data is available from the public dashboard.</p></div></div>
                <div className="about-monitor-list">
                  <div><Thermometer size={16} /><span>Temperature and humidity readings</span></div>
                  <div><Gauge size={16} /><span>Current machine state and process progress</span></div>
                  <div><Bell size={16} /><span>Machine alerts and notifications</span></div>
                  <div><History size={16} /><span>Completed and interrupted batch records</span></div>
                </div>
                <p className="about-note">The Arduino Mega controls the machine sequence. The ESP32 forwards telemetry to Firebase, and the EcoPeel web application displays the latest readings and records.</p>
              </section>
            </div>
            <footer className="page-footer"><span>EcoPeel · Banana-peel bioplastic production and monitoring</span><span><Info size={14} /> Project information</span></footer>
          </div>
        )}

        {page === "login" && (
          <div className="login-page">
            <div className="login-card">
              <div className="login-brand-mark"><Banana size={27} strokeWidth={2.2} /></div>
              <div className="eyebrow">RESTRICTED AREA</div>
              <h1>Administrator Sign In</h1>
              <p className="login-description">Sign in with your authorized EcoPeel administrator account to access production history.</p>
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

function NotificationRow({ item, expanded = false, isAdmin = false, busy = false, onMarkRead, onDelete }) {
  const category = getNotificationCategory(item);
  const Icon = category === "batch_done" ? CheckCircle2
    : category === "no_molder" ? Layers
      : category === "emergency_stop" ? Power
        : category === "empty_material" || category === "empty_chamber" ? Droplet
          : category === "over_temperature" || category === "malfunction" ? AlertTriangle
            : Bell;
  const tone = ["malfunction", "emergency_stop", "empty_chamber", "no_molder", "over_temperature", "empty_material"].includes(category)
    ? "warning"
    : category === "batch_done" ? "success" : "info";
  return (
    <div className={"notification-row " + (!item.read ? "unread" : "") + (item.active === false ? " resolved" : "")}>
      <div className={"notification-icon " + tone}><Icon size={17} /></div>
      <div className="notification-content">
        <div className="notification-title-line">
          <strong>{item.title || item.event || "Machine update"}</strong>
          {!item.read && <span className="notification-unread-pill">Unread</span>}
          <span className={"notification-category-pill " + tone}>{notificationCategoryLabel(category)}</span>
          {item.active === false && <span className="notification-resolved-pill">Resolved</span>}
        </div>
        <p>{item.message || item.description || item.details || "A machine event was recorded."}</p>
        {expanded && item.details && item.message && <small>{item.details}</small>}
      </div>
      <time>{relativeTime(item.createdAt || item.timestamp)}</time>
      {expanded && isAdmin && <div className="notification-actions">
        {!item.read && <button type="button" className="notification-action-button mark-read" disabled={busy} onClick={onMarkRead} title="Mark as read" aria-label="Mark notification as read"><Check size={14} /><span>Mark read</span></button>}
        <button type="button" className="notification-action-button delete-notification" disabled={busy} onClick={onDelete} title="Delete notification" aria-label="Delete notification"><Trash2 size={14} /><span>Delete</span></button>
      </div>}
    </div>
  );
}
