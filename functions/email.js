async function sendEmail({ to, subject, html, text, attachments = [], bcc, replyTo }) {
  const provider = process.env.EMAIL_PROVIDER || "resend";
  const from = process.env.FROM_EMAIL || "info@maxwebstudio.nl";

  if (provider !== "resend") {
    console.log(`Email skipped: unsupported EMAIL_PROVIDER ${provider}`);
    return { sent: false, warning: `Email skipped: unsupported EMAIL_PROVIDER ${provider}` };
  }

  if (!process.env.RESEND_API_KEY) {
    console.log("Email skipped: RESEND_API_KEY missing");
    return { sent: false, warning: "Email skipped: RESEND_API_KEY missing" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        bcc,
        reply_to: replyTo,
        subject,
        html,
        text,
        attachments,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Email failed", {
        status: response.status,
        message: data.message || data.name || "Unknown Resend error",
      });
      return { sent: false, warning: "Email failed: Resend rejected the message" };
    }

    return { sent: true, id: data.id };
  } catch (error) {
    console.error("Email failed", { message: error.message });
    return { sent: false, warning: "Email failed: provider request error" };
  }
}

module.exports = { sendEmail };
