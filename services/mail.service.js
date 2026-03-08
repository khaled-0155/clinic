const { BrevoClient } = require("@getbrevo/brevo");

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const sendInviteEmail = async ({ toEmail, toName, inviteToken, role }) => {
  try {
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invite/${inviteToken}`;

    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject: "You're Invited to Join Clinic System",
      htmlContent: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Hello ${toName},</h2>
          <p>You have been invited as <strong>${role}</strong>.</p>
          <p>Please click the button below to activate your account:</p>

          <a href="${inviteLink}" 
             style="
                display:inline-block;
                background:#2563eb;
                color:white;
                padding:12px 24px;
                text-decoration:none;
                border-radius:6px;
                margin:10px 0;
             ">
             Accept Invitation
          </a>

          <p>This link will expire in 24 hours.</p>
          <p>If you did not expect this email, you can ignore it.</p>
        </div>
      `,
      sender: {
        name: "Clinic System",
        email: process.env.EMAIL_FROM,
      },
      to: [
        {
          email: toEmail,
          name: toName,
        },
      ],
    });

    console.log("Invite email sent:", result);
  } catch (error) {
    console.error("Brevo error:", error);
    throw new Error("Failed to send invite email");
  }
};

const sendResetPasswordEmail = async ({ toEmail, toName, resetToken }) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject: "Reset Your Password",
      htmlContent: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Hello ${toName},</h2>
          <p>You requested to reset your password.</p>
          <p>Click the button below to continue:</p>

          <a href="${resetLink}" 
             style="
                display:inline-block;
                background:#dc2626;
                color:white;
                padding:12px 24px;
                text-decoration:none;
                border-radius:6px;
                margin:10px 0;
             ">
             Reset Password
          </a>

          <p>This link will expire in 1 hour.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      sender: {
        name: "Clinic System",
        email: process.env.EMAIL_FROM,
      },
      to: [
        {
          email: toEmail,
          name: toName,
        },
      ],
    });

    console.log("Reset password email sent:", result);
  } catch (error) {
    console.error("Brevo reset email error:", error);
    throw new Error("Failed to send reset password email");
  }
};

async function sendEmail(to, subject, html) {
  console.log("EMAIL_FROM:", process.env.EMAIL_FROM);
  console.log("EMAIL_FROM_NAME:", process.env.EMAIL_FROM_NAME);
  try {
    const email = {
      sender: {
        email: process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };

    const response = await brevo.transactionalEmails.sendTransacEmail(email);

    console.log("BREVO SUCCESS:", response.body);
    return response.body;
  } catch (err) {
    console.error("BREVO ERROR:", err.response?.body || err.message);
    throw err;
  }
}

module.exports = {
  sendInviteEmail,
  sendResetPasswordEmail,
  sendEmail,
};
