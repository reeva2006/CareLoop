import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabasePkg from "../supabase.js";

const supabase = supabasePkg.supabase || supabasePkg;
const router = express.Router();

function createToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from environment variables.");
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

// Register a new user
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Enter your name, email, and a password of at least 8 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const { data: existingUser, error: lookupError } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) {
      console.error("❌ SUPABASE LOOKUP ERROR:", JSON.stringify(lookupError, null, 2));
      return res.status(500).json({
        success: false,
        message: `Database lookup failed: ${lookupError.message}`,
      });
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user
    const { data: user, error: insertError } = await supabase
      .from("app_users")
      .insert({
        name: name.trim(),
        email: normalizedEmail,
        password_hash: passwordHash,
      })
      .select("id, name, email")
      .single();

    if (insertError) {
      console.error("❌ SUPABASE INSERT ERROR:", JSON.stringify(insertError, null, 2));
      return res.status(500).json({
        success: false,
        message: `Database insert failed: ${insertError.message}`,
      });
    }

    const token = createToken(user.id);

    return res.status(201).json({
      success: true,
      message: "Account created successfully!",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ REGISTRATION CRASH:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Log in an existing user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Enter your email and password.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: user, error: lookupError } = await supabase
      .from("app_users")
      .select("id, name, email, password_hash")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) {
      console.error("❌ LOGIN LOOKUP ERROR:", JSON.stringify(lookupError, null, 2));
      return res.status(500).json({
        success: false,
        message: `Database lookup failed: ${lookupError.message}`,
      });
    }

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = createToken(user.id);

    return res.json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ LOGIN CRASH:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;