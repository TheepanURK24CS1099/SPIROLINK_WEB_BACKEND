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
    
    // Try to create a fresh test account
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
        connectionTimeout: 10000,
        socketTimeout: 10000,
      });
    } catch (accountErr) {
      // If account creation fails, use a generic Ethereal config
      console.log('⚠️  Using generic Ethereal config (account creation failed)');
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'demo@ethereal.email',
          pass: 'demopass',
        },
        connectionTimeout: 10000,
        socketTimeout: 10000,
      });
    }
    
    emailService = 'ethereal';
  } catch (err) {
    console.error('❌ Email transport initialization failed:', err.message);
    emailService = 'disabled';
  }
}

// Initialize email transport
initializeEmailTransport().catch((err) => {
  console.error('❌ Failed to initialize email:', err.message);
  emailService = 'disabled';
});

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
    if (emailService === 'resend' && resend) {
      // Using Resend API
      try {
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
        
        console.log('✅ Email sent via Resend');
      } catch (resendErr) {
        console.error('❌ Resend error:', resendErr.message);
        throw new Error(`Resend API failed: ${resendErr.message}`);
      }
    } else if (emailService === 'gmail' && transporter) {
      // Using Gmail via Nodemailer
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: 'contact@spirolink.com',
          subject: `New Contact Form - ${serviceType || "General"}`,
          html: emailBody,
        });

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'We received your message - SPIROLINK',
          html: confirmationBody,
        });
        
        console.log('✅ Email sent via Gmail');
      } catch (gmailErr) {
        console.error('❌ Gmail error:', gmailErr.message);
        throw new Error(`Gmail SMTP failed: ${gmailErr.message}`);
      }
    } else if (emailService === 'ethereal' && transporter) {
      // Using Ethereal test account
      try {
        const info1 = await transporter.sendMail({
          from: 'noreply@spirolink.test',
          to: 'contact@spirolink.com',
          subject: `New Contact Form - ${serviceType || "General"}`,
          html: emailBody,
        });

        const info2 = await transporter.sendMail({
          from: 'noreply@spirolink.test',
          to: email,
          subject: 'We received your message - SPIROLINK',
          html: confirmationBody,
        });

        console.log('✅ Email sent via Ethereal');
        console.log('📧 Preview URL 1:', nodemailer.getTestMessageUrl(info1));
        console.log('📧 Preview URL 2:', nodemailer.getTestMessageUrl(info2));
      } catch (etherealErr) {
        console.error('❌ Ethereal error:', etherealErr.message);
        throw new Error(`Ethereal SMTP failed: ${etherealErr.message}`);
      }
    } else if (emailService === 'disabled') {
      // Fallback: just log the email (development mode)
      console.log('📧 EMAIL SERVICE DISABLED - Logging email instead:');
      console.log('To:', 'contact@spirolink.com');
      console.log('Subject:', `New Contact Form - ${serviceType || "General"}`);
      console.log('Body:', emailBody);
      console.log('---');
      console.log('Confirmation to:', email);
      console.log('---');
      
      // In production, you should notify the user to configure email
      return res.json({
        success: true,
        message: 'Message received (email service currently disabled)',
        service: 'disabled',
        warning: 'Configure RESEND_API_KEY, EMAIL_USER/PASSWORD, or Ethereal will be used',
      });
    } else {
      throw new Error('Email service not properly initialized');
    }

    res.json({
      success: true,
      message: 'Email sent successfully',
      service: emailService,
    });
  } catch (error) {
    console.error("❌ Contact form error:", error.message);
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
