import nodemailer from "nodemailer";

async function testEtherealEmail() {
  console.log("Testing Ethereal Email...");
  
  const testAccount = await nodemailer.createTestAccount();
  console.log("Created Ethereal test account:", testAccount.user);
  
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  
  try {
    const info = await transporter.sendMail({
      from: 'test@spirolink.com',
      to: 'contact@spirolink.com',
      subject: 'Test Email - Ethereal',
      html: '<h2>Test Email from Ethereal</h2><p>This is a test email sent from Ethereal test account.</p>',
    });
    
    console.log("✅ Email sent successfully!");
    console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testEtherealEmail();
