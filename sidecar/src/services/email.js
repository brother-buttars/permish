const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createTransport(emailConfig) {
  if (emailConfig.provider === 'resend') {
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: emailConfig.resendApiKey },
    });
  }
  return nodemailer.createTransport({
    host: emailConfig.smtp.host,
    port: emailConfig.smtp.port,
    secure: emailConfig.smtp.port === 465,
    auth: { user: emailConfig.smtp.user, pass: emailConfig.smtp.pass },
  });
}

async function sendNotification(transport, { to, participantName, eventName, pdfPath, fromName, fromAddress }) {
  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: `Form Submitted: ${participantName} - ${eventName}`,
    text: `A form has been submitted for ${participantName} for ${eventName}.`,
    html: `<p>A form has been submitted for <strong>${escapeHtml(participantName)}</strong> for <strong>${escapeHtml(eventName)}</strong>.</p>`,
    attachments: pdfPath ? [{
      filename: `permish-${participantName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}.pdf`,
      path: pdfPath,
    }] : [],
  };
  return transport.sendMail(mailOptions);
}

module.exports = { createTransport, sendNotification };
