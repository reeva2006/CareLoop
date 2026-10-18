
import express from "express";
import supabase from "../supabase.js";
import auth from "../middleware/auth.js";

const router = express.Router();

const FIELDS = [
  "role",
  "profile",
  "notes",
  "tasks",
  "checkins",
  "shifts",
  "patients",
];

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

// GET /api/records
router.get("/", auth, async (req, res) => {
  try {
    let { data, error } = await supabase
      .from("health_records")
      .select("*")
      .eq("user_id", req.userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const result = await supabase
        .from("health_records")
        .insert({ user_id: req.userId })
        .select("*")
        .single();

      if (result.error) throw result.error;
      data = result.data;
    }

    res.json({ record: toClient(data) });
  } catch (err) {
    console.error("GET /api/records failed:", err.message);
    res.status(500).json({
      message: "Could not load your record.",
    });
  }
});

// PUT /api/records
router.put("/", auth, async (req, res) => {
  try {
    const update = {
      user_id: req.userId,
      stamp: Number(req.body.updatedAt) || Date.now(),
    };

    for (const field of FIELDS) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    if (
      update.role &&
      !["patient", "doctor", "worker"].includes(update.role)
    ) {
      delete update.role;
    }

    const { data, error } = await supabase
      .from("health_records")
      .upsert(update, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw error;

    res.json({ record: toClient(data) });
  } catch (err) {
    console.error("PUT /api/records failed:", err.message);
    res.status(500).json({
      message: "Could not save your record.",
    });
  }
});

export default router;
