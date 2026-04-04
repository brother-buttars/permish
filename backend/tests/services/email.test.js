const { createTransport, sendNotification } = require('../../src/services/email');

describe('Email service', () => {
  test('createTransport returns a transporter for gmail provider', () => {
    const transport = createTransport({
      provider: 'gmail',
      smtp: { host: 'smtp.gmail.com', port: 587, user: 'test@gmail.com', pass: 'pass' },
    });
    expect(transport).toBeDefined();
    expect(transport.sendMail).toBeDefined();
  });

  test('sendNotification constructs correct email options', async () => {
    let sentOptions;
    const mockTransport = {
      sendMail: async (opts) => { sentOptions = opts; return { messageId: 'test-id' }; },
    };
    await sendNotification(mockTransport, {
      to: 'recipient@test.com',
      participantName: 'Jane Doe',
      eventName: 'Youth Camp',
      pdfPath: '/path/to/file.pdf',
      fromName: 'Permish',
      fromAddress: 'noreply@test.com',
    });
    expect(sentOptions.to).toBe('recipient@test.com');
    expect(sentOptions.subject).toContain('Jane Doe');
    expect(sentOptions.attachments).toHaveLength(1);
  });
});
