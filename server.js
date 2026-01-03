import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import nodemailer from "nodemailer";
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
   EMAIL CONFIGURATION
================================ */
let emailService = 'ethereal'; // Default to Ethereal which works with Render free tier
let transporter;
let resend;

async function initializeEmailTransport() {
  try {
    // Check if Resend API key is available (preferred for production)
    if (process.env.RESEND_API_KEY) {
      resend = new Resend(process.env.RESEND_API_KEY);
      emailService = 'resend';
      console.log('✅ Email service: Resend API');
      return;
    }

    // Check if Gmail credentials are available
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      console.log('⚠️  Email service: Gmail (may timeout on free Render tier)');
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        connectionTimeout: 5000,
        socketTimeout: 5000,
      });
      emailService = 'gmail';
      return;
    }

    // Fallback to Ethereal test account (works reliably with Render free tier)
    console.log('✅ Email service: Ethereal (free test service - works with Render)');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    emailService = 'ethereal';
  } catch (err) {
    console.error('❌ Email transport initialization failed:', err.message);
    emailService = 'disabled';
  }
}

initializeEmailTransport();

/* ===============================
   HEALTH CHECK
================================ */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    backend: "SPIROLINK",
    emailService: emailService,
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
   CONTACT FORM (EMAIL)
================================ */
app.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, serviceType, message } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and message are required",
      });
    }

    const emailBody = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || "N/A"}</p>
      <p><strong>Service:</strong> ${serviceType || "N/A"}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
      <hr>
      <p><em>Reply to: ${email}</em></p>
    `;

    const confirmationBody = `
      <h3>Hello ${name},</h3>
      <p>Thank you for contacting SPIROLINK.</p>
      <p>We have received your message and will get back to you shortly.</p>
      <br>
      <p>Regards,<br>SPIROLINK Team</p>
    `;

    // Send email based on configured service
    if (emailService === 'resend') {
      // Using Resend API
      await resend.emails.send({
        from: 'noreply@spirolink.com',
        to: 'contact@spirolink.com',
        subject: `New Contact Form - ${serviceType || "General"}`,
        html: emailBody,
      });

      await resend.emails.send({
        from: 'noreply@spirolink.com',
        to: email,
        subject: 'We received your message - SPIROLINK',
        html: confirmationBody,
      });
    } else if (emailService === 'gmail' || emailService === 'ethereal') {
      // Using Nodemailer (Gmail or Ethereal)
      const fromEmail = emailService === 'gmail' ? process.env.EMAIL_USER : 'test@ethereal.email';

      await transporter.sendMail({
        from: fromEmail,
        to: 'contact@spirolink.com',
        subject: `New Contact Form - ${serviceType || "General"}`,
        html: emailBody,
      });

      await transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: 'We received your message - SPIROLINK',
        html: confirmationBody,
      });

      // If using Ethereal, provide preview URL
      if (emailService === 'ethereal') {
        console.log('📧 Ethereal test email preview:');
        console.log('https://ethereal.email/messages');
      }
    } else {
      throw new Error('Email service not configured. Please set RESEND_API_KEY or EMAIL_USER/EMAIL_PASSWORD.');
    }

    res.json({
      success: true,
      message: 'Email sent successfully',
      service: emailService,
    });
  } catch (error) {
    console.error("❌ Email error:", error.message);
    res.status(500).json({
      success: false,
      error: `Failed to send email: ${error.message}`,
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
