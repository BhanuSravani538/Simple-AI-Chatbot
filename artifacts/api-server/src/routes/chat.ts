import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";
import { SendChatMessageBody, SendChatMessageResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/chat", async (req, res): Promise<void> => {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Please sign in to send a message." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const supabaseAnonKey =
    process.env.SUPABASE_ANON?.trim() || process.env.ANON_API_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(503).json({
      error: "Supabase authentication is not configured for this app.",
    });
    return;
  }

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authorization,
      },
    });

    if (!authResponse.ok) {
      res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
      return;
    }

    const user = (await authResponse.json()) as { id?: unknown };
    if (typeof user.id !== "string" || !user.id) {
      res.status(401).json({ error: "Please sign in to send a message." });
      return;
    }
  } catch {
    res.status(503).json({
      error: "Could not verify your sign-in. Please try again.",
    });
    return;
  }

  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please send a valid chat message." });
    return;
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error:
        "Google AI isn't available in this environment. Check the app's secret setup and try again.",
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: parsed.data.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        maxOutputTokens: 8192,
        systemInstruction:
          "You are a helpful, clear, and friendly general-purpose assistant. Answer directly and use readable formatting.",
      },
    });
    const reply = response.text?.trim();

    if (!reply) {
      res.status(503).json({
        error: "The AI service returned an empty reply. Please try again.",
      });
      return;
    }

    res.json(SendChatMessageResponse.parse({ reply }));
  } catch (error) {
    req.log.error({ err: error }, "Chat request failed");
    res.status(503).json({
      error: "The AI service could not answer right now. Please try again.",
    });
  }
});

export default router;
