import mongoose from "mongoose";

const Mixed = mongoose.Schema.Types.Mixed;

// One consultation between a patient (or healthcare worker) and a doctor.
const consultSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientName: { type: String, default: "" },
    doctorName: { type: String, default: "" },
    mode: { type: String, enum: ["chat", "audio", "video"], default: "chat" },
    reason: { type: String, default: "" },
    status: { type: String, enum: ["requested", "active", "declined", "ended"], default: "requested" },
    brief: { type: Mixed, default: null }, // the "Care Brief" the patient chose to share
    messages: { type: [Mixed], default: [] },
    signals: { type: [Mixed], default: [] }, // call set-up messages (WebRTC)
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model("Consult", consultSchema);