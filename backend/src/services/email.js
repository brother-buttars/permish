const nodemailer = require('nodemailer');

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
    subject: `Permission Form Submitted: ${participantName} - ${eventName}`,
    text: `A permission form has been submitted for ${participantName} for ${eventName}.`,
    html: `<p>A permission form has been submitted for <strong>${participantName}</strong> for <strong>${eventName}</strong>.</p>`,
    attachments: [{
      filename: `permission-form-${participantName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      path: pdfPath,
    }],
  };
  return transport.sendMail(mailOptions);
}

module.exports = { createTransport, sendNotification };
