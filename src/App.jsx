import { useEffect, useRef, useState } from "react";
import "./App.css";
import { CarePandaWidget } from "./CareLoopExtras";
import { ConsultTab, flushConsultQueue } from "./Consult.jsx";

/* =========================================================
   CareLoop - student prototype. Use fictional data only.
   ========================================================= */

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const K = { user: "careloop-user", token: "careloop-token" };
const dataKey = (email) => `careloop-data:${(email || "").toLowerCase()}`;
const pendKey = (email) => `careloop-pending:${(email || "").toLowerCase()}`;

const ROLES = [
  { id: "patient", icon: "🌿", title: "Patient", line: "Keep my health story in one calm place" },
  { id: "doctor", icon: "🩺", title: "Doctor", line: "Follow my patients and my rounds" },
  { id: "worker", icon: "🧤", title: "Healthcare worker", line: "Watch my shift load so I don't burn out" },
];
const ROLE_NAME = { patient: "Patient", doctor: "Doctor", worker: "Healthcare worker" };

const MOODS = [
  { id: "bright", icon: "☀️", label: "Bright" },
  { id: "okay", icon: "🌤️", label: "Okay" },
  { id: "low", icon: "☁️", label: "Low" },
  { id: "rough", icon: "🌧️", label: "Rough" },
];

const SYNC_TEXT = {
  loading: ["Connecting to database…", "busy"],
  saving: ["Saving…", "busy"],
  saved: ["Saved to database", "ok"],
  local: ["Saved on this device only", "warn"],
  offline: ["Offline - saved on this device, will sync later", "warn"],
  error: ["Database not reachable - tap to retry", "bad"],
};

const emptyData = () => ({
  role: "patient",
  profile: { name: "", age: "", blood: "", allergies: "", conditions: "", contact: "" },
  notes: [],
  tasks: [],
  checkins: [],
  shifts: [],
  patients: [],
  updatedAt: 0,
});

const pickRecord = (rec = {}) => {
  const base = emptyData();
  return {
    role: rec.role || base.role,
    profile: { ...base.profile, ...(rec.profile || {}) },
    notes: rec.notes || [],
    tasks: rec.tasks || [],
    checkins: rec.checkins || [],
    shifts: rec.shifts || [],
    patients: rec.patients || [],
    updatedAt: rec.updatedAt || 0,
  };
};

function readLocal(email) {
  try {
    const raw = localStorage.getItem(dataKey(email));
    return raw ? pickRecord(JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData();
  }
}

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const dayKey = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const LogoMark = () => (
  <svg viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
    <path d="M24 12C18 4 6 4 6 12s12 8 18 0 18-8 18 0-12 8-18 0Z" />
  </svg>
);

/* =========================================================
   Root
   ========================================================= */
function App() {
  const [user, setUser] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem(K.user) || "null");
      return u && localStorage.getItem(K.token) ? u : null;
    } catch {
      return null;
    }
  });

  // Offline support: the service worker only runs in the built app (npm run build + npm run preview)
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  function logout() {
    localStorage.removeItem(K.user);
    localStorage.removeItem(K.token);
    setUser(null);
  }

  return (
    <div className="app-wrap">
      {user ? <Dashboard key={user.email} user={user} onLogout={logout} /> : <AuthScreen onAuth={setUser} />}
    </div>
  );
}

/* =========================================================
   Login / register
   ========================================================= */
function AuthScreen({ onAuth }) {
  const online = useOnline();
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("patient");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function call(path, body) {
    const res = await fetch(`${API}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Something went wrong. Please try again.");
    return data;
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!online) {
      setErr("The first sign-in needs internet. After that, CareLoop keeps working offline.");
      return;
    }
    setBusy(true);
    try {
      const email = form.email.trim().toLowerCase();
      let data;
      if (mode === "register") {
        data = await call("register", { name: form.name.trim(), email, password: form.password });
        if (!data.token) data = await call("login", { email, password: form.password });
      } else {
        data = await call("login", { email, password: form.password });
      }
      if (!data.token) throw new Error("The server did not send a login token.");
      const u = {
        email,
        name: data.user?.name || data.name || form.name.trim() || email.split("@")[0],
        role,
      };
      localStorage.setItem(K.token, data.token);
      localStorage.setItem(K.user, JSON.stringify(u));
      onAuth(u);
    } catch (ex) {
      setErr(
        ex.message === "Failed to fetch"
          ? "Can't reach the server. Check that the backend is running on port 5000."
          : ex.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-story">
        <span className="logo">
          <LogoMark /> CareLoop
        </span>
        <div>
          <h1>Care that closes the loop, every day.</h1>
          <p>
            Check in, finish your small tasks, write things down. CareLoop keeps working when the signal drops, and
            saves to the cloud as soon as you're back online.
          </p>
        </div>
        <div className="story-notes hand">
          <div className="story-note">Morning check-in done ☀️</div>
          <div className="story-note">Shift load: light this week 🌿</div>
        </div>
      </section>

      <section className="auth-form">
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="sub">First, tell us who you are.</p>

        <div className="role-grid" role="radiogroup" aria-label="I am a">
          {ROLES.map((r) => (
            <button
              type="button"
              key={r.id}
              role="radio"
              aria-checked={role === r.id}
              className={"role-card" + (role === r.id ? " on" : "")}
              onClick={() => setRole(r.id)}
            >
              <span className="ico">{r.icon}</span>
              <span>
                <b>{r.title}</b>
                <small>{r.line}</small>
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <label className="field">
              <span>Your name</span>
              <input value={form.name} onChange={set("name")} required autoComplete="name" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {err && <p className="msg-error">{err}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? `Sign in as ${ROLE_NAME[role].toLowerCase()}` : "Create account"}
          </button>
        </form>

        <p className="switch-line">
          {mode === "login" ? "New to CareLoop? " : "Already have an account? "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="disclaimer" style={{ marginTop: 18 }}>
          Student prototype. Please use fictional information only.
        </p>
      </section>
    </div>
  );
}

/* =========================================================
   Dashboard: loads from MongoDB first, saves locally always,
   syncs to MongoDB when online.
   ========================================================= */
function Dashboard({ user, onLogout }) {
  const online = useOnline();
  const [data, setData] = useState(() => readLocal(user.email));
  const [sync, setSync] = useState("loading");
  const [tab, setTab] = useState("today");

  const loaded = useRef(false); // true only after the first successful load from the database
  const skipSave = useRef(true); // don't treat the initial load as a user edit
  const dataRef = useRef(data);
  dataRef.current = data;

  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem(K.token)}`,
  });

  async function loadRecord() {
    setSync("loading");
    try {
      const res = await fetch(`${API}/api/records`, { headers: headers() });
      if (res.status === 401) return onLogout();
      if (!res.ok) throw new Error("load failed");
      const body = await res.json();
      const server = pickRecord(body.record || body);
      const local = readLocal(user.email);
      const pending = localStorage.getItem(pendKey(user.email)) === "1";
      const useLocal = pending && local.updatedAt > server.updatedAt;
      const next = { ...(useLocal ? local : server), role: user.role || server.role };
      loaded.current = true;
      skipSave.current = true;
      setData(next);
      if (useLocal || next.role !== server.role) push(next);
      else setSync("saved");
    } catch {
      setSync(navigator.onLine ? "error" : "offline");
    }
  }

  async function push(d) {
    setSync("saving");
    try {
      const res = await fetch(`${API}/api/records`, { method: "PUT", headers: headers(), body: JSON.stringify(d) });
      if (res.status === 401) return onLogout();
      if (!res.ok) throw new Error("save failed");
      if (dataRef.current.updatedAt === d.updatedAt) localStorage.removeItem(pendKey(user.email));
      setSync("saved");
    } catch {
      setSync(navigator.onLine ? "error" : "offline");
    }
  }

  // Load on start, and again whenever the connection comes back
  useEffect(() => {
    if (!online) {
      setSync("offline");
      return;
    }
    if (!loaded.current) loadRecord();
    else if (localStorage.getItem(pendKey(user.email)) === "1") push(dataRef.current);
    flushConsultQueue(user.email); // send any doctor requests saved while offline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Every change: save on this device straight away, then to the database (after a short pause)
  useEffect(() => {
    localStorage.setItem(dataKey(user.email), JSON.stringify(data));
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    localStorage.setItem(pendKey(user.email), "1");
    if (!loaded.current) {
      setSync(navigator.onLine ? "local" : "offline");
      return;
    }
    if (!navigator.onLine) {
      setSync("offline");
      return;
    }
    const t = setTimeout(() => push(data), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const update = (fn) => setData((d) => ({ ...fn(d), updatedAt: Date.now() }));

  const retry = () => {
    if (!loaded.current) loadRecord();
    else push(dataRef.current);
  };

  const role = data.role;
  const tabs = [
    { id: "today", label: "Today", icon: "🏠" },
    ...(role === "doctor" ? [{ id: "patients", label: "My patients", icon: "📋" }] : []),
    { id: "passport", label: role === "patient" ? "Health passport" : "My profile", icon: "🪪" },
    { id: "notes", label: "Notes", icon: "📝" },
    { id: "tasks", label: "Daily tasks", icon: "✅" },
    { id: "consult", label: role === "doctor" ? "Consults" : "Talk to a doctor", icon: "📞" },
    { id: "ask", label: "Ask Loop", icon: "💬" },
  ];

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (data.profile.name || user.name || "").split(" ")[0];
  const [syncLabel, syncClass] = SYNC_TEXT[sync];

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <span className="logo">
          <LogoMark /> CareLoop
        </span>
        {tabs.map((t) => (
          <button key={t.id} className={"rail-btn" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
        <div className="rail-foot">Student prototype. Fictional data only.</div>
      </nav>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="hello">
              {greet}, {first} 👋
            </p>
            <span className="role-tag">{ROLE_NAME[role]}</span>
          </div>
          <div className="top-actions">
            <button
              className={`pill ${syncClass}`}
              onClick={sync === "error" ? retry : undefined}
              title={sync === "error" ? "Try again" : undefined}
            >
              {syncLabel}
            </button>
            <button className="btn btn-ghost btn-small" onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        {tab === "today" && <TodayTab data={data} update={update} />}
        {tab === "patients" && <PatientsTab data={data} update={update} />}
        {tab === "passport" && <PassportTab data={data} update={update} role={role} />}
        {tab === "notes" && <NotesTab data={data} update={update} />}
        {tab === "tasks" && <TasksTab data={data} update={update} />}
        {tab === "consult" && <ConsultTab data={data} user={user} online={online} />}
        {tab === "ask" && <AssistantTab data={data} />}
      </main>

      <CarePandaWidget user={user} />
    </div>
  );
}

/* =========================================================
   Today: the loop ring, check-in, and role-specific card
   ========================================================= */
function LoopRing({ steps }) {
  const r = 46;
  const C = 2 * Math.PI * r;
  const seg = C / 4;
  const count = steps.filter((s) => s.done).length;
  return (
    <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={`${count} of 4 loop steps done`}>
      <g transform="rotate(-90 60 60)">
        {steps.map((s, i) => (
          <g key={i}>
            <circle className="track" cx="60" cy="60" r={r} strokeDasharray={`${seg - 8} ${C - seg + 8}`} strokeDashoffset={-i * seg} />
            {s.done && (
              <circle className={`seg s${i + 1}`} cx="60" cy="60" r={r} strokeDasharray={`${seg - 8} ${C - seg + 8}`} strokeDashoffset={-i * seg} />
            )}
          </g>
        ))}
      </g>
      <text className="big" x="60" y="62">{count}/4</text>
      <text className="small" x="60" y="78">{count === 4 ? "loop closed" : "today's loop"}</text>
    </svg>
  );
}

function TodayTab({ data, update }) {
  const today = dayKey();
  const todays = data.checkins.filter((c) => c.date === today);
  const morning = todays.find((c) => c.period === "morning");
  const evening = todays.find((c) => c.period === "evening");
  const tasksDone = data.tasks.length > 0 && data.tasks.every((t) => t.done);
  const noteToday = data.notes.some((n) => n.date === today);
  const steps = [
    { label: "Morning check-in", done: !!morning },
    { label: "Evening check-in", done: !!evening },
    { label: "All daily tasks done", done: tasksDone },
    { label: "Wrote a note", done: noteToday },
  ];

  return (
    <div className="stack">
      <section className="panel tint-mint">
        <h3>Your loop today</h3>
        <p className="hint">Four small things. Close the ring and you're done for the day.</p>
        <div className="ring-row">
          <LoopRing steps={steps} />
          <ul className="ring-list">
            {steps.map((s, i) => (
              <li key={i} className={s.done ? "done" : ""}>
                <span className={`dot s${i + 1}` + (s.done ? " on" : "")} />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CheckIn data={data} update={update} />
      {data.role === "worker" && <ShiftCard data={data} update={update} />}
      {data.role === "doctor" && <FollowUps data={data} update={update} />}
      <WeekStrip checkins={data.checkins} />
    </div>
  );
}

function CheckIn({ data, update }) {
  const [period, setPeriod] = useState(new Date().getHours() < 15 ? "morning" : "evening");
  const [mood, setMood] = useState("okay");
  const [energy, setEnergy] = useState(3);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  function save() {
    const entry = { id: uid(), date: dayKey(), period, mood, energy, text: text.trim(), ts: Date.now() };
    update((d) => ({
      ...d,
      checkins: [entry, ...d.checkins.filter((c) => !(c.date === entry.date && c.period === period))].slice(0, 120),
    }));
    setText("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section className="panel">
      <h3>How are you doing?</h3>
      <p className="hint">A quick check-in takes about ten seconds.</p>
      <div className="chips">
        {["morning", "evening"].map((p) => (
          <button key={p} className={"chip" + (period === p ? " on" : "")} onClick={() => setPeriod(p)}>
            {p === "morning" ? "Morning" : "Evening"}
          </button>
        ))}
      </div>
      <div className="chips">
        {MOODS.map((m) => (
          <button key={m.id} className={"chip" + (mood === m.id ? " on" : "")} onClick={() => setMood(m.id)}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Energy: {energy} of 5</span>
        <input className="range" type="range" min="1" max="5" value={energy} onChange={(e) => setEnergy(+e.target.value)} />
        <div className="range-labels"><span>Drained</span><span>Full of beans</span></div>
      </label>
      <label className="field">
        <span>Anything on your mind? (optional)</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Slept badly, mild headache…" />
      </label>
      <button className="btn btn-primary" onClick={save}>Save {period} check-in</button>{" "}
      {saved && <span className="msg-ok">Check-in saved</span>}
    </section>
  );
}

function WeekStrip({ checkins }) {
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dayKey(d);
    const c = checkins.find((x) => x.date === key && x.period === "evening") || checkins.find((x) => x.date === key);
    const mood = c ? MOODS.find((m) => m.id === c.mood) : null;
    return { key, label: d.toLocaleDateString("en-IN", { weekday: "short" }), face: mood ? mood.icon : "·", today: i === 6 };
  });
  return (
    <section className="panel tint-sky">
      <h3>Your last seven days</h3>
      <p className="hint">The mood you logged each day.</p>
      <div className="weekstrip">
        {days.map((d) => (
          <div key={d.key} className={"day" + (d.today ? " today" : "")}>
            <span className="face">{d.face}</span>
            {d.label}
          </div>
        ))}
      </div>
    </section>
  );
}

/* Healthcare worker: shift load, in the spirit of a dose over time.
   load = hours worked x how demanding the shift felt (1-5). Self-tracking guide, not a clinical limit. */
function ShiftCard({ data, update }) {
  const [intensity, setIntensity] = useState(3);
  const active = data.shifts.find((s) => !s.end);
  const LIMIT = 120; // e.g. five 8-hour shifts at "3"
  const weekAgo = Date.now() - 7 * 864e5;
  const done = data.shifts.filter((s) => s.end && s.end > weekAgo);
  const load = done.reduce((sum, s) => sum + ((s.end - s.start) / 36e5) * s.intensity, 0);
  const pct = Math.min(100, (load / LIMIT) * 100);
  const level = pct < 50 ? 1 : pct < 80 ? 2 : pct < 100 ? 3 : 4;
  const words = [
    "",
    "Light week so far. Nice and steady.",
    "A steady week. Keep your breaks.",
    "Getting heavy. Plan some real rest.",
    "Over your weekly guide. Talk to your supervisor about rest.",
  ][level];

  const start = () => update((d) => ({ ...d, shifts: [{ id: uid(), start: Date.now(), end: null, intensity: 0 }, ...d.shifts] }));
  const end = () =>
    update((d) => ({
      ...d,
      shifts: d.shifts.map((s) => (s.id === active.id ? { ...s, end: Date.now(), intensity } : s)),
    }));

  return (
    <section className="panel tint-lilac">
      <h3>Shift load this week</h3>
      <p className="hint">Hours worked times how demanding each shift felt. A simple guide for yourself, not a clinical limit.</p>
      <div className="load-bar" aria-hidden="true">
        <div className={`load-fill l${level}`} style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <div className="load-scale"><span>Light</span><span>Steady</span><span>Heavy</span><span>Over</span></div>
      <p><b>{Math.round(load)}</b> of {LIMIT} points. {words}</p>

      {!active ? (
        <button className="btn btn-primary" onClick={start}>Start shift</button>
      ) : (
        <>
          <p className="msg-ok">Shift running since {new Date(active.start).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
          <div className="chips" style={{ marginTop: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={"chip" + (intensity === n ? " on" : "")} onClick={() => setIntensity(n)}>
                {n} {["calm", "light", "busy", "heavy", "intense"][n - 1]}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={end}>End shift</button>
        </>
      )}

      {done.length > 0 && (
        <ul className="list-plain">
          {done.slice(0, 4).map((s) => (
            <li key={s.id}>
              <span>{new Date(s.start).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
              <span>{((s.end - s.start) / 36e5).toFixed(1)} h, felt {s.intensity}/5</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowUps({ data, update }) {
  const today = dayKey();
  const due = data.patients.filter((p) => p.followUp && p.followUp <= today);
  return (
    <section className="panel tint-lilac">
      <h3>Follow-ups due</h3>
      {due.length === 0 ? (
        <p className="hint">Nobody is due today. Add patients in the "My patients" tab.</p>
      ) : (
        due.map((p) => (
          <div className="patient" key={p.id}>
            <div>
              <b>{p.name}</b>
              <small>{p.reason || "Follow-up"} <span className="due">due {p.followUp}</span></small>
            </div>
            <button
              className="btn btn-small"
              onClick={() => update((d) => ({ ...d, patients: d.patients.map((x) => (x.id === p.id ? { ...x, followUp: "" } : x)) }))}
            >
              Done
            </button>
          </div>
        ))
      )}
    </section>
  );
}

/* =========================================================
   Doctor: patients
   ========================================================= */
function PatientsTab({ data, update }) {
  const [f, setF] = useState({ name: "", age: "", reason: "", followUp: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function add(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    update((d) => ({ ...d, patients: [{ id: uid(), ...f, name: f.name.trim() }, ...d.patients] }));
    setF({ name: "", age: "", reason: "", followUp: "" });
  }
  return (
    <div className="stack">
      <section className="panel">
        <h3>Add a patient</h3>
        <p className="hint">Fictional names only, please.</p>
        <form onSubmit={add}>
          <div className="form-grid">
            <label className="field"><span>Name</span><input value={f.name} onChange={set("name")} required /></label>
            <label className="field"><span>Age</span><input value={f.age} onChange={set("age")} inputMode="numeric" /></label>
            <label className="field"><span>Reason for visit</span><input value={f.reason} onChange={set("reason")} /></label>
            <label className="field"><span>Follow-up date</span><input type="date" value={f.followUp} onChange={set("followUp")} /></label>
          </div>
          <button className="btn btn-primary">Add patient</button>
        </form>
      </section>
      <section className="panel">
        <h3>My patients ({data.patients.length})</h3>
        {data.patients.length === 0 && <p className="hint">No patients yet. Add the first one above.</p>}
        {data.patients.map((p) => (
          <div className="patient" key={p.id}>
            <div>
              <b>{p.name}{p.age ? `, ${p.age}` : ""}</b>
              <small>{p.reason || "No reason noted"}{p.followUp ? ` · follow-up ${p.followUp}` : ""}</small>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => update((d) => ({ ...d, patients: d.patients.filter((x) => x.id !== p.id) }))}>
              Remove
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

/* =========================================================
   Passport / profile, notes, tasks
   ========================================================= */
function PassportTab({ data, update, role }) {
  const p = data.profile;
  const set = (k) => (e) => update((d) => ({ ...d, profile: { ...d.profile, [k]: e.target.value } }));
  return (
    <section className="panel">
      <h3>{role === "patient" ? "Health passport" : "My profile"}</h3>
      <p className="hint">Fictional details only. This works offline and syncs when you're connected.</p>
      <div className="form-grid">
        <label className="field"><span>Full name</span><input value={p.name} onChange={set("name")} /></label>
        <label className="field"><span>Age</span><input value={p.age} onChange={set("age")} inputMode="numeric" /></label>
        <label className="field"><span>Blood group</span>
          <select value={p.blood} onChange={set("blood")}>
            <option value="">Not set</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label className="field"><span>Emergency contact</span><input value={p.contact} onChange={set("contact")} /></label>
      </div>
      <label className="field"><span>Allergies</span><input value={p.allergies} onChange={set("allergies")} placeholder="e.g. dust, peanuts" /></label>
      <label className="field"><span>Ongoing conditions</span><textarea value={p.conditions} onChange={set("conditions")} /></label>
    </section>
  );
}

function NotesTab({ data, update }) {
  const [text, setText] = useState("");
  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    update((d) => ({
      ...d,
      notes: [{ id: uid(), text: text.trim(), date: dayKey(), ts: Date.now() }, ...d.notes],
    }));
    setText("");
  }
  return (
    <section className="panel">
      <h3>Notes</h3>
      <p className="hint">Symptoms, questions for the next visit, anything you want to remember.</p>
      <form onSubmit={add}>
        <label className="field"><span>New note</span><textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button className="btn btn-primary">Stick it on the wall</button>
      </form>
      {data.notes.length === 0 ? (
        <p className="hint" style={{ marginTop: 16 }}>No notes yet.</p>
      ) : (
        <div className="notes-grid">
          {data.notes.map((n) => (
            <div className="sticky" key={n.id}>
              <button className="x" aria-label="Delete note" onClick={() => update((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== n.id) }))}>×</button>
              {n.text}
              <small>{new Date(n.ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TasksTab({ data, update }) {
  const [text, setText] = useState("");
  const done = data.tasks.filter((t) => t.done).length;
  const pct = data.tasks.length ? (done / data.tasks.length) * 100 : 0;
  const add = (t) => {
    const v = (t ?? text).trim();
    if (!v) return;
    update((d) => ({ ...d, tasks: [...d.tasks, { id: uid(), text: v, done: false }] }));
    setText("");
  };
  return (
    <section className="panel">
      <h3>Daily tasks</h3>
      <p className="hint">{data.tasks.length ? `${done} of ${data.tasks.length} done` : "Add a few small things for today."}</p>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="inline-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task" />
        <button className="btn btn-primary">Add</button>
      </form>
      <div className="chips">
        {["Drink 8 glasses of water", "Take medicines", "10 minute walk", "Sleep before 11"].map((s) => (
          <button key={s} className="chip" onClick={() => add(s)}>+ {s}</button>
        ))}
      </div>
      {data.tasks.map((t) => (
        <div key={t.id} className={"task" + (t.done ? " done" : "")}>
          <input
            type="checkbox"
            checked={t.done}
            aria-label={t.text}
            onChange={() => update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))}
          />
          <span>{t.text}</span>
          <button className="btn btn-ghost btn-small" onClick={() => update((d) => ({ ...d, tasks: d.tasks.filter((x) => x.id !== t.id) }))}>Remove</button>
        </div>
      ))}
      {done > 0 && (
        <button className="btn btn-small" style={{ marginTop: 8 }} onClick={() => update((d) => ({ ...d, tasks: d.tasks.filter((t) => !t.done) }))}>
          Clear finished tasks
        </button>
      )}
    </section>
  );
}

/* =========================================================
   Ask Loop: AI assistant when the server has a key, a built-in helper otherwise
   ========================================================= */
const EMERGENCY_RE = /chest pain|can'?t breathe|cannot breathe|difficulty breathing|unconscious|seizure|stroke|heavy bleeding|overdose|poison/i;
const SELF_HARM_RE = /suicid|kill myself|self.?harm|want to die|end my life/i;

// Built-in knowledge so Loop still helps with no internet or no AI key. General tips only.
const TOPICS = [
  { re: /needle ?stick|sharps|needlestick|blood splash|splash(ed)? (in|into) (my )?(eye|mouth)/, tip: "Wash the area with soap and running water straight away. Don't squeeze or scrub the wound. Rinse splashes in the eyes or mouth with plenty of clean water. Then report it immediately to your supervisor or infection-control team, even if the wound looks small, because any preventive treatment works best when started within hours." },
  { re: /headache|migraine/, tip: "Rest in a quiet, dim room, sip water and give your eyes a break from screens.", see: "it comes on suddenly and severely, follows a head injury, or comes with fever, a stiff neck, confusion, vision changes or weakness." },
  { re: /fever|temperature/, tip: "Rest, drink plenty of fluids, wear light clothing and keep track of your temperature.", see: "it is very high, lasts more than 2 to 3 days, or comes with trouble breathing, a rash, confusion or a stiff neck. A baby with a fever needs a doctor promptly." },
  { re: /cough|cold|runny nose|congestion/, tip: "Warm fluids, rest and steam can ease the symptoms.", see: "it lasts more than a week, you feel short of breath, cough up blood, or have a high fever." },
  { re: /sore throat|throat pain/, tip: "Warm salt-water gargles, warm fluids and rest usually help.", see: "it lasts more than a few days, you can't swallow, or you have a high fever." },
  { re: /diarrh|vomit|loose motion|stomach|nausea/, tip: "Sip oral rehydration solution (ORS) or other clean fluids often, and eat light food when you can.", see: "you can't keep fluids down, see blood, feel very weak or dizzy, or it lasts beyond 2 days. Children and older people should be seen sooner." },
  { re: /back pain|neck pain|backache/, tip: "Keep gently moving, avoid sitting for long stretches, try warmth, and check your lifting posture.", see: "it follows a fall or injury, spreads down a leg with numbness, or comes with fever or trouble passing urine." },
  { re: /sprain|twist|pulled muscle|swelling/, tip: "Rest it, hold a cold pack wrapped in cloth on it for 15 to 20 minutes, use light compression and raise the limb.", see: "you can't put weight on it, it looks misshapen, or the swelling is severe." },
  { re: /burn|scald/, tip: "Cool the burn under cool running water for about 20 minutes, remove rings or tight items nearby, and cover it loosely with a clean cloth. Don't use ice, butter or toothpaste.", see: "it is larger than your palm, on the face, hands or genitals, deep or blistering badly, or caused by chemicals or electricity." },
  { re: /\bcut\b|wound|bleeding/, tip: "Press firmly with a clean cloth to stop the bleeding, then rinse with clean water and cover it.", see: "bleeding doesn't stop after 10 minutes of pressure, the cut is deep or gaping, or it came from a dirty, rusty object or an animal bite." },
  { re: /water|hydrat|dehydrat|thirst/, tip: "Small, regular sips through the day work better than a lot at once. Pale-yellow urine is a good sign you're hydrated.", see: "you feel dizzy, very weak, or pass very little urine." },
  { re: /sleep|insomnia|can'?t sleep/, tip: "Try a fixed bedtime, no screens for 30 minutes before bed, and a cool, dark room.", see: "sleep trouble goes on for weeks or affects your daily life." },
  { re: /stress|anxious|anxiety|worried|panic/, tip: "Try slow breathing: in for 4, out for 6, a few times. Talking to someone you trust helps too.", see: "it feels too heavy, lasts for weeks, or affects eating, sleep or work." },
];

function offlineReply(q, data) {
  const t = q.toLowerCase();
  const open = data.tasks.filter((x) => !x.done);
  if (/task|todo|to-do|pending/.test(t))
    return open.length
      ? `You have ${open.length} task${open.length > 1 ? "s" : ""} left today:\n• ${open.map((x) => x.text).join("\n• ")}`
      : data.tasks.length
      ? "All your tasks are done. Nicely done! 🌿"
      : "You haven't added any tasks yet. Try the Daily tasks tab.";
  if (/mood|check.?in|how have i been|feeling log/.test(t)) {
    const c = data.checkins[0];
    if (!c) return "You haven't logged a check-in yet. The Today tab takes about ten seconds.";
    const m = MOODS.find((x) => x.id === c.mood);
    return `Your last check-in (${c.date}, ${c.period}): ${m.icon} ${m.label}, energy ${c.energy}/5.${c.text ? ` You wrote: "${c.text}".` : ""}`;
  }
  if (/shift|load|burn ?out|exhaust/.test(t) && data.role === "worker")
    return "Check the Shift load card on the Today tab. If you feel exhausted, tell your supervisor and take a proper break. Rest is part of safe care.";
  for (const topic of TOPICS) {
    if (topic.re.test(t)) return topic.see ? `${topic.tip}\n\nSee a doctor if ${topic.see}` : topic.tip;
  }
  if (/doctor|consult|video|audio|appointment|call/.test(t))
    return "Open the \"Talk to a doctor\" tab to see doctors who are available now. You can ask for a chat, an audio call or a video call, and your Care Brief goes along so you don't have to repeat yourself.";
  return "I can help with your tasks and check-ins, and with general tips on things like headache, fever, cough, stomach upset, burns, cuts, sprains, sleep, water and stress. For anything that worries you, use the \"Talk to a doctor\" tab.";
}

function AssistantTab({ data }) {
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hi, I'm Loop 👋 Ask me about healthy habits, your tasks or your check-ins. I can't diagnose anything, but I can point you in a sensible direction." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  const [why, setWhy] = useState("");
  const [aiReady, setAiReady] = useState(null); // null = checking
  const [locating, setLocating] = useState(false);
  const [locationInfo, setLocationInfo] = useState(null);
  const [locationError, setLocationError] = useState("");
  const endRef = useRef(null);

  // Keep the effect synchronous; React effects must not return a Promise or a DOM method result.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/chat/status`, { headers: { Authorization: `Bearer ${localStorage.getItem(K.token)}` } })
      .then((r) => (r.ok ? r.json() : { ai: false, down: true }))
      .then((b) => live && setAiReady(b.ai ? true : b.down ? "down" : false))
      .catch(() => live && setAiReady("down"));
    return () => {
      live = false;
    };
  }, []);

  const add = (m) => setMsgs((x) => [...x, m]);

  function getEmergencyLocation() {
    setLocationError("");
    setLocationInfo(null);

    if (!navigator.geolocation) {
      setLocationError("This browser does not support location. You can call 112 and describe your location instead.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationInfo({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === 1
            ? "Location permission was denied. Allow location access in your browser settings, or describe your location when calling 112."
            : "Could not get your location. Check your device location settings and try again, or call 112 directly."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function send(q) {
    const content = (q ?? text).trim();
    if (!content || busy) return;
    setText("");
    const next = [...msgs, { role: "user", content }];
    setMsgs(next);

    if (SELF_HARM_RE.test(content)) {
      add({ role: "assistant", content: "I'm really sorry you're feeling this way. You deserve support right now. Please talk to someone you trust, or call Tele-MANAS at 14416. If you might act on these thoughts, call 112 or go to the nearest hospital. I'm just a prototype assistant, but I'm glad you told me." });
      return;
    }
    if (EMERGENCY_RE.test(content)) {
      add({ role: "assistant", content: "This could be serious. Please call 112 now, or ask someone nearby to take you to the nearest hospital. I'm only a prototype and can't help in an emergency." });
      return;
    }

    setBusy(true);
    let reply = null;
    let reason = "";
    try {
      if (!navigator.onLine) {
        reason = "you are offline";
      } else {
        // Do not let a slow/unreachable backend stop the built-in offline helper.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(`${API}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem(K.token) || ""}`,
            },
            body: JSON.stringify({ role: data.role, messages: next.slice(-10) }),
            signal: controller.signal,
          });
          if (res.ok) {
            const body = await res.json().catch(() => ({}));
            reply = typeof body.reply === "string" ? body.reply.trim() : "";
            if (!reply) reason = "the AI returned an empty reply";
          } else {
            const body = await res.json().catch(() => ({}));
            reason = body.message || `server error ${res.status}`;
          }
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      reason = error?.name === "AbortError"
        ? "the AI request timed out, so the built-in helper answered"
        : "the backend could not be reached";
    }

    if (reply) {
      setMode("ai");
      setWhy("");
    } else {
      reply = offlineReply(content, data);
      setMode("offline");
      setWhy(reason);
    }
    add({ role: "assistant", content: reply });
    setBusy(false);
  }

  return (
    <section className="panel tint-sky">
      <h3>Ask Loop</h3>
      <p className="hint">Your health helper. It still answers when you're offline, using built-in tips.</p>
      <div className="emergency-location" style={{ margin: "0 0 16px", padding: 14, border: "1px solid #d7e2ee", borderRadius: 12, background: "#fff" }}>
        <b>Emergency location</b>
        <p className="hint" style={{ margin: "6px 0 10px" }}>Get your current coordinates and a map link. This does not automatically contact emergency services.</p>
        <div className="chips">
          <button type="button" className="btn btn-primary" onClick={getEmergencyLocation} disabled={locating}>
            {locating ? "Finding location…" : "Get My Emergency Location"}
          </button>
          <a className="btn btn-ghost" href="tel:112">Call 112</a>
        </div>
        {locationInfo && (
          <p style={{ marginBottom: 0, overflowWrap: "anywhere" }}>
            Coordinates: {locationInfo.latitude.toFixed(6)}, {locationInfo.longitude.toFixed(6)}<br />
            <a href={`https://www.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}`} target="_blank" rel="noreferrer">Open this location in Google Maps</a>
          </p>
        )}
        {locationError && <p className="msg-error" role="alert">{locationError}</p>}
      </div>
      {aiReady === true && <p className="msg-ok" style={{ marginBottom: 12 }}>AI assistant connected</p>}
      {aiReady === false && (
        <p className="msg-error">
          The AI assistant is not configured yet. Check OPENROUTER_API_KEY in your backend .env file and restart the backend. Loop will keep using its built-in helper.
        </p>
      )}
      {aiReady === "down" && <p className="msg-error">The backend couldn't be reached, so Loop is using its built-in helper.</p>}
      <div className="chat">
        <div className="chat-log" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={"bubble " + (m.role === "user" ? "me" : "bot")}>{m.content}</div>
          ))}
          {busy && <div className="bubble bot">Thinking…</div>}
          <div ref={endRef} />
        </div>
        <div className="chips">
          {["What tasks are left today?", "I have a headache", "Tips for better sleep", "How do I treat a burn?"].map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input className="inline-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question" aria-label="Message Loop" />
          <button className="btn btn-primary" disabled={busy}>Send</button>
        </form>
        <p className="chat-meta">
          {mode === "ai" ? "Answered by the AI assistant." : mode === "offline" ? `Built-in helper answered${why ? ` (${why})` : ""}.` : ""}
        </p>
        <p className="disclaimer">Loop gives general information, not medical advice. In an emergency call 112.</p>
      </div>
    </section>
  );
}

export default App;