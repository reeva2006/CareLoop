
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import consultRoutes from "./routes/consults.js";
import chatRoutes from "./routes/chat.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the CareLoop backend!",
    status: "running",
    database: "Supabase",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        message: "Supabase environment variables are missing.",
      });
    }

    res.json({
      success: true,
      message: "CareLoop API is working!",
      database: "Supabase configured",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "Health check failed.",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/records", healthRoutes);
app.use("/api/consults", consultRoutes);
app.use("/api/chat", chatRoutes);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`CareLoop backend running at http://localhost:${PORT}`);
  });
}

export default app;
