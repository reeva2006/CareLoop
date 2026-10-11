import express from "express";
import mongoose from "mongoose";
import Consult from "../models/consults.js";
import HealthRecord from "../models/HealthRecord.js";
import auth from "../middleware/auth.js";

const router = express.Router();
const MODES = ["chat", "audio", "video"];

const sideOf = (c, uid) =>
  String(c.patient) === String(uid) ? "patient" : String(c.doctor) === String(uid) ? "doctor" : null;

const summary = (c, side) => ({
  id: String(c._id),
  patientName: c.patientName,
  doctorName: c.doctorName,
  mode: c.mode,
  reason: c.reason,
  status: c.status,
  side,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

// Find the consult and check that the logged-in user is the patient or the doctor in it
async function load(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: "Consult not found." });
    return null;
  }
  const c = await Consult.findById(req.params.id);
  const side = c && sideOf(c, req.userId);
  if (!c || !side) {
    res.status(404).json({ message: "Consult not found." });
    return null;
  }
  return { c, side };
}

// POST /api/consults - ask a doctor for a chat / audio / video consult
router.post("/", auth, async (req, res) => {
  try {
    const { doctorId, mode, reason, brief, patientName } = req.body;
    if (!mongoose.isValidObjectId(doctorId) || String(doctorId) === String(req.userId))
      return res.status(400).json({ message: "Please pick a doctor." });

    const rec = await HealthRecord.findOne({ user: doctorId, role: "doctor", available: true });
    if (!rec) return res.status(400).json({ message: "That doctor is not available right now." });

    const open = await Consult.findOne({ patient: req.userId, doctor: doctorId, status: { $in: ["requested", "active"] } });
    if (open) return res.json({ consult: summary(open, "patient") });

    let safeBrief = null;
    if (brief && JSON.stringify(brief).length < 20000) safeBrief = brief;

    const c = await Consult.create({
      patient: req.userId,
      doctor: doctorId,
      patientName: String(patientName || "Patient").slice(0, 60),
      doctorName: rec.displayName || "Doctor",
      mode: MODES.includes(mode) ? mode : "chat",
      reason: String(reason || "").slice(0, 500),
      brief: safeBrief,
    });
    res.json({ consult: summary(c, "patient") });
  } catch (err) {
    console.error("POST /api/consults failed:", err.message);
    res.status(500).json({ message: "Could not send your request." });
  }
});

// GET /api/consults - my consults (as patient or as doctor)
router.get("/", auth, async (req, res) => {
  try {
    const list = await Consult.find({ $or: [{ patient: req.userId }, { doctor: req.userId }] })
      .sort({ updatedAt: -1 })
      .limit(30)
      .select("-signals -messages -brief");
    res.json({ consults: list.map((c) => summary(c, sideOf(c, req.userId))) });
  } catch (err) {
    console.error("GET /api/consults failed:", err.message);
    res.status(500).json({ message: "Could not load consults." });
  }
});

// GET /api/consults/:id?since=N - one consult, with chat messages and any new call signals
router.get("/:id", auth, async (req, res) => {
  try {
    const found = await load(req, res);
    if (!found) return;
    const { c, side } = found;
    const since = Math.max(0, parseInt(req.query.since, 10) || 0);
    res.json({
      consult: { ...summary(c, side), brief: c.brief, messages: c.messages },
      signals: c.signals.slice(since),
      total: c.signals.length,
    });
  } catch (err) {
    console.error("GET /api/consults/:id failed:", err.message);
    res.status(500).json({ message: "Could not load this consult." });
  }
});

// POST /api/consults/:id/messages
router.post("/:id/messages", auth, async (req, res) => {
  try {
    const found = await load(req, res);
    if (!found) return;
    const { c, side } = found;
    if (!["requested", "active"].includes(c.status)) return res.status(400).json({ message: "This consult is closed." });
    const text = String(req.body.text || "").trim().slice(0, 1000);
    if (!text) return res.status(400).json({ message: "Message is empty." });
    if (c.messages.length > 500) return res.status(400).json({ message: "Chat is full." });
    await Consult.updateOne({ _id: c._id }, { $push: { messages: { from: side, text, ts: Date.now() } } });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST message failed:", err.message);
    res.status(500).json({ message: "Could not send the message." });
  }
});

// POST /api/consults/:id/status  body: { status: "active" | "declined" | "ended" }
router.post("/:id/status", auth, async (req, res) => {
  try {
    const found = await load(req, res);
    if (!found) return;
    const { c, side } = found;
    const next = req.body.status;
    if (next === "active" || next === "declined") {
      if (side !== "doctor" || c.status !== "requested") return res.status(403).json({ message: "Only the doctor can do that." });
    } else if (next !== "ended") {
      return res.status(400).json({ message: "Unknown status." });
    }
    await Consult.updateOne({ _id: c._id }, { $set: { status: next } });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST status failed:", err.message);
    res.status(500).json({ message: "Could not update the consult." });
  }
});

// POST /api/consults/:id/signal  body: { type: "offer" | "answer" | "ice" | "hangup", data }
router.post("/:id/signal", auth, async (req, res) => {
  try {
    const found = await load(req, res);
    if (!found) return;
    const { c, side } = found;
    if (c.status !== "active") return res.status(400).json({ message: "The consult is not active." });
    const type = req.body.type;
    if (!["offer", "answer", "ice", "hangup"].includes(type)) return res.status(400).json({ message: "Bad signal." });
    if (c.signals.length > 600) return res.status(400).json({ message: "Too many call attempts for one consult." });
    await Consult.updateOne({ _id: c._id }, { $push: { signals: { from: side, type, data: req.body.data ?? null, ts: Date.now() } } });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST signal failed:", err.message);
    res.status(500).json({ message: "Could not send the call signal." });
  }
});

export default router;