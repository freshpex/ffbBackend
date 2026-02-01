import Mailjet from 'node-mailjet';

const mj = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY,
  apiSecret: process.env.MAILJET_SECRET_KEY,
});

function buildSuspensionHtml({ name, kycLink, resetLink, suspiciousDetails }) {
  const safeName = name || 'Customer';
  const detailsHtml = suspiciousDetails
    ? `<p><strong>Suspicious activity details:</strong> ${suspiciousDetails}</p>`
    : '';

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
      <p>Hi ${safeName},</p>

      <p>We detected suspicious activity on your account (logins from other locations and unusually large reward conversions). To protect your funds we have temporarily suspended account activity while we investigate.</p>

      <p><strong>Immediate actions we took:</strong></p>
      <ul>
        <li>Your account was suspended pending review.</li>
        <li>We have reverted suspected fraudulent credits and set your visible balance to <strong>200 USDT</strong> (this preserves your verified deposit).</li>
        <li>Any rewards gained during the suspicious activity were removed and will need to be re-earned once your account is restored.</li>
      </ul>

      ${detailsHtml}

      <p><strong>We need the following from you to proceed:</strong></p>
      <ol>
        <li>Please change your account password right away using the reset link we just sent you. It will be sent to you soon — check your spam if you didn't receive it in your inbox after 1 hour.</li>
        <li>Please upload a government-issued ID and a selfie for identity verification via this secure link: <a href="${kycLink}">${kycLink}</a></li>
        <li>Confirm any recent activity you didn’t recognize (time and device/location).</li>
      </ol>

      <p>Once we verify your identity and complete our review, we will restore normal account access. If you didn’t authorize this activity, please reply to this email immediately and we’ll fast-track your case.</p>

      <p>You can reply to this email if you need answers to questions.</p>

      <p>Sincerely,<br/>
      FFB Security Team<br/>
      <a href="mailto:support@ffbroker.cam">support@ffbroker.cam</a>
      </p>
    </div>
  `;
}

export async function sendSuspensionEmail({ toEmail, toName, kycLink, resetLink, suspiciousDetails }) {
  const html = buildSuspensionHtml({ name: toName, kycLink, resetLink, suspiciousDetails });

  const message = {
    Messages: [
      {
        From: {
          Email: process.env.MAILJET_SENDER_EMAIL || 'support@ffbroker.cam',
          Name: process.env.MAILJET_SENDER_NAME || 'FFB Security Team',
        },
        To: [{ Email: toEmail, Name: toName || '' }],
        Subject: 'Account Suspended — Action Required',
        TextPart:
          `Hi ${toName || ''},\n\nWe detected suspicious activity on your account and have temporarily suspended activity while we investigate. Please follow the instructions provided in this email.\n\n— FFB Security Team`,
        HTMLPart: html,
        CustomID: 'suspension-email-transactional',
      },
    ],
  };

  try {
    const result = await mj.post('send', { version: 'v3.1' }).request(message);
    return { ok: true, result: result.body };
  } catch (err) {
    console.error('Mailjet send error:', err);
    return { ok: false, error: err };
  }
}