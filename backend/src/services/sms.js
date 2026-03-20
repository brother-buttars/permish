const CARRIER_GATEWAYS = {
  att: 'txt.att.net',
  verizon: 'vtext.com',
  tmobile: 'tmomail.net',
  uscellular: 'email.uscc.net',
  cricket: 'sms.cricketwireless.net',
  boost: 'smsmyboostmobile.com',
  metropcs: 'mymetropcs.com',
};

const CARRIER_LABELS = {
  att: 'AT&T',
  verizon: 'Verizon',
  tmobile: 'T-Mobile',
  uscellular: 'US Cellular',
  cricket: 'Cricket',
  boost: 'Boost',
  metropcs: 'Metro PCS',
};

function getCarrierList() {
  return Object.entries(CARRIER_GATEWAYS).map(([key, gateway]) => ({
    value: key,
    label: CARRIER_LABELS[key] || key,
    gateway,
  }));
}

function buildSmsEmail(phone, carrier) {
  const gateway = CARRIER_GATEWAYS[carrier];
  if (!gateway) return null;
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@${gateway}`;
}

async function sendSmsNotification(transport, { phone, carrier, participantName, eventName, fromName, fromAddress }) {
  const to = buildSmsEmail(phone, carrier);
  if (!to) return null;
  return transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: '',
    text: `${participantName} submitted a permission form for ${eventName}.`,
  });
}

module.exports = { CARRIER_GATEWAYS, getCarrierList, buildSmsEmail, sendSmsNotification };
