
import express from "express";
import auth from "../middleware/auth.js";

const router = express.Router();

const SYSTEM = (role) =>
  `You are Loop, a friendly health helper inside CareLoop, a student prototype app. The user is a ${role}. ` +
  "Reply in simple, warm English in under 120 words. Give general health information and healthy-habit tips only. " +
  "Never diagnose, prescribe medicine, give medicine doses, or claim to replace a doctor. " +
  "For serious symptoms such as chest pain, trouble breathing, heavy bleeding, confusion, or possible self-harm, recommend urgent real-world support. In India, call 112 for emergencies. " +
  "For non-emergency concerns needing a clinician, suggest the Talk to a doctor tab. " +
  "For unrelated questions, gently steer back to health and wellbeing. " +
  "Use fictional examples only and do not request unnecessary personal health information.";

router.get("/status", auth, (req, res) => {
  res.json({ ai: Boolean(process.env.OPENROUTER_API_KEY) });
});

router.post("/", auth, async (req, res) => {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    return res.status(503).json({
      message: "OPENROUTER_API_KEY is missing from backend/.env",
    });
  }

  try {
    const role = ["patient", "doctor", "worker"].includes(req.body?.role)
      ? req.body.role
      : "patient";

    const messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
      .slice(-10)
      .filter(
        (m) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m?.content === "string"
      )
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 1000),
      }));

    while (messages.length && messages[0].role !== "user") {
      messages.shift();
    }

    if (!messages.length) {
      return res.status(400).json({ message: "No message to answer." });
    }

    const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "CareLoop",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM(role) },
          ...messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        ],
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status, result);

      const message =
        response.status === 401
          ? "OpenRouter rejected the API key. Check your server environment settings."
          : response.status === 402
          ? "OpenRouter requires available credits for this request."
          : response.status === 429
          ? "OpenRouter rate limit reached. Please try again shortly."
          : result?.error?.message || "The AI service had a problem.";

      return res.status(502).json({ message });
    }

    const reply = result?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        message: "The AI service returned an empty reply.",
      });
    }

    return res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("POST /api/chat failed:", error.message);

    return res.status(500).json({
      message: "Chat failed on the server. Check the backend terminal.",
    });
  }
});

export default router;