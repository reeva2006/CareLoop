import mongoose from "mongoose";

const Mixed = mongoose.Schema.Types.Mixed;

// One record per user. Everything the dashboard needs lives here.
const healthRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    role: { type: String, enum: ["patient", "doctor", "worker"], default: "patient" },
    profile: { type: Mixed, default: {} },
    notes: { type: [Mixed], default: [] },
    tasks: { type: [Mixed], default: [] },
    checkins: { type: [Mixed], default: [] },
    shifts: { type: [Mixed], default: [] },
    patients: { type: [Mixed], default: [] },
    stamp: { type: Number, default: 0 }, // time of the last edit made in the app

    // Doctor-only: shown in the "Talk to a doctor" list while available
    available: { type: Boolean, default: false },
    specialty: { type: String, default: "" },
    displayName: { type: String, default: "" },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model("HealthRecord", healthRecordSchema);