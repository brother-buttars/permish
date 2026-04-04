const { buildSmsEmail, getCarrierList, sendSmsNotification, CARRIER_GATEWAYS } = require('../../src/services/sms');

describe('buildSmsEmail', () => {
  test('builds correct email for AT&T', () => {
    expect(buildSmsEmail('555-123-4567', 'att')).toBe('5551234567@txt.att.net');
  });

  test('builds correct email for Verizon', () => {
    expect(buildSmsEmail('555-123-4567', 'verizon')).toBe('5551234567@vtext.com');
  });

  test('builds correct email for T-Mobile', () => {
    expect(buildSmsEmail('(555) 123-4567', 'tmobile')).toBe('5551234567@tmomail.net');
  });

  test('strips non-digit characters from phone', () => {
    expect(buildSmsEmail('+1 (555) 123-4567', 'att')).toBe('15551234567@txt.att.net');
  });

  test('returns null for unknown carrier', () => {
    expect(buildSmsEmail('555-123-4567', 'google_fi')).toBeNull();
  });

  test('returns null for empty carrier', () => {
    expect(buildSmsEmail('555-123-4567', '')).toBeNull();
  });

  test('returns null for undefined carrier', () => {
    expect(buildSmsEmail('555-123-4567', undefined)).toBeNull();
  });
});

describe('getCarrierList', () => {
  test('returns all carriers with value, label, and gateway', () => {
    const list = getCarrierList();
    expect(list.length).toBe(Object.keys(CARRIER_GATEWAYS).length);
    for (const carrier of list) {
      expect(carrier).toHaveProperty('value');
      expect(carrier).toHaveProperty('label');
      expect(carrier).toHaveProperty('gateway');
    }
  });

  test('includes AT&T with correct label', () => {
    const list = getCarrierList();
    const att = list.find(c => c.value === 'att');
    expect(att.label).toBe('AT&T');
    expect(att.gateway).toBe('txt.att.net');
  });
});

describe('sendSmsNotification', () => {
  test('sends SMS via transport for valid carrier', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'test123' });
    const transport = { sendMail };

    await sendSmsNotification(transport, {
      phone: '555-123-4567',
      carrier: 'att',
      participantName: 'Jane Doe',
      eventName: 'Youth Camp',
      fromName: 'Permish',
      fromAddress: 'test@example.com',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('5551234567@txt.att.net');
    expect(call.text).toContain('Jane Doe');
    expect(call.text).toContain('Youth Camp');
    expect(call.from).toContain('Permish');
  });

  test('returns null for unknown carrier without sending', async () => {
    const sendMail = jest.fn();
    const transport = { sendMail };

    const result = await sendSmsNotification(transport, {
      phone: '555-123-4567',
      carrier: 'unknown_carrier',
      participantName: 'Jane',
      eventName: 'Camp',
      fromName: 'Permish',
      fromAddress: 'test@example.com',
    });

    expect(result).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
