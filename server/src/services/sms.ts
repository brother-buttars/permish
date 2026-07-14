import type { Transporter } from 'nodemailer';

// SMS via carrier email gateways — ported from backend/src/services/sms.js.

export const CARRIER_GATEWAYS: Record<string, string> = {
  att: 'txt.att.net',
  verizon: 'vtext.com',
  tmobile: 'tmomail.net',
  uscellular: 'email.uscc.net',
  cricket: 'sms.cricketwireless.net',
  boost: 'smsmyboostmobile.com',
  metropcs: 'mymetropcs.com',
};

export function buildSmsEmail(phone: string, carrier: string): string | null {
  const gateway = CARRIER_GATEWAYS[carrier];
  if (!gateway) return null;
  return `${phone.replace(/\D/g, '')}@${gateway}`;
}

export async function sendSmsNotification(
  transport: Transporter,
  { phone, carrier, participantName, eventName, fromName, fromAddress }: {
    phone: string; carrier: string; participantName: string; eventName: string; fromName: string; fromAddress: string;
  }
) {
  const to = buildSmsEmail(phone, carrier);
  if (!to) return null;
  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: '',
    text: `${participantName} submitted a form for ${eventName}.`,
  });
}
