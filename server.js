import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { Resend } from "resend";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ===============================
   MIDDLEWARE
================================ */
app.use(cors({ origin: true }));
app.use(express.json());

/* ===============================
   OPENAI INITIALIZATION
================================ */
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===============================
   EMAIL (RESEND API)
================================ */
if (!process.env.RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY missing");
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

/* ===============================
   HEALTH CHECK
================================ */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    backend: "SPIROLINK",
    emailService: "resend",
    emailConfigured: !!process.env.RESEND_API_KEY,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
  });
});

/* ===============================
   CHAT ENDPOINT
================================ */
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant for SPIROLINK, a broadband infrastructure company.",
        },
        { role: "user", content: message.trim() },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        success: false,
        error: "No response from OpenAI",
      });
    }

    res.json({ success: true, reply });
  } catch (error) {
    console.error("❌ Chat error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/* ===============================
   CONTACT FORM (EMAIL via RESEND)
================================ */
app.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, serviceType, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and message are required",
      });
    }

    console.log(`📧 Sending contact form from ${email}...`);

    // Email to company
    const companyEmailResponse = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "contact@spirolink.com",
      subject: `New Contact Form - ${serviceType || "General"}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        <p><strong>Service:</strong> ${serviceType || "N/A"}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
        <hr>
        <p><em>Reply to: ${email}</em></p>
      `,
    });

    console.log(`✅ Company email sent:`, companyEmailResponse);

    // Confirmation email to user
    const userEmailResponse = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "We received your message - SPIROLINK",
      html: `
        <h3>Hello ${name},</h3>
        <p>Thank you for contacting SPIROLINK.</p>
        <p>We have received your message and will get back to you shortly.</p>
        <br>
        <p>Regards,<br>SPIROLINK Team</p>
      `,
    });

    console.log(`✅ User confirmation email sent:`, userEmailResponse);

    res.json({
      success: true,
      message: "Email sent successfully",
      companyEmail: companyEmailResponse,
      userEmail: userEmailResponse,
    });
  } catch (error) {
    console.error("❌ Email error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send email: " + error.message,
    });
  }
});

/* ===============================
   404 HANDLER
================================ */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Not found",
  });
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log("====================================");
  console.log("🚀 SPIROLINK Backend Running");
  console.log(`🌍 Port: ${PORT}`);
  console.log("📨 POST /contact");
  console.log("💬 POST /chat");
  console.log("❤️  GET /health");
  console.log("====================================");
});
