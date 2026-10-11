
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import consultRoutes from "./routes/consults.js";
import chatRoutes from "./routes/chat.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

let mongoConnectionPromise;

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing.");
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose
      .connect(process.env.MONGODB_URI)
      .catch((error) => {
        mongoConnectionPromise = null;
        throw error;
      });
  }

  return mongoConnectionPromise;
}

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the CareLoop backend!",
    status: "running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await connectToDatabase();

    res.json({
      success: true,
      message: "CareLoop API is working!",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "API is running, but the database is unavailable.",
    });
  }
});

// Connect to MongoDB before handling database-dependent routes.
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    res.status(503).json({
      success: false,
      message: "Database unavailable. Check the backend configuration.",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/records", healthRoutes);
app.use("/api/consults", consultRoutes);
app.use("/api/chat", chatRoutes);

// Vercel uses the exported app; local development starts its own server.
if (!process.env.VERCEL) {
  connectToDatabase()
    .then(() => {
      console.log("MongoDB connected successfully!");

      app.listen(PORT, () => {
        console.log(`CareLoop backend running at http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Backend startup failed:", error.message);
      process.exit(1);
    });
}

export default app;