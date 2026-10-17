import { useEffect, useMemo, useRef, useState } from "react";
import "./CareLoopExtras.css";

/*
 * CareLoop feature add-on.
 * - Offline-first emergency info
 * - Fictional/demo doctor directory (hours are examples, not real availability)
 * - OpenStreetMap hospital search with local cache for offline viewing
 * - Local medicine reminders and follow-up planner
 * - Report organizer stores files in this browser's IndexedDB
 *
 * This is a student prototype. Browser storage is not encrypted; use fictional data only.
 */

const STORAGE_PREFIX = "careloop-extras-v1";
const INDIA_EMERGENCY_NUMBER = "112";

const DEMO_DOCTORS = [
  {
    id: "demo-doc-1",
    name: "Dr. Asha Menon",
    specialty: "General Physician",
    clinic: "CareLoop Demo Clinic",
    days: "Monday–Saturday",
    hours: "09:00–13:00",
    note: "Fictional profile for testing only",
  },
  {
    id: "demo-doc-2",
    name: "Dr. Kabir Rao",
    specialty: "Cardiology",
    clinic: "CareLoop Demo Clinic",
    days: "Wednesday and Friday",
    hours: "10:00–14:00",
    note: "Fictional profile for testing only",
  },
  {
    id: "demo-doc-3",
    name: "Dr. Nila Joseph",
    specialty: "Dermatology",
    clinic: "CareLoop Demo Clinic",
    days: "Monday, Tuesday and Thursday",
    hours: "11:00–15:00",
    note: "Fictional profile for testing only",
  },
  {
    id: "demo-doc-4",
    name: "Dr. Arjun Das",
    specialty: "Pediatrics",
    clinic: "CareLoop Demo Clinic",
    days: "Monday–Saturday",
    hours: "09:00–12:00",
    note: "Fictional profile for testing only",
  },
  {
    id: "demo-doc-5",
    name: "Dr. Sara Thomas",
    specialty: "Neurology",
    clinic: "CareLoop Demo Clinic",
    days: "Tuesday, Thursday and Saturday",
    hours: "14:00–17:00",
    note: "Fictional profile for testing only",
  },
];

const localKey = (kind, user) =>
  `${STORAGE_PREFIX}:${kind}:${String(user?.email || "guest").trim().toLowerCase()}`;

function loadLocal(kind, user, fallback) {
  try {
    const value = localStorage.getItem(localKey(kind, user));
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(kind, user, value) {
  try {
    localStorage.setItem(localKey(kind, user), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function useNetworkState() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const yes = () => setOnline(true);
    const no = () => setOnline(false);
    window.addEventListener("online", yes);
    window.addEventListener("offline", no);
    return () => {
      window.removeEventListener("online", yes);
      window.removeEventListener("offline", no);
    };
  }, []);
  return online;
}

function fmtTime(value) {
  if (!value) return "Not set";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(value) {
  if (!value) return "No date";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/* IndexedDB stores report files locally so PDFs/images can be opened while offline. */
const REPORT_DB = "careloop-report-files-v1";
const REPORT_STORE = "files";
function openReportDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("This browser does not support local report storage."));
    const request = indexedDB.open(REPORT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORT_STORE)) db.createObjectStore(REPORT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open report storage."));
  });
}

async function storeReportFile(id, file) {
  const db = await openReportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readwrite");
    tx.objectStore(REPORT_STORE).put({ id, blob: file, name: file.name, type: file.type || "application/octet-stream" });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not save this file.")); };
  });
}

async function readReportFile(id) {
  const db = await openReportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, "readonly");
    const request = tx.objectStore(REPORT_STORE).get(id);
    request.onsuccess = () => {
      const result = request.result;
      db.close();
      if (result?.blob) resolve({ blob: result.blob, name: result.name, type: result.type });
      else reject(new Error("The saved file could not be found on this device."));
    };
    request.onerror = () => { db.close(); reject(request.error || new Error("Could not open this saved file.")); };
  });
}

async function deleteReportFile(id) {
  const db = await openReportDb();
  return new Promise((resolve) => {
    const tx = db.transaction(REPORT_STORE, "readwrite");
    tx.objectStore(REPORT_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

function hospitalFromOsm(element) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const addressBits = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]].filter(Boolean);
  const specialty = tags["healthcare:speciality"] || tags["healthcare:specialty"] || "Specialties not listed";
  return {
    id: `${element.type}-${element.id}`,
    name: tags.name || tags["name:en"] || "Unnamed hospital",
    address: addressBits.join(", ") || tags["addr:full"] || "Address not listed in OpenStreetMap",
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    specialties: specialty,
    lat,
    lon,
    mapUrl: Number.isFinite(lat) && Number.isFinite(lon)
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(tags.name || "hospital")}`,
    source: "OpenStreetMap",
  };
}

async function findHospitalsOnline(place) {
  const geoUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(place)}`;
  const geoRes = await fetch(geoUrl, { headers: { Accept: "application/json" } });
  if (!geoRes.ok) throw new Error("The location search service is busy. Try again later.");
  const geo = await geoRes.json();
  if (!Array.isArray(geo) || !geo.length) throw new Error("Couldn't find that place. Try a city or town name.");
  const lat = Number(geo[0].lat);
  const lon = Number(geo[0].lon);
  const query = `[out:json][timeout:25];(node["amenity"="hospital"](around:8000,${lat},${lon});way["amenity"="hospital"](around:8000,${lat},${lon});relation["amenity"="hospital"](around:8000,${lat},${lon});node["healthcare"="hospital"](around:8000,${lat},${lon});way["healthcare"="hospital"](around:8000,${lat},${lon});relation["healthcare"="hospital"](around:8000,${lat},${lon}););out center tags;`;
  const osmRes = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!osmRes.ok) throw new Error("The hospital directory is temporarily unavailable. Your saved list is still available offline.");
  const payload = await osmRes.json();
  const unique = new Map();
  for (const item of (payload.elements || [])) {
    const result = hospitalFromOsm(item);
    if (result.name !== "Unnamed hospital") unique.set(result.id, result);
  }
  return { hospitals: [...unique.values()].slice(0, 40), label: geo[0].display_name || place, searchedAt: new Date().toISOString() };
}

export function CareLoopExtras({ user }) {
  const online = useNetworkState();
  const [section, setSection] = useState(() => {
    try {
      const saved = sessionStorage.getItem("careloop-open-care-section");
      if (saved) {
        sessionStorage.removeItem("careloop-open-care-section");
        return saved;
      }
    } catch { /* storage may be disabled */ }
    return "home";
  });
  const [toast, setToast] = useState("");

  const [medicines, setMedicines] = useState(() => loadLocal("medicines", user, []));
  const [followups, setFollowups] = useState(() => loadLocal("followups", user, []));
  const [reports, setReports] = useState(() => loadLocal("reports", user, []));
  const [emergencyCard, setEmergencyCard] = useState(() => loadLocal("emergency-card", user, {
    name: "", contactName: "", contactPhone: "", bloodGroup: "", allergies: "", notes: "",
  }));
  const [hospitals, setHospitals] = useState(() => loadLocal("hospitals", { email: "shared" }, []));
  const [hospitalMeta, setHospitalMeta] = useState(() => loadLocal("hospital-meta", { email: "shared" }, { label: "", searchedAt: "" }));
  const [hospitalQuery, setHospitalQuery] = useState(() => loadLocal("hospital-meta", { email: "shared" }, { query: "" }).query || "");
  const [hospitalBusy, setHospitalBusy] = useState(false);
  const [hospitalMessage, setHospitalMessage] = useState("");
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("All specialties");
  const [medForm, setMedForm] = useState({ name: "", instructions: "", time: "08:00" });
  const [followForm, setFollowForm] = useState({ doctorId: DEMO_DOCTORS[0].id, date: todayKey(), time: "10:00", note: "" });
  const [reportForm, setReportForm] = useState({ title: "", date: todayKey(), category: "Lab report", note: "" });
  const [reportBusy, setReportBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const medicineAlarmed = useRef(new Set());
  const followupAlarmed = useRef(new Set());
  const [emergencyEdit, setEmergencyEdit] = useState(false);

  useEffect(() => { saveLocal("medicines", user, medicines); }, [medicines, user]);
  useEffect(() => { saveLocal("followups", user, followups); }, [followups, user]);
  useEffect(() => { saveLocal("reports", user, reports); }, [reports, user]);
  useEffect(() => { saveLocal("emergency-card", user, emergencyCard); }, [emergencyCard, user]);
  useEffect(() => { saveLocal("hospitals", { email: "shared" }, hospitals); }, [hospitals]);
  useEffect(() => { saveLocal("hospital-meta", { email: "shared" }, { ...hospitalMeta, query: hospitalQuery }); }, [hospitalMeta, hospitalQuery]);

  useEffect(() => {
    const handleOpen = (event) => {
      const next = event.detail?.section;
      if (next) setSection(next);
    };
    window.addEventListener("careloop:open-care", handleOpen);
    return () => window.removeEventListener("careloop:open-care", handleOpen);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  // Reminders run while CareLoop is open. This is not a dependable phone alarm or background service.
  useEffect(() => {
    const now = new Date(currentTime);
    const date = todayKey(now);
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    for (const item of medicines) {
      const dueKey = `${item.id}:${date}:${item.time}`;
      if (item.time === hhmm && !(item.takenDates || []).includes(date) && !medicineAlarmed.current.has(dueKey)) {
        medicineAlarmed.current.add(dueKey);
        setToast(`Reminder: ${item.name}${item.instructions ? ` — ${item.instructions}` : ""}`);
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification("CareLoop medicine reminder", { body: `Reminder for ${item.name}. Follow your clinician's prescription.` }); } catch { /* page alert still shows */ }
        }
      }
    }
    for (const item of followups) {
      const dueAt = `${item.date}T${item.time}:00`;
      const diff = new Date(dueAt).getTime() - now.getTime();
      const noticeKey = `${item.id}:30m`;
      if (diff > 0 && diff <= 30 * 60 * 1000 && !followupAlarmed.current.has(noticeKey)) {
        followupAlarmed.current.add(noticeKey);
        setToast(`Upcoming follow-up: ${item.doctorName} at ${fmtTime(item.time)}`);
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification("CareLoop follow-up reminder", { body: `${item.doctorName} at ${fmtTime(item.time)}. This is a saved plan, not a confirmed booking.` }); } catch { /* page alert still shows */ }
        }
      }
    }
  }, [currentTime, medicines, followups]);

  const filteredDoctors = useMemo(() => DEMO_DOCTORS.filter((doctor) => {
    const query = doctorQuery.trim().toLowerCase();
    const matchesQuery = !query || `${doctor.name} ${doctor.specialty} ${doctor.clinic}`.toLowerCase().includes(query);
    const matchesSpecialty = doctorSpecialty === "All specialties" || doctor.specialty === doctorSpecialty;
    return matchesQuery && matchesSpecialty;
  }), [doctorQuery, doctorSpecialty]);

  const shownHospitals = hospitals;

  const activeMeds = medicines.filter((item) => !(item.takenDates || []).includes(todayKey()));
  const nextFollowups = [...followups].filter((item) => !item.done).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  function notify(text) {
    setToast(text);
    window.setTimeout(() => setToast((current) => current === text ? "" : current), 4500);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return notify("This browser doesn't support notifications. Keep CareLoop open to see in-page reminders.");
    try {
      const permission = await Notification.requestPermission();
      notify(permission === "granted" ? "Notifications enabled for this browser." : "Notifications not enabled. In-page reminders still work while CareLoop is open.");
    } catch {
      notify("Notifications could not be enabled. In-page reminders still work while CareLoop is open.");
    }
  }

  async function searchHospitals(e) {
    e?.preventDefault();
    const place = hospitalQuery.trim();
    if (!place) return setHospitalMessage("Enter a city, town or locality first.");
    if (!online) {
      setHospitalMessage(hospitals.length ? `Offline: showing ${hospitals.length} previously saved hospital listings${hospitalMeta.searchedAt ? ` (saved ${new Date(hospitalMeta.searchedAt).toLocaleString()})` : ""}.` : "You are offline and no hospital search has been saved yet. Search once when online to save a list for later.");
      return;
    }
    setHospitalBusy(true);
    setHospitalMessage("Searching OpenStreetMap for hospital listings…");
    try {
      const result = await findHospitalsOnline(place);
      setHospitals(result.hospitals);
      setHospitalMeta({ label: result.label, searchedAt: result.searchedAt });
      setHospitalMessage(result.hospitals.length
        ? `${result.hospitals.length} listing(s) saved on this device. Check each hospital directly for current services and opening hours.`
        : "No hospital listings were returned for this area. Try a nearby city or locality.");
    } catch (error) {
      setHospitalMessage(`${error.message || "Hospital search failed."}${hospitals.length ? " Showing your saved list below." : ""}`);
    } finally {
      setHospitalBusy(false);
    }
  }

  function addMedicine(e) {
    e.preventDefault();
    const name = medForm.name.trim();
    if (!name || !medForm.time) return;
    setMedicines((items) => [{ id: makeId(), name, instructions: medForm.instructions.trim(), time: medForm.time, takenDates: [], createdAt: new Date().toISOString() }, ...items]);
    setMedForm({ name: "", instructions: "", time: "08:00" });
    notify("Reminder saved on this device. Follow the prescription from your clinician.");
  }

  async function addReport(e) {
    e.preventDefault();
    if (!reportForm.title.trim()) return notify("Add a name for the report first.");
    const input = document.getElementById("clx-report-file");
    const file = input?.files?.[0];
    if (file && file.size > 8 * 1024 * 1024) return notify("Choose a file smaller than 8 MB for this prototype.");
    setReportBusy(true);
    const fileId = file ? makeId() : "";
    try {
      if (file) await storeReportFile(fileId, file);
      setReports((items) => [{
        id: makeId(), title: reportForm.title.trim(), date: reportForm.date,
        category: reportForm.category, note: reportForm.note.trim(),
        fileId, fileName: file?.name || "", fileType: file?.type || "", fileSize: file?.size || 0,
      }, ...items].sort((a, b) => b.date.localeCompare(a.date)));
      setReportForm({ title: "", date: todayKey(), category: "Lab report", note: "" });
      setFileInputKey((v) => v + 1);
      notify(file ? "Report details and file saved locally on this device." : "Report note saved locally on this device.");
    } catch (error) {
      notify(error.message || "Could not save this report.");
    } finally {
      setReportBusy(false);
    }
  }

  async function downloadReport(report) {
    if (!report.fileId) return notify("This entry contains notes only; no file was attached.");
    try {
      const result = await readReportFile(report.fileId);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.name || report.fileName || "careloop-report";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    } catch (error) {
      notify(error.message || "Could not open the report file.");
    }
  }

  async function removeReport(report) {
    if (report.fileId) await deleteReportFile(report.fileId);
    setReports((items) => items.filter((item) => item.id !== report.id));
    notify("Report entry removed from this device.");
  }

  function scheduleFollowup(e) {
    e.preventDefault();
    const doctor = DEMO_DOCTORS.find((entry) => entry.id === followForm.doctorId) || DEMO_DOCTORS[0];
    setFollowups((items) => [{
      id: makeId(), doctorId: doctor.id, doctorName: doctor.name,
      date: followForm.date, time: followForm.time, note: followForm.note.trim(), done: false,
      source: "demo", createdAt: new Date().toISOString(),
    }, ...items].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)));
    setSection("followups");
    notify("Saved as a reminder only. This does not book a real appointment.");
  }

  function planDoctor(doctor) {
    setFollowForm((form) => ({ ...form, doctorId: doctor.id }));
    setSection("followups");
    notify("Choose a date and time to save a follow-up reminder. This is not a booking.");
  }

  function markMedicineTaken(item) {
    const today = todayKey();
    setMedicines((items) => items.map((m) => m.id === item.id
      ? { ...m, takenDates: [...new Set([...(m.takenDates || []), today])] }
      : m));
    notify(`${item.name} marked as taken for today. Only mark it if you actually took it as prescribed.`);
  }

  function setEmergencyField(field, value) {
    setEmergencyCard((current) => ({ ...current, [field]: value }));
  }

  function openEmergency() {
    setSection("emergency");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sectionList = [
    ["home", "Overview", "🏠"],
    ["emergency", "Emergency", "🆘"],
    ["hospitals", "Hospitals", "🏥"],
    ["doctors", "Find a doctor", "🩺"],
    ["medicines", "Pill reminders", "💊"],
    ["followups", "Follow-up", "📅"],
    ["reports", "Reports", "📄"],
  ];

  return (
    <section className="clx-page" aria-label="CareLoop care centre">
      <div className="clx-heading">
        <div>
          <div className="clx-eyebrow">CARELOOP CARE CENTRE</div>
          <h2>Everyday care, even offline.</h2>
          <p>Your emergency card and saved reminders stay on this device. Reconnect to refresh hospital listings.</p>
        </div>
        <div className={`clx-network ${online ? "is-online" : "is-offline"}`}><span />{online ? "Online" : "Offline mode"}</div>
      </div>

      <div className="clx-emergency-strip">
        <div className="clx-emergency-symbol">✚</div>
        <div className="clx-emergency-copy">
          <strong>Emergency help</strong>
          <span>India's emergency number is 112. Calling requires phone/network service.</span>
        </div>
        <a className="clx-call-button" href="tel:112" aria-label="Call India's emergency number 112">Call 112</a>
        <button className="clx-text-button clx-light-text" onClick={openEmergency}>Emergency card</button>
      </div>

      <div className="clx-section-nav" aria-label="Care centre features">
        {sectionList.map(([id, label, icon]) => (
          <button key={id} className={`clx-nav-chip ${section === id ? "active" : ""}`} onClick={() => setSection(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {!online && <div className="clx-offline-note"><span>●</span> Offline ready: emergency instructions, demo doctor schedules, medicine reminders, saved follow-ups, and saved reports work on this device. Hospital search only shows previously saved results.</div>}
      {toast && <div className="clx-toast" role="status"><span>🔔</span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}>×</button></div>}

      {section === "home" && (
        <div className="clx-grid">
          <button className="clx-feature-card clx-feature-emergency" onClick={() => setSection("emergency")}>
            <span className="clx-feature-icon">🆘</span><span className="clx-feature-title">Offline emergency card</span><span className="clx-feature-description">Keep your key demo details and emergency steps in one place.</span><span className="clx-feature-link">Open emergency card →</span>
          </button>
          <button className="clx-feature-card" onClick={() => setSection("hospitals")}>
            <span className="clx-feature-icon">🏥</span><span className="clx-feature-title">Nearby hospitals</span><span className="clx-feature-description">Search actual OpenStreetMap listings while online and save them for later.</span><span className="clx-feature-link">Find hospitals →</span>
          </button>
          <button className="clx-feature-card" onClick={() => setSection("doctors")}>
            <span className="clx-feature-icon">🩺</span><span className="clx-feature-title">Find my doctor</span><span className="clx-feature-description">Try fictional doctor profiles and sample consultation hours.</span><span className="clx-feature-link">Browse sample doctors →</span>
          </button>
          <button className="clx-feature-card" onClick={() => setSection("medicines")}>
            <span className="clx-feature-icon">💊</span><span className="clx-feature-title">Pill reminders</span><span className="clx-feature-description">Save medicine names, prescribed instructions and times on this device.</span><span className="clx-feature-link">Manage reminders →</span>
          </button>
          <button className="clx-feature-card" onClick={() => setSection("followups")}>
            <span className="clx-feature-icon">📅</span><span className="clx-feature-title">CareLoop Follow-Up</span><span className="clx-feature-description">Save appointment plans and reminders; no real booking occurs.</span><span className="clx-feature-link">Open follow-ups →</span>
          </button>
          <button className="clx-feature-card" onClick={() => setSection("reports")}>
            <span className="clx-feature-icon">📂</span><span className="clx-feature-title">Report organizer</span><span className="clx-feature-description">Keep report files and notes available offline in this browser.</span><span className="clx-feature-link">Organize reports →</span>
          </button>
          <div className="clx-summary-card">
            <div><strong>{activeMeds.length}</strong><span>medicine reminders remaining today</span></div>
            <div><strong>{nextFollowups.length}</strong><span>saved follow-ups</span></div>
            <div><strong>{reports.length}</strong><span>report entries</span></div>
          </div>
          <p className="clx-privacy-note">Prototype storage note: this add-on saves data in this browser only. Browser storage is not encrypted. Use fictional data in this student demo and do not rely on it as your only reminder or emergency plan.</p>
        </div>
      )}

      {section === "emergency" && (
        <div className="clx-columns">
          <div className="clx-card clx-emergency-card">
            <div className="clx-card-top"><div><span className="clx-kicker">OFFLINE-FIRST</span><h3>Emergency steps</h3></div><span className="clx-big-emoji">🆘</span></div>
            <ol className="clx-emergency-steps">
              <li><strong>For a life-threatening emergency in India, call 112.</strong><span>Use the phone dialler. A mobile/network connection is needed.</span></li>
              <li><strong>Get help from a nearby trusted person.</strong><span>Tell them your location and what kind of help is needed.</span></li>
              <li><strong>Follow the emergency operator's instructions.</strong><span>Do not wait for the chatbot or this website to diagnose an emergency.</span></li>
              <li><strong>Share this card if it is safe to do so.</strong><span>It is saved in this browser, but may not be available on another phone.</span></li>
            </ol>
            <a className="clx-call-button clx-call-wide" href="tel:112">☎ Call 112</a>
            <p className="clx-small-print">112 is India's pan-India emergency number according to the Government of India. <a href="https://112.gov.in/" target="_blank" rel="noreferrer">Official ERSS information</a>.</p>
          </div>
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">SAVED ON THIS DEVICE</span><h3>Emergency information card</h3></div><button className="clx-small-action" onClick={() => setEmergencyEdit((v) => !v)}>{emergencyEdit ? "Done" : "Edit"}</button></div>
            {emergencyEdit ? (
              <div className="clx-form-grid">
                <label>Name <input value={emergencyCard.name} onChange={(e) => setEmergencyField("name", e.target.value)} placeholder="Demo name" maxLength={80} /></label>
                <label>Emergency contact name <input value={emergencyCard.contactName} onChange={(e) => setEmergencyField("contactName", e.target.value)} placeholder="Trusted contact" maxLength={80} /></label>
                <label>Emergency contact phone <input value={emergencyCard.contactPhone} onChange={(e) => setEmergencyField("contactPhone", e.target.value)} placeholder="Phone number" inputMode="tel" maxLength={30} /></label>
                <label>Blood group (optional) <select value={emergencyCard.bloodGroup} onChange={(e) => setEmergencyField("bloodGroup", e.target.value)}><option value="">Not recorded</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="clx-span-all">Allergies / relevant notes (demo only) <textarea value={emergencyCard.allergies} onChange={(e) => setEmergencyField("allergies", e.target.value)} placeholder="Only add information you choose to keep on this device." rows={2} maxLength={400} /></label>
                <label className="clx-span-all">Other emergency instructions <textarea value={emergencyCard.notes} onChange={(e) => setEmergencyField("notes", e.target.value)} placeholder="Short practical notes" rows={2} maxLength={400} /></label>
                <p className="clx-helper clx-span-all">Saved automatically on this device. Avoid real sensitive health information in this prototype.</p>
              </div>
            ) : (
              <div className="clx-emergency-details">
                <div><span>Name</span><strong>{emergencyCard.name || "Not added"}</strong></div>
                <div><span>Emergency contact</span><strong>{emergencyCard.contactName || "Not added"}</strong></div>
                <div><span>Contact phone</span><strong>{emergencyCard.contactPhone || "Not added"}</strong>{emergencyCard.contactPhone && <a href={`tel:${emergencyCard.contactPhone.replace(/[^+\d]/g, "")}`}>Call contact</a>}</div>
                <div><span>Blood group</span><strong>{emergencyCard.bloodGroup || "Not recorded"}</strong></div>
                <div><span>Allergies / notes</span><strong>{emergencyCard.allergies || "Not added"}</strong></div>
                <div><span>Other instructions</span><strong>{emergencyCard.notes || "Not added"}</strong></div>
              </div>
            )}
            <p className="clx-small-print">This card does not automatically send your information or location to emergency services.</p>
          </div>
        </div>
      )}

      {section === "hospitals" && (
        <div className="clx-card">
          <div className="clx-card-top"><div><span className="clx-kicker">REAL DIRECTORY DATA</span><h3>Hospital finder</h3><p className="clx-subcopy">Search OpenStreetMap listings by city or locality. The list is cached on this device for offline viewing.</p></div><span className="clx-big-emoji">🏥</span></div>
          <form className="clx-search-row" onSubmit={searchHospitals}>
            <label className="clx-search-label"><span>City, town or locality</span><input value={hospitalQuery} onChange={(e) => setHospitalQuery(e.target.value)} placeholder="For example, Mangaluru" maxLength={120} /></label>
            <button className="clx-primary-button" type="submit" disabled={hospitalBusy}>{hospitalBusy ? "Searching…" : online ? "Search hospitals" : "Show saved list"}</button>
          </form>
          {hospitalMessage && <p className="clx-inline-message" role="status">{hospitalMessage}</p>}
          {hospitalMeta.label && <p className="clx-helper">Last searched area: {hospitalMeta.label}{hospitalMeta.searchedAt ? ` · Saved ${new Date(hospitalMeta.searchedAt).toLocaleString()}` : ""}</p>}
          {!online && !hospitals.length && <div className="clx-empty"><strong>No offline hospital list saved yet.</strong><span>When you have a connection, search a locality once. You can then view those results offline.</span></div>}
          {online && !hospitalBusy && !hospitals.length && !hospitalMessage && <div className="clx-empty">Enter a place and search to find directory listings.</div>}
          <div className="clx-hospital-list">
            {shownHospitals.map((hospital) => (
              <article className="clx-hospital-row" key={hospital.id}>
                <div className="clx-list-icon">🏥</div>
                <div className="clx-list-main"><strong>{hospital.name}</strong><span>{hospital.address}</span><small>Specialties: {hospital.specialties}</small>{hospital.phone && <small>Phone: {hospital.phone}</small>}<small className="clx-source-label">Directory listing · OpenStreetMap · availability not confirmed</small></div>
                <div className="clx-list-actions"><a href={hospital.mapUrl} target="_blank" rel="noreferrer">Map / directions ↗</a>{hospital.phone && <a href={`tel:${hospital.phone.replace(/[^+\d]/g, "")}`}>Call hospital</a>}{hospital.website && /^https?:\/\//i.test(hospital.website) && <a href={hospital.website} target="_blank" rel="noreferrer">Website ↗</a>}</div>
              </article>
            ))}
          </div>
              <p className="clx-small-print">Map data © OpenStreetMap contributors. Directory entries may be incomplete or outdated; verify the hospital, services, opening hours and emergency capacity directly. Search requires internet; previously saved results can be viewed offline.</p>
        </div>
      )}

      {section === "doctors" && (
        <div className="clx-card">
          <div className="clx-card-top"><div><span className="clx-kicker">DEMO DATABASE · FICTIONAL PEOPLE</span><h3>Find my doctor</h3><p className="clx-subcopy">These invented names and sample hours are for testing only. They are not real doctors and cannot be booked.</p></div><span className="clx-big-emoji">🩺</span></div>
          <div className="clx-search-row clx-doctor-filters">
            <label className="clx-search-label"><span>Search doctors or specialties</span><input value={doctorQuery} onChange={(e) => setDoctorQuery(e.target.value)} placeholder="Try cardiology" maxLength={100} /></label>
            <label className="clx-search-label"><span>Specialty</span><select value={doctorSpecialty} onChange={(e) => setDoctorSpecialty(e.target.value)}><option>All specialties</option>{[...new Set(DEMO_DOCTORS.map((d) => d.specialty))].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="clx-doctor-grid">
            {filteredDoctors.map((doctor) => (
              <article className="clx-doctor-card" key={doctor.id}>
                <div className="clx-doctor-avatar">{doctor.name.split(" ").slice(-1)[0][0]}</div>
                <div className="clx-doctor-demo">DEMO PROFILE</div>
                <h4>{doctor.name}</h4><p>{doctor.specialty}</p>
                <div className="clx-schedule"><span>Sample hours</span><strong>{doctor.hours}</strong><small>{doctor.days}</small></div>
                <p className="clx-doctor-clinic">{doctor.clinic}</p>
                <p className="clx-small-print">Not real availability. Contact a real provider to confirm care and appointment times.</p>
                <button className="clx-secondary-button" onClick={() => planDoctor(doctor)}>Add follow-up reminder</button>
              </article>
            ))}
            {!filteredDoctors.length && <div className="clx-empty">No matching sample doctors. Try another specialty.</div>}
          </div>
        </div>
      )}

      {section === "medicines" && (
        <div className="clx-columns">
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">LOCAL REMINDERS</span><h3>Pill reminders</h3><p className="clx-subcopy">Enter only the medicine and timing prescribed by your clinician. CareLoop does not recommend doses.</p></div><span className="clx-big-emoji">💊</span></div>
            <form className="clx-form-grid" onSubmit={addMedicine}>
              <label className="clx-span-all">Medicine name <input required value={medForm.name} onChange={(e) => setMedForm((f) => ({ ...f, name: e.target.value }))} placeholder="Medicine name" maxLength={100} /></label>
              <label className="clx-span-all">Dose / instructions as prescribed <input value={medForm.instructions} onChange={(e) => setMedForm((f) => ({ ...f, instructions: e.target.value }))} placeholder="Example: as written on the prescription" maxLength={150} /></label>
              <label>Reminder time <input type="time" required value={medForm.time} onChange={(e) => setMedForm((f) => ({ ...f, time: e.target.value }))} /></label>
              <button className="clx-primary-button clx-align-end" type="submit">Save reminder</button>
            </form>
            <button className="clx-text-button" type="button" onClick={enableNotifications}>Enable browser notifications</button>
            <p className="clx-small-print">Important: reminders run while CareLoop is open. The browser may not alert if the app is closed, the device is off, permissions are denied, or battery restrictions intervene. Use a reliable device alarm too.</p>
          </div>
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">TODAY</span><h3>Your medicine list</h3></div><span className="clx-count-pill">{medicines.length}</span></div>
            {!medicines.length && <div className="clx-empty">No reminders saved yet. Add one on the left.</div>}
            <div className="clx-reminder-list">
              {[...medicines].sort((a, b) => a.time.localeCompare(b.time)).map((item) => {
                const taken = (item.takenDates || []).includes(todayKey());
                return <article className={`clx-reminder-row ${taken ? "is-done" : ""}`} key={item.id}>
                  <div className="clx-time-badge">{fmtTime(item.time)}</div><div className="clx-list-main"><strong>{item.name}</strong><span>{item.instructions || "Follow the instructions on your prescription"}</span><small>{taken ? "Marked taken today" : "Saved on this device"}</small></div>
                  <div className="clx-list-actions">{!taken && <button onClick={() => markMedicineTaken(item)}>Mark taken</button>}<button className="clx-danger-link" onClick={() => setMedicines((items) => items.filter((m) => m.id !== item.id))}>Remove</button></div>
                </article>;
              })}
            </div>
          </div>
        </div>
      )}

      {section === "followups" && (
        <div className="clx-columns">
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">PLAN ONLY</span><h3>Save a follow-up</h3><p className="clx-subcopy">This creates a reminder in CareLoop. It does not contact a clinic or book an appointment.</p></div><span className="clx-big-emoji">📅</span></div>
            <form className="clx-form-grid" onSubmit={scheduleFollowup}>
              <label className="clx-span-all">Doctor (demo database) <select value={followForm.doctorId} onChange={(e) => setFollowForm((f) => ({ ...f, doctorId: e.target.value }))}>{DEMO_DOCTORS.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}</select></label>
              <label>Date <input type="date" required min={todayKey()} value={followForm.date} onChange={(e) => setFollowForm((f) => ({ ...f, date: e.target.value }))} /></label>
              <label>Time <input type="time" required value={followForm.time} onChange={(e) => setFollowForm((f) => ({ ...f, time: e.target.value }))} /></label>
              <label className="clx-span-all">Note (optional) <textarea rows={2} value={followForm.note} onChange={(e) => setFollowForm((f) => ({ ...f, note: e.target.value }))} placeholder="What should I remember to ask?" maxLength={400} /></label>
              <button className="clx-primary-button clx-span-all" type="submit">Save follow-up reminder</button>
            </form>
          </div>
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">SAVED ON THIS DEVICE</span><h3>Upcoming follow-ups</h3></div><span className="clx-count-pill">{nextFollowups.length}</span></div>
            {!nextFollowups.length && <div className="clx-empty">No saved follow-ups yet.</div>}
            <div className="clx-reminder-list">
              {nextFollowups.map((item) => <article className="clx-reminder-row" key={item.id}>
                <div className="clx-time-badge clx-date-badge">{formatDate(item.date)}<small>{fmtTime(item.time)}</small></div>
                <div className="clx-list-main"><strong>{item.doctorName}</strong><span>{item.note || "No note added"}</span><small>Reminder only · not a confirmed appointment</small></div>
                <div className="clx-list-actions"><button onClick={() => setFollowups((list) => list.map((f) => f.id === item.id ? { ...f, done: true } : f))}>Complete</button><button className="clx-danger-link" onClick={() => setFollowups((list) => list.filter((f) => f.id !== item.id))}>Delete</button></div>
              </article>)}
              {followups.filter((f) => f.done).map((item) => <article className="clx-reminder-row is-done" key={item.id}>
                <div className="clx-time-badge">Done</div><div className="clx-list-main"><strong>{item.doctorName}</strong><span>{formatDate(item.date)} · {fmtTime(item.time)}</span></div><div className="clx-list-actions"><button className="clx-danger-link" onClick={() => setFollowups((list) => list.filter((f) => f.id !== item.id))}>Delete</button></div>
              </article>)}
            </div>
          </div>
        </div>
      )}

      {section === "reports" && (
        <div className="clx-columns">
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">LOCAL FILE STORAGE</span><h3>Organize a report</h3><p className="clx-subcopy">PDFs and images are saved locally in this browser using IndexedDB. Maximum 8 MB per file.</p></div><span className="clx-big-emoji">📂</span></div>
            <form className="clx-form-grid" onSubmit={addReport}>
              <label className="clx-span-all">Report name <input required value={reportForm.title} onChange={(e) => setReportForm((f) => ({ ...f, title: e.target.value }))} placeholder="Example: Blood test report" maxLength={120} /></label>
              <label>Report date <input type="date" required value={reportForm.date} onChange={(e) => setReportForm((f) => ({ ...f, date: e.target.value }))} /></label>
              <label>Type <select value={reportForm.category} onChange={(e) => setReportForm((f) => ({ ...f, category: e.target.value }))}>{["Lab report", "Prescription", "Scan / imaging", "Discharge summary", "Other"].map((v) => <option key={v}>{v}</option>)}</select></label>
              <label className="clx-span-all">Attach PDF / image (optional) <input key={fileInputKey} id="clx-report-file" type="file" accept="application/pdf,image/*" /></label>
              <label className="clx-span-all">Notes (optional) <textarea rows={2} value={reportForm.note} onChange={(e) => setReportForm((f) => ({ ...f, note: e.target.value }))} placeholder="Short label or reminder—not a diagnosis" maxLength={400} /></label>
              <button className="clx-primary-button clx-span-all" type="submit" disabled={reportBusy}>{reportBusy ? "Saving…" : "Save report locally"}</button>
            </form>
          </div>
          <div className="clx-card">
            <div className="clx-card-top"><div><span className="clx-kicker">OFFLINE LIBRARY</span><h3>Saved reports</h3></div><span className="clx-count-pill">{reports.length}</span></div>
            {!reports.length && <div className="clx-empty">No report entries yet. Add a report on the left.</div>}
            <div className="clx-reminder-list">
              {reports.map((report) => <article className="clx-reminder-row" key={report.id}>
                <div className="clx-list-icon">{report.category === "Prescription" ? "💊" : "📄"}</div>
                <div className="clx-list-main"><strong>{report.title}</strong><span>{report.category} · {formatDate(report.date)}</span>{report.fileName && <small>{report.fileName} · {(report.fileSize / (1024 * 1024)).toFixed(2)} MB</small>}{report.note && <small>{report.note}</small>}</div>
                <div className="clx-list-actions">{report.fileId && <button onClick={() => downloadReport(report)}>Open / download</button>}<button className="clx-danger-link" onClick={() => removeReport(report)}>Delete</button></div>
              </article>)}
            </div>
          </div>
        </div>
      )}

      <p className="clx-footer-note">CareLoop is a student prototype, not a medical service. Sample doctors are fictional; directory listings are not verified medical recommendations. For emergencies, call the local emergency number. In India, call 112.</p>
    </section>
  );
}

export function CarePandaWidget({ user }) {
  const online = useNetworkState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([
    { role: "panda", text: "Hi, I'm CarePanda 🐼 I can help you open emergency information, find hospitals, or set reminders. I don't diagnose or replace a doctor." },
  ]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function openCareCentre(section = "home") {
    if (!user && section === "emergency") {
      setOpen(true);
      setMessages((items) => [...items, { role: "panda", text: "OFFLINE EMERGENCY INFO: If there is immediate danger in India, call 112 if your phone has service. Ask a nearby trusted person for help and follow emergency operator instructions. This website does not send your location or contact responders automatically." }]);
      return;
    }
    try { sessionStorage.setItem("careloop-open-care-section", section); } catch { /* event still works if mounted */ }
    setOpen(false);
    window.dispatchEvent(new CustomEvent("careloop:open-care", { detail: { section } }));
    if (!user) {
      setOpen(true);
      setMessages((items) => [...items, { role: "panda", text: "Sign in to open the full Care Centre. The emergency call option below remains available without signing in." }]);
    }
  }

  function askPanda(e) {
    e?.preventDefault();
    const text = query.trim();
    if (!text) return;
    setMessages((items) => [...items, { role: "user", text }]);
    setQuery("");
    const urgent = /chest pain|can't breathe|cannot breathe|difficulty breathing|unconscious|seizure|heavy bleeding|severe bleeding|stroke|overdose|poison/i.test(text);
    let reply;
    if (urgent) {
      reply = "This may be an emergency. In India, call 112 now or ask a nearby trusted person to help. Do not wait for this assistant.";
    } else if (/hospital|nearby|location|clinic/i.test(text)) {
      reply = online ? "I can open the hospital finder. Search a city or locality to load current directory listings, then they will be saved on this device." : "You're offline. I can open the hospital finder to show any listings saved on this device earlier.";
    } else if (/doctor|specialist|cardio|skin|dermat|child|pediatric|neuro/i.test(text)) {
      reply = "I can open sample doctor profiles with example hours. They are fictional demo records—not real doctors or confirmed availability.";
    } else if (/pill|medicine|medication|tablet|remind/i.test(text)) {
      reply = "I can open local medicine reminders. Enter only the name and schedule from a clinician's instructions. Browser reminders may not run if CareLoop is closed.";
    } else if (/report|appointment|follow.?up/i.test(text)) {
      reply = "I can open follow-ups and the offline report organiser. Saved files stay in this browser and are not uploaded.";
    } else {
      reply = "I can help navigate CareLoop, but I can't diagnose symptoms. Try: ‘find a hospital’, ‘show doctor profiles’, ‘pill reminder’, or ‘emergency help’.";
    }
    setMessages((items) => [...items, { role: "panda", text: reply }]);
  }

  return (
    <div className="clx-panda-widget">
      {open && <section className="clx-panda-panel" aria-label="CarePanda assistant">
        <header className="clx-panda-header"><div className="clx-panda-face">🐼</div><div><strong>CarePanda</strong><span>{online ? "Care assistant · online" : "Care assistant · offline"}</span></div><button onClick={() => setOpen(false)} aria-label="Close CarePanda">×</button></header>
        <div className="clx-panda-messages" aria-live="polite">
          {messages.slice(-8).map((message, index) => <div key={`${index}-${message.role}`} className={`clx-panda-bubble ${message.role === "user" ? "from-user" : "from-panda"}`}>{message.text}</div>)}
        </div>
        <div className="clx-panda-shortcuts">
          <button onClick={() => openCareCentre("emergency")}>🆘 Emergency</button>
          <button onClick={() => openCareCentre("hospitals")}>🏥 Hospitals</button>
          <button onClick={() => openCareCentre("doctors")}>🩺 Doctors</button>
          <button onClick={() => openCareCentre("medicines")}>💊 Pill reminders</button>
        </div>
        <form className="clx-panda-form" onSubmit={askPanda}><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you need help with?" aria-label="Ask CarePanda" maxLength={300} /><button type="submit" aria-label="Send message">➤</button></form>
        <p className="clx-panda-disclaimer">Not a medical professional. For an emergency in India, call 112.</p>
        <a className="clx-panda-emergency-link" href="tel:112">Call 112</a>
      </section>}
      <button className={`clx-panda-fab ${open ? "is-open" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={open ? "Close CarePanda assistant" : "Open CarePanda assistant"} aria-expanded={open}>
        <span className="clx-panda-fab-face">🐼</span><span className="clx-panda-fab-label">CarePanda</span><span className={`clx-panda-status ${online ? "" : "offline"}`} title={online ? "Online" : "Offline"} />
      </button>
    </div>
  );
}
