import { useEffect, useRef, useState } from "react";

/* =========================================================
   Talk to a doctor: chat, audio call, video call.
   Special CareLoop ideas in this file:
   1. Care Brief: a one-page summary built from your offline data, so you never repeat your story.
   2. Offline queue: request a doctor with no signal; it is sent when you're back online.
   3. Low-data video: small video, and calls fall back to audio if there is no camera.
   ========================================================= */

const API = "http://localhost:5000";
const MOOD_ICON = { bright: "☀️", okay: "🌤️", low: "☁️", rough: "🌧️" };
const MODES = [
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "audio", icon: "🎧", label: "Audio call" },
  { id: "video", icon: "🎥", label: "Video call" },
];
const STATUS_TEXT = { requested: "Waiting", active: "In progress", declined: "Declined", ended: "Finished" };

const dayKey = (d = new Date()) => d.toLocaleDateString("en-CA");
const drName = (n) => (/^dr\.?\s/i.test(n || "") ? n : `Dr. ${n || "Doctor"}`);

async function api(path, opts = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("careloop-token")}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body.message || "Request failed");
    e.status = res.status;
    throw e;
  }
  return body;
}

/* ---------- Offline queue ---------- */
const qKey = (email) => `careloop-consult-queue:${email}`;
const nKey = (email) => `careloop-consult-notice:${email}`;
const readQueue = (email) => {
  try {
    return JSON.parse(localStorage.getItem(qKey(email)) || "[]");
  } catch {
    return [];
  }
};

// Called by the dashboard whenever the connection comes back
export async function flushConsultQueue(email) {
  const q = readQueue(email);
  if (!q.length) return 0;
  const left = [];
  let sent = 0;
  for (const item of q) {
    try {
      await api("/consults", { method: "POST", body: item });
      sent++;
    } catch (e) {
      if (!e.status || e.status >= 500 || e.status === 401) left.push(item);
      else localStorage.setItem(nKey(email), `Your queued request could not be sent: ${e.message}`);
    }
  }
  localStorage.setItem(qKey(email), JSON.stringify(left));
  return sent;
}

/* ---------- Care Brief ---------- */
function buildBrief(data) {
  const moods = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dayKey(d);
    const c = data.checkins.find((x) => x.date === key && x.period === "evening") || data.checkins.find((x) => x.date === key);
    return { date: key, label: d.toLocaleDateString("en-IN", { weekday: "short" }), mood: c ? c.mood : null, energy: c ? c.energy : null };
  });
  const energies = moods.filter((m) => m.energy).map((m) => m.energy);
  const brief = {
    generatedAt: Date.now(),
    role: data.role,
    profile: { ...data.profile },
    moods,
    avgEnergy: energies.length ? +(energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1) : null,
    tasks: {
      done: data.tasks.filter((t) => t.done).length,
      open: data.tasks.filter((t) => !t.done).slice(0, 5).map((t) => t.text),
      total: data.tasks.length,
    },
    notes: data.notes.slice(0, 3).map((n) => String(n.text).slice(0, 200)),
  };
  if (data.role === "worker") {
    const weekAgo = Date.now() - 7 * 864e5;
    brief.shiftLoad = Math.round(
      data.shifts.filter((s) => s.end && s.end > weekAgo).reduce((a, s) => a + ((s.end - s.start) / 36e5) * s.intensity, 0)
    );
  }
  return brief;
}

function BriefCard({ brief }) {
  if (!brief) return <p className="hint">No Care Brief was shared.</p>;
  const p = brief.profile || {};
  return (
    <div className="brief">
      <h4>
        Care Brief <small>made {new Date(brief.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
      </h4>
      <p>
        <b>{p.name || "Name not set"}</b>
        {p.age ? `, ${p.age}` : ""}
        {p.blood ? ` · blood group ${p.blood}` : ""}
      </p>
      {p.allergies && <p>Allergies: {p.allergies}</p>}
      {p.conditions && <p>Ongoing conditions: {p.conditions}</p>}
      <div className="weekstrip">
        {brief.moods.map((m) => (
          <div className="day" key={m.date}>
            <span className="face">{m.mood ? MOOD_ICON[m.mood] : "·"}</span>
            {m.label}
          </div>
        ))}
      </div>
      <p>
        Average energy this week: <b>{brief.avgEnergy ?? "no check-ins"}</b>
        {brief.avgEnergy ? " of 5" : ""}
      </p>
      <p>
        Daily tasks: <b>{brief.tasks.done}</b> of {brief.tasks.total} done
        {brief.tasks.open.length > 0 && <> · still open: {brief.tasks.open.join(", ")}</>}
      </p>
      {brief.shiftLoad !== undefined && <p>Shift load this week: <b>{brief.shiftLoad}</b> points</p>}
      {brief.notes.length > 0 && (
        <ul>
          {brief.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   The tab: doctors list (or availability switch for doctors)
   ========================================================= */
export function ConsultTab({ data, user, online }) {
  const isDoctor = data.role === "doctor";
  const myName = data.profile.name || user.name;

  const [room, setRoom] = useState(null);
  const [list, setList] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [me, setMe] = useState({ available: false, specialty: "" });
  const [specialty, setSpecialty] = useState("");
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState("chat");
  const [reason, setReason] = useState("");
  const [attach, setAttach] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [queued, setQueued] = useState(() => readQueue(user.email).length);
  const [notice, setNotice] = useState(() => localStorage.getItem(nKey(user.email)) || "");

  useEffect(() => {
    if (notice) localStorage.removeItem(nKey(user.email));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh the lists every few seconds (so a doctor sees new requests quickly)
  useEffect(() => {
    if (room) return;
    let live = true;
    async function refresh() {
      setQueued(readQueue(user.email).length);
      if (!navigator.onLine) return;
      try {
        const r = await api("/consults");
        if (live) setList(r.consults);
        if (isDoctor) {
          const m = await api("/doctors/me");
          if (live) {
            setMe(m);
            setSpecialty((s) => s || m.specialty || "");
          }
        } else {
          const d = await api("/doctors");
          if (live) setDoctors(d.doctors);
        }
      } catch {
        /* try again on the next tick */
      }
    }
    refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      live = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isDoctor, online]);

  async function setAvail(on) {
    setErr("");
    try {
      const m = await api("/doctors/me", { method: "PUT", body: { available: on, specialty: specialty.trim(), displayName: myName } });
      setMe(m);
    } catch (e) {
      setErr(e.message === "Failed to fetch" ? "Can't reach the server." : e.message);
    }
  }

  async function sendRequest() {
    setErr("");
    setMsg("");
    const payload = {
      doctorId: sel.id,
      mode,
      reason: reason.trim(),
      patientName: myName,
      brief: attach ? buildBrief(data) : null,
    };
    if (!navigator.onLine) {
      const q = readQueue(user.email).filter((x) => x.doctorId !== sel.id);
      localStorage.setItem(qKey(user.email), JSON.stringify([...q, payload]));
      setQueued(q.length + 1);
      setMsg("You're offline. Your request is saved on this phone and will be sent automatically when you're back online.");
      setSel(null);
      setReason("");
      return;
    }
    try {
      const r = await api("/consults", { method: "POST", body: payload });
      setSel(null);
      setReason("");
      setRoom(r.consult.id);
    } catch (e) {
      setErr(e.message === "Failed to fetch" ? "Can't reach the server." : e.message);
    }
  }

  if (room) return <ConsultRoom id={room} onClose={() => setRoom(null)} />;

  const rows = (
    <section className="panel">
      <h3>{isDoctor ? "Consult requests" : "My consults"}</h3>
      {list.length === 0 ? (
        <p className="hint">{isDoctor ? "No requests yet. Go available above and patients can find you." : "Nothing yet. Pick a doctor above to start."}</p>
      ) : (
        list.map((c) => {
          const other = c.side === "doctor" ? c.patientName : drName(c.doctorName);
          const isNew = c.side === "doctor" && c.status === "requested";
          return (
            <div className={"patient" + (isNew ? " new" : "")} key={c.id}>
              <div>
                <b>{other}</b>
                <small>
                  {MODES.find((m) => m.id === c.mode)?.icon} {MODES.find((m) => m.id === c.mode)?.label} ·{" "}
                  {new Date(c.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {c.reason ? ` · ${c.reason.slice(0, 60)}` : ""}
                </small>
              </div>
              <div className="row-actions">
                <span className={`status-tag ${c.status}`}>{isNew ? "New request" : STATUS_TEXT[c.status]}</span>
                <button className="btn btn-small" onClick={() => setRoom(c.id)}>
                  Open
                </button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );

  /* ----- Doctor view ----- */
  if (isDoctor) {
    return (
      <div className="stack">
        {notice && <p className="msg-error">{notice}</p>}
        <section className="panel tint-lilac">
          <h3>Your availability</h3>
          <p className="hint">While you're available, patients and healthcare workers can see you and ask for a chat, audio call or video call.</p>
          <label className="field">
            <span>Your specialty</span>
            <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. General medicine" />
          </label>
          {err && <p className="msg-error">{err}</p>}
          {me.available ? (
            <>
              <p className="msg-ok">You're available. Keep this app open to receive requests.</p>{" "}
              <button className="btn" onClick={() => setAvail(false)}>Go offline</button>{" "}
              <button className="btn btn-ghost" onClick={() => setAvail(true)}>Save specialty</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setAvail(true)} disabled={!online}>Go available</button>
          )}
          {!online && <p className="hint" style={{ marginTop: 10 }}>You're offline. Connect to the internet to go available.</p>}
        </section>
        {rows}
      </div>
    );
  }

  /* ----- Patient / healthcare worker view ----- */
  return (
    <div className="stack">
      {notice && <p className="msg-error">{notice}</p>}
      {queued > 0 && <p className="msg-ok">{queued} request{queued > 1 ? "s" : ""} waiting for a connection. Sent automatically when you're online.</p>}
      {msg && <p className="msg-ok">{msg}</p>}

      <section className="panel tint-mint">
        <h3>Doctors available now</h3>
        <p className="hint">
          Your Care Brief goes with your request, so the doctor already knows how your week has been. No need to repeat your story.
        </p>
        {!online && <p className="hint">You're offline. You can still write a request below once you pick a doctor from the last list you saw, or try again when you have signal.</p>}
        {doctors.length === 0 ? (
          <p className="hint">
            No doctors are online right now. To try this yourself, open CareLoop in a second browser, sign in as a Doctor, and tap "Go available".
          </p>
        ) : (
          <div className="doc-list">
            {doctors.map((d) => (
              <div key={d.id} className={"doc-card" + (sel?.id === d.id ? " on" : "")}>
                <span className="avatar" aria-hidden="true">{(d.name || "D").replace(/^dr\.?\s*/i, "").charAt(0).toUpperCase()}</span>
                <div>
                  <b>{drName(d.name)}</b>
                  <small>{d.specialty}</small>
                  <span className="status-tag active">Available now</span>
                </div>
                <button className="btn btn-primary btn-small" onClick={() => { setSel(d); setErr(""); setMsg(""); }}>
                  Talk
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {sel && (
        <section className="panel">
          <h3>Talk to {drName(sel.name)}</h3>
          <p className="hint">How would you like to talk?</p>
          <div className="chips">
            {MODES.map((m) => (
              <button key={m.id} className={"chip" + (mode === m.id ? " on" : "")} onClick={() => setMode(m.id)}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>What would you like help with?</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sore throat since two days, mild fever…" maxLength={500} />
          </label>
          <label className="check-line">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            Share my Care Brief with this doctor
          </label>
          {attach && (
            <details className="brief-preview">
              <summary>See exactly what will be shared</summary>
              <BriefCard brief={buildBrief(data)} />
            </details>
          )}
          {err && <p className="msg-error">{err}</p>}
          <button className="btn btn-primary" onClick={sendRequest}>
            {online ? "Send request" : "Save request for when I'm online"}
          </button>{" "}
          <button className="btn btn-ghost" onClick={() => setSel(null)}>Cancel</button>
        </section>
      )}

      {rows}
    </div>
  );
}

/* =========================================================
   The consult room: chat + audio/video call
   ========================================================= */
function ConsultRoom({ id, onClose }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [call, setCall] = useState("idle"); // idle | calling | incoming | live
  const [note, setNote] = useState("");
  const [lowData, setLowData] = useState(true);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);

  const pc = useRef(null);
  const stream = useRef(null);
  const remoteStream = useRef(null);
  const pendingOffer = useRef(null);
  const pendingIce = useRef([]);
  const since = useRef(null); // null until the first load
  const sideRef = useRef(null);
  const busy = useRef(false);
  const localV = useRef(null);
  const remoteV = useRef(null);
  const logEnd = useRef(null);

  /* ----- call helpers (only use refs and setters, so the polling timer can call them safely) ----- */
  const signal = (type, data) => api(`/consults/${id}/signal`, { method: "POST", body: { type, data } }).catch(() => {});

  function endLocal(message) {
    pc.current?.close();
    pc.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    remoteStream.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    setCall("idle");
    setMic(true);
    setCam(true);
    if (message !== undefined) setNote(message);
  }

  async function getMedia(wantVideo, small) {
    if (stream.current) return stream.current;
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo ? (small ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } } : true) : false,
      });
    } catch (e) {
      if (!wantVideo) throw e;
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
      setNote("Camera not available, so you joined with audio only.");
    }
    stream.current = s;
    if (localV.current) localV.current.srcObject = s;
    setTimeout(() => {
      if (localV.current && stream.current) localV.current.srcObject = stream.current;
    }, 300);
    return s;
  }

  function makePC() {
    const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.current.getTracks().forEach((t) => p.addTrack(t, stream.current));
    p.onicecandidate = (e) => {
      if (e.candidate) signal("ice", e.candidate.toJSON());
    };
    p.ontrack = (e) => {
      remoteStream.current = e.streams[0];
      if (remoteV.current) remoteV.current.srcObject = e.streams[0];
      setTimeout(() => {
        if (remoteV.current && remoteStream.current) remoteV.current.srcObject = remoteStream.current;
      }, 300);
    };
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") setCall("live");
      if (p.connectionState === "failed") endLocal("The call could not connect. Try again, or use chat.");
    };
    pc.current = p;
  }

  async function flushIce() {
    const items = pendingIce.current;
    pendingIce.current = [];
    for (const ice of items) {
      try {
        await pc.current.addIceCandidate(ice);
      } catch {
        /* ignore a bad candidate */
      }
    }
  }

  async function handleSignal(s) {
    if (s.from === sideRef.current) return;
    if (s.type === "offer") {
      pendingOffer.current = s.data;
      pendingIce.current = [];
      setCall("incoming");
    } else if (s.type === "answer") {
      if (pc.current && pc.current.signalingState === "have-local-offer") {
        await pc.current.setRemoteDescription(s.data);
        await flushIce();
      }
    } else if (s.type === "ice") {
      if (pc.current && pc.current.remoteDescription) {
        try {
          await pc.current.addIceCandidate(s.data);
        } catch {
          /* ignore */
        }
      } else pendingIce.current.push(s.data);
    } else if (s.type === "hangup") {
      endLocal("The other person ended the call.");
    }
  }

  // When you open the room late, only react to a call that is still ringing
  function firstSignals(all, side) {
    let idx = -1;
    all.forEach((s, i) => {
      if (s.type === "offer" || s.type === "hangup") idx = i;
    });
    if (idx < 0 || all[idx].type !== "offer" || all[idx].from === side) return [];
    if (all.slice(idx).some((s) => s.type === "answer")) return [];
    return all.slice(idx);
  }

  async function poll() {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api(`/consults/${id}?since=${since.current ?? 0}`);
      sideRef.current = r.consult.side;
      setC(r.consult);
      let sigs = r.signals;
      if (since.current === null) sigs = firstSignals(r.signals, r.consult.side);
      since.current = r.total;
      for (const s of sigs) await handleSignal(s);
      setErr("");
    } catch (e) {
      setErr(e.status === 404 ? "This consult no longer exists." : "Connection lost. Trying again…");
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      clearInterval(t);
      endLocal();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (localV.current && stream.current) localV.current.srcObject = stream.current;
    if (remoteV.current && remoteStream.current) remoteV.current.srcObject = remoteStream.current;
  }, [call]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [c?.messages?.length]);

  /* ----- actions ----- */
  async function startCall() {
    setNote("");
    setCall("calling");
    try {
      await getMedia(c.mode === "video", lowData);
      makePC();
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await signal("offer", pc.current.localDescription.toJSON());
    } catch (e) {
      endLocal(e.name === "NotAllowedError" ? "Please allow microphone (and camera) access in your browser, then try again." : `Could not start the call: ${e.message}`);
    }
  }

  async function answerCall() {
    setNote("");
    setCall("live");
    try {
      await getMedia(c.mode === "video", lowData);
      makePC();
      await pc.current.setRemoteDescription(pendingOffer.current);
      await flushIce();
      const ans = await pc.current.createAnswer();
      await pc.current.setLocalDescription(ans);
      await signal("answer", pc.current.localDescription.toJSON());
    } catch (e) {
      endLocal(e.name === "NotAllowedError" ? "Please allow microphone (and camera) access in your browser, then try again." : `Could not join the call: ${e.message}`);
    }
  }

  function hangup() {
    signal("hangup", {});
    endLocal("Call ended.");
  }

  function toggleMic() {
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !mic));
    setMic(!mic);
  }
  function toggleCam() {
    stream.current?.getVideoTracks().forEach((t) => (t.enabled = !cam));
    setCam(!cam);
  }

  async function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      await api(`/consults/${id}/messages`, { method: "POST", body: { text: t } });
      poll();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function setStatus(status) {
    try {
      await api(`/consults/${id}/status`, { method: "POST", body: { status } });
      if (status === "ended" && call !== "idle") hangup();
      poll();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  if (!c) return <section className="panel"><p className="hint">{err || "Opening consult…"}</p></section>;

  const side = c.side;
  const other = side === "doctor" ? c.patientName : drName(c.doctorName);
  const open = c.status === "requested" || c.status === "active";
  const canCall = c.status === "active" && c.mode !== "chat";
  const modeInfo = MODES.find((m) => m.id === c.mode);

  return (
    <div className="stack room">
      <section className="panel">
        <div className="room-head">
          <div>
            <h3>{other}</h3>
            <p className="hint" style={{ margin: 0 }}>
              {modeInfo.icon} {modeInfo.label} · <span className={`status-tag ${c.status}`}>{STATUS_TEXT[c.status]}</span>
              {c.reason ? ` · ${c.reason}` : ""}
            </p>
          </div>
          <div className="row-actions">
            {open && c.status === "active" && <button className="btn btn-small" onClick={() => setStatus("ended")}>End consult</button>}
            <button className="btn btn-ghost btn-small" onClick={onClose}>Back</button>
          </div>
        </div>

        {err && <p className="msg-error" style={{ marginTop: 12 }}>{err}</p>}

        {side === "doctor" && c.status === "requested" && (
          <div className="accept-bar">
            <span>{c.patientName} is asking for a {modeInfo.label.toLowerCase()}.</span>
            <span>
              <button className="btn btn-primary btn-small" onClick={() => setStatus("active")}>Accept</button>{" "}
              <button className="btn btn-small" onClick={() => setStatus("declined")}>Decline</button>
            </span>
          </div>
        )}
        {side === "patient" && c.status === "requested" && (
          <p className="hint" style={{ marginTop: 12 }}>
            Waiting for {other} to accept. You can leave this page. Your request stays, and you'll find it under "My consults".
          </p>
        )}
        {c.status === "declined" && <p className="hint" style={{ marginTop: 12 }}>This request was declined. You can try another doctor.</p>}
        {c.status === "ended" && <p className="hint" style={{ marginTop: 12 }}>This consult has finished.</p>}
      </section>

      {canCall && (
        <section className="panel tint-sky">
          {note && <p className="msg-ok" style={{ marginBottom: 10 }}>{note}</p>}

          {call === "idle" && (
            <>
              <p className="hint">Both of you need to be on this page for the call to connect.</p>
              {c.mode === "video" && (
                <label className="check-line">
                  <input type="checkbox" checked={lowData} onChange={(e) => setLowData(e.target.checked)} />
                  Low-data video (small picture, uses less internet)
                </label>
              )}
              <button className="btn btn-primary" onClick={startCall}>
                Start {c.mode === "video" ? "video" : "audio"} call
              </button>
            </>
          )}

          {call === "incoming" && (
            <div className="accept-bar">
              <span>📞 {other} is calling</span>
              <span>
                <button className="btn btn-primary btn-small" onClick={answerCall}>Answer</button>{" "}
                <button className="btn btn-small" onClick={hangup}>Not now</button>
              </span>
            </div>
          )}

          {(call === "calling" || call === "live") && (
            <>
              <p className="hint">{call === "calling" ? `Calling ${other}…` : "Connected"}</p>
              <div className={"video-grid" + (c.mode === "audio" ? " audio" : "")}>
                <video ref={remoteV} className="vid remote" autoPlay playsInline />
                {c.mode === "video" && <video ref={localV} className="vid local" autoPlay playsInline muted />}
                {c.mode === "audio" && <div className="audio-face">🎧 Audio call with {other}</div>}
              </div>
              <div className="controls">
                <button className="btn btn-small" onClick={toggleMic}>{mic ? "Mute mic" : "Unmute mic"}</button>
                {c.mode === "video" && <button className="btn btn-small" onClick={toggleCam}>{cam ? "Turn camera off" : "Turn camera on"}</button>}
                <button className="btn btn-small danger" onClick={hangup}>Hang up</button>
              </div>
            </>
          )}
        </section>
      )}

      <div className="grid2 room-cols">
        <section className="panel">
          <h3>Chat</h3>
          <div className="chat-log room-log" aria-live="polite">
            {c.messages.length === 0 && <p className="hint">No messages yet. Say hello.</p>}
            {c.messages.map((m, i) => (
              <div key={i} className={"bubble " + (m.from === side ? "me" : "bot")}>{m.text}</div>
            ))}
            <div ref={logEnd} />
          </div>
          <form className="chat-form" onSubmit={send}>
            <input className="inline-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={open ? "Type a message" : "This consult is closed"} disabled={!open} aria-label="Message" />
            <button className="btn btn-primary" disabled={!open}>Send</button>
          </form>
          <p className="disclaimer">CareLoop is a student prototype. In an emergency call 112.</p>
        </section>

        <section className="panel tint-lilac">
          <h3>{side === "doctor" ? "Patient's Care Brief" : "Care Brief you shared"}</h3>
          <BriefCard brief={c.brief} />
        </section>
      </div>
    </div>
  );
}