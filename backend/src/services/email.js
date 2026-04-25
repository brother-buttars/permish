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

async function sendGroupInvite(transport, { to, groupName, role, inviteUrl, inviterName, fromName, fromAddress }) {
  const roleLabel = role === 'admin' ? 'as an administrator' : '';
  const inviterPart = inviterName ? `${escapeHtml(inviterName)} invited you` : 'You\'ve been invited';
  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: `You're invited to ${groupName}`,
    text: `${inviterName || 'Someone'} invited you to join ${groupName}${roleLabel ? ' ' + roleLabel : ''} on Permish.\n\nAccept the invite: ${inviteUrl}`,
    html: `<p>${inviterPart} to join <strong>${escapeHtml(groupName)}</strong>${roleLabel ? ' ' + roleLabel : ''} on Permish.</p>
<p><a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px">Accept invite</a></p>
<p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${inviteUrl}</p>`,
  });
}

async function sendRemovalNotice(transport, { to, groupName, fromName, fromAddress }) {
  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: `You've been removed from ${groupName}`,
    text: `Your access to ${groupName} on Permish has been removed.`,
    html: `<p>Your access to <strong>${escapeHtml(groupName)}</strong> on Permish has been removed.</p><p style="color:#666;font-size:13px">If you think this was a mistake, contact a group administrator.</p>`,
  });
}

module.exports = { createTransport, sendNotification, sendGroupInvite, sendRemovalNotice };
