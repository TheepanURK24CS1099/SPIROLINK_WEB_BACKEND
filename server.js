import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import sgMail from "@sendgrid/mail";

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
   EMAIL CONFIGURATION - Gmail Priority
================================ */
let emailService = 'none';
let transporter;
let resend;

async function initializeEmailTransport() {
  try {
    // Priority 1: Gmail (with optimal settings for Render)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      console.log('✅ Email service: Gmail SMTP');
      transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use TLS, not SSL
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        // Optimal settings for reliable connection
        connectionTimeout: 30000, // 30 seconds
        socketTimeout: 30000, // 30 seconds
        pool: {
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 2000,
          rateLimit: 10,
        },
        // Disable TLS validation issues
        tls: {
          rejectUnauthorized: false,
        },
        // Connection options
        maxConnections: 5,
        maxMessages: 100,
      });
      
      // Test the connection
      try {
        await transporter.verify();
        emailService = 'gmail';
        console.log('✅ Gmail SMTP connection verified successfully');
        return;
      } catch (verifyErr) {
        console.error('❌ Gmail verification failed:', verifyErr.message);
        emailService = 'gmail_error';
        throw verifyErr;
      }
    }

    // Priority 2: SendGrid (HTTP API - fallback)
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      emailService = 'sendgrid';
      console.log('✅ Email service: SendGrid (HTTP API fallback)');
      return;
    }

    // Priority 3: Resend API
    if (process.env.RESEND_API_KEY) {
      resend = new Resend(process.env.RESEND_API_KEY);
      emailService = 'resend';
      console.log('✅ Email service: Resend API');
      return;
    }

    // Fallback: Disabled
    console.log('⚠️  Email service: No credentials configured');
    emailService = 'disabled';

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

    // Try Gmail first
    if ((emailService === 'gmail' || emailService === 'gmail_error') && transporter) {
      try {
        console.log('📧 Sending via Gmail to contact@spirolink.com...');
        
        const info1 = await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: 'contact@spirolink.com',
          subject: `New Contact Form - ${serviceType || "General"}`,
          html: emailBody,
          replyTo: email,
        });

        console.log('✅ Company email sent, Message ID:', info1.messageId);

        const info2 = await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'We received your message - SPIROLINK',
          html: confirmationBody,
        });

        console.log('✅ Confirmation email sent, Message ID:', info2.messageId);

        return res.json({
          success: true,
          message: 'Email sent successfully via Gmail',
          service: 'gmail',
        });
      } catch (gmailErr) {
        console.error('❌ Gmail error:', gmailErr.message);
        // Don't fall back automatically, report the error
        throw gmailErr;
      }
    }

    // Fallback to SendGrid if configured
    if (emailService === 'sendgrid') {
      try {
        const msg1 = {
          to: 'contact@spirolink.com',
          from: 'noreply@spirolink.com',
          subject: `New Contact Form - ${serviceType || "General"}`,
          html: emailBody,
        };
        
        const msg2 = {
          to: email,
          from: 'noreply@spirolink.com',
          subject: 'We received your message - SPIROLINK',
          html: confirmationBody,
        };
        
        await sgMail.send(msg1);
        await sgMail.send(msg2);
        
        console.log('✅ Email sent via SendGrid (Gmail fallback)');
        return res.json({
          success: true,
          message: 'Email sent successfully via SendGrid',
          service: 'sendgrid',
        });
      } catch (sgErr) {
        console.error('❌ SendGrid error:', sgErr.message);
        throw sgErr;
      }
    }

    // Fallback to Resend
    if (emailService === 'resend' && resend) {
      try {
        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: 'contact@spirolink.com',
          subject: `New Contact Form - ${serviceType || "General"}`,
          html: emailBody,
        });

        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: email,
          subject: 'We received your message - SPIROLINK',
          html: confirmationBody,
        });
        
        console.log('✅ Email sent via Resend');
        return res.json({
          success: true,
          message: 'Email sent successfully via Resend',
          service: 'resend',
        });
      } catch (resendErr) {
        console.error('❌ Resend error:', resendErr.message);
        throw resendErr;
      }
    }

    // If we get here, no email service is configured
    console.log('📧 EMAIL SERVICE DISABLED - Logging email:');
    console.log('To:', 'contact@spirolink.com');
    console.log('Subject:', `New Contact Form - ${serviceType || "General"}`);
    
    return res.status(500).json({
      success: false,
      error: 'Email service not configured. Please set EMAIL_USER and EMAIL_PASSWORD environment variables.',
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
