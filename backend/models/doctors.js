import express from "express";
import HealthRecord from "../models/HealthRecord.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// GET /api/doctors - doctors who are available right now
router.get("/", auth, async (req, res) => {
  try {
    const docs = await HealthRecord.find({ role: "doctor", available: true, user: { $ne: req.userId } })
      .select("user displayName specialty")
      .limit(50)
      .lean();
    res.json({
      doctors: docs.map((d) => ({
        id: String(d.user),
        name: d.displayName || "Doctor",
        specialty: d.specialty || "General medicine",
      })),
    });
  } catch (err) {
    console.error("GET /api/doctors failed:", err.message);
    res.status(500).json({ message: "Could not load doctors." });
  }
});

// GET /api/doctors/me - my own availability (for doctors)
router.get("/me", auth, async (req, res) => {
  try {
    const d = await HealthRecord.findOne({ user: req.userId }).select("available specialty displayName").lean();
    res.json({ available: Boolean(d?.available), specialty: d?.specialty || "", displayName: d?.displayName || "" });
  } catch (err) {
    res.status(500).json({ message: "Could not load your status." });
  }
});

// PUT /api/doctors/me - go available / go offline
router.put("/me", auth, async (req, res) => {
  try {
    const available = Boolean(req.body.available);
    const specialty = String(req.body.specialty || "").slice(0, 60);
    const displayName = String(req.body.displayName || "").slice(0, 60);
    const doc = await HealthRecord.findOneAndUpdate(
      { user: req.userId },
      { $set: { role: "doctor", available, specialty, displayName } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ available: doc.available, specialty: doc.specialty, displayName: doc.displayName });
  } catch (err) {
    console.error("PUT /api/doctors/me failed:", err.message);
    res.status(500).json({ message: "Could not update your status." });
  }
});

export default router;