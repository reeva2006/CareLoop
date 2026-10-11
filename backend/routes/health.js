import express from "express";
import HealthRecord from "../models/HealthRecord.js";
import auth from "../middleware/auth.js";

const router = express.Router();

const FIELDS = ["role", "profile", "notes", "tasks", "checkins", "shifts", "patients"];

const toClient = (doc) => ({
  role: doc.role,
  profile: doc.profile,
  notes: doc.notes,
  tasks: doc.tasks,
  checkins: doc.checkins,
  shifts: doc.shifts,
  patients: doc.patients,
  updatedAt: doc.stamp || 0,
});

// GET /api/records - load (or create) the logged-in user's record
router.get("/", auth, async (req, res) => {
  try {
    const doc = await HealthRecord.findOneAndUpdate(
      { user: req.userId },
      { $setOnInsert: { stamp: 0 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ record: toClient(doc) });
  } catch (err) {
    console.error("GET /api/records failed:", err.message);
    res.status(500).json({ message: "Could not load your record." });
  }
});

// PUT /api/records - save changes (only this user's own record, found from the token)
router.put("/", auth, async (req, res) => {
  try {
    const update = {};
    for (const f of FIELDS) if (req.body[f] !== undefined) update[f] = req.body[f];
    if (update.role && !["patient", "doctor", "worker"].includes(update.role)) delete update.role;
    update.stamp = Number(req.body.updatedAt) || Date.now();

    const doc = await HealthRecord.findOneAndUpdate(
      { user: req.userId },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ record: toClient(doc) });
  } catch (err) {
    console.error("PUT /api/records failed:", err.message);
    res.status(500).json({ message: "Could not save your record." });
  }
});

export default router;