import handlebars from "handlebars";

const SUPPORT_EMAIL = "support@ffbroker.cam";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const plainTextToHtml = (message = "") =>
  String(message || "")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph
        .split(/\n/)
        .map((line) => escapeHtml(line))
        .join("<br/>");
      return `<p style="margin:0 0 16px">${lines}</p>`;
    })
    .join("\n");

export const buildBrandedEmailHtml = ({
  title,
  preheader,
  message,
  ctaLabel,
  ctaUrl,
  footerNote,
} = {}) => {
  const safeTitle = escapeHtml(title || "FFB Notification");
  const safePreheader = escapeHtml(preheader || "");
  const bodyHtml = plainTextToHtml(message || "");
  const safeCtaLabel = escapeHtml(ctaLabel || "");
  const safeCtaUrl = escapeHtml(ctaUrl || "");
  const safeFooterNote = escapeHtml(
    footerNote || "Thank you for choosing Fidelity First Brokers.",
  );

  return `
    <div style="margin:0;padding:0;background:#0f172a;color:#e5e7eb;font-family:Arial,Helvetica,sans-serif">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreheader}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:28px 12px">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#111827;border:1px solid #243244;border-radius:14px;overflow:hidden">
              <tr>
                <td style="padding:24px 28px;background:#131c2b;border-bottom:1px solid #243244">
                  <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a78bfa;font-weight:700">Fidelity First Brokers</div>
                  <h1 style="margin:10px 0 0;color:#ffffff;font-size:24px;line-height:1.25">${safeTitle}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:28px;color:#d1d5db;font-size:15px;line-height:1.65">
                  ${bodyHtml}
                  ${
                    safeCtaLabel && safeCtaUrl
                      ? `<p style="margin:24px 0 8px"><a href="${safeCtaUrl}" style="display:inline-block;background:#8133fd;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${safeCtaLabel}</a></p>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px;background:#0b1120;border-top:1px solid #243244;color:#94a3b8;font-size:12px;line-height:1.5">
                  <p style="margin:0 0 8px">${safeFooterNote}</p>
                  <p style="margin:0">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#c4b5fd">${SUPPORT_EMAIL}</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
};

// Central registry of default email templates.
// Templates use Handlebars placeholders, e.g. {{name}}, {{kycLink}}.
export const DEFAULT_EMAIL_TEMPLATES = Object.freeze({
  account_suspended: {
    description: "Suspicious activity / suspension notice to user",
    subject: "Account Suspended — Action Required",
    text:
      "Hi {{name}},\n\n" +
      "We detected suspicious activity on your account (logins from other locations and unusually large reward conversions). To protect your funds we have temporarily suspended account activity while we investigate.\n\n" +
      "Immediate actions we took:\n" +
      "- Your account was suspended pending review.\n" +
      "- We have reverted suspected fraudulent credits and set your visible balance to 200 USDT (this preserves your verified deposit).\n" +
      "- Any rewards gained during the suspicious activity were removed and will need to be re-earned once your account is restored.\n\n" +
      "We need the following from you to proceed:\n" +
      "1) Please change your account password right away using the reset link we just sent you.\n" +
      "2) Please upload a government-issued ID and a selfie for identity verification via this secure link: {{kycLink}}\n" +
      "3) Confirm any recent activity you didn’t recognize (time and device/location).\n\n" +
      "If you didn’t authorize this activity, please reply to this email immediately and we’ll fast-track your case.\n\n" +
      "Sincerely,\n" +
      "FFB Security Team\n" +
      "support@ffbroker.cam\n",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
        <p>Hi {{name}},</p>

        <p>We detected suspicious activity on your account (logins from other locations and unusually large reward conversions). To protect your funds we have temporarily suspended account activity while we investigate.</p>

        <p><strong>Immediate actions we took:</strong></p>
        <ul>
          <li>Your account was suspended pending review.</li>
          <li>We have reverted suspected fraudulent credits and set your visible balance to <strong>200 USDT</strong> (this preserves your verified deposit).</li>
          <li>Any rewards gained during the suspicious activity were removed and will need to be re-earned once your account is restored.</li>
        </ul>

        {{#if suspiciousDetails}}
          <p><strong>Suspicious activity details:</strong> {{suspiciousDetails}}</p>
        {{/if}}

        <p><strong>We need the following from you to proceed:</strong></p>
        <ol>
          <li>Please change your account password right away using the reset link we just sent you. It will be sent to you soon — check your spam if you didn't receive it in your inbox after 1 hour.</li>
          <li>Please upload a government-issued ID and a selfie for identity verification via this secure link: <a href="{{kycLink}}">{{kycLink}}</a></li>
          <li>Confirm any recent activity you didn’t recognize (time and device/location).</li>
        </ol>

        <p>Once we verify your identity and complete our review, we will restore normal account access. If you didn’t authorize this activity, please reply to this email immediately and we’ll fast-track your case.</p>

        <p>You can reply to this email if you need answers to questions.</p>

        <p>Sincerely,<br/>
        FFB Security Team<br/>
        <a href="mailto:support@ffbroker.cam">support@ffbroker.cam</a>
        </p>
      </div>
    `,
  },

  password_changed_user: {
    description: "Notify the user their password was changed",
    subject: "Your password was changed",
    text:
      "Hi {{name}},\n\n" +
      "This is a confirmation that your password was changed on your FFB account.\n\n" +
      "If you did NOT do this, please reset your password immediately and contact support.\n\n" +
      "Time: {{time}}\n" +
      "IP: {{ip}}\n" +
      "Device: {{userAgent}}\n\n" +
      "— FFB Security Team\n",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
        <p>Hi {{name}},</p>
        <p>This is a confirmation that your password was changed on your FFB account.</p>
        <p><strong>If you did NOT do this</strong>, please reset your password immediately and contact support.</p>
        <hr/>
        <p style="margin:0"><strong>Time:</strong> {{time}}</p>
        <p style="margin:0"><strong>IP:</strong> {{ip}}</p>
        <p style="margin:0"><strong>Device:</strong> {{userAgent}}</p>
        <hr/>
        <p>— FFB Security Team</p>
      </div>
    `,
  },

  password_changed_admin: {
    description: "Notify admins when a user changes password",
    subject: "User password changed: {{email}}",
    text:
      "A user changed their password.\n\n" +
      "User: {{name}} ({{email}})\n" +
      "UserId: {{userId}}\n" +
      "Time: {{time}}\n" +
      "IP: {{ip}}\n" +
      "Device: {{userAgent}}\n",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
        <p><strong>A user changed their password.</strong></p>
        <p style="margin:0"><strong>User:</strong> {{name}} ({{email}})</p>
        <p style="margin:0"><strong>UserId:</strong> {{userId}}</p>
        <p style="margin:0"><strong>Time:</strong> {{time}}</p>
        <p style="margin:0"><strong>IP:</strong> {{ip}}</p>
        <p style="margin:0"><strong>Device:</strong> {{userAgent}}</p>
      </div>
    `,
  },

  new_signup_admin: {
    description: "Notify admins about a new signup",
    subject: "New signup: {{email}}",
    text:
      "A new user signed up.\n\n" +
      "User: {{name}} ({{email}})\n" +
      "UserId: {{userId}}\n" +
      "Country: {{country}}\n" +
      "Time: {{time}}\n",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
        <p><strong>A new user signed up.</strong></p>
        <p style="margin:0"><strong>User:</strong> {{name}} ({{email}})</p>
        <p style="margin:0"><strong>UserId:</strong> {{userId}}</p>
        {{#if country}}<p style="margin:0"><strong>Country:</strong> {{country}}</p>{{/if}}
        <p style="margin:0"><strong>Time:</strong> {{time}}</p>
      </div>
    `,
  },
  kyc_approved_user: {
    description: "Notify a user that KYC verification was approved",
    subject: "Your FFB KYC verification has been approved",
    text:
      "Hi {{name}},\n\n" +
      "Good news. Your identity verification has been approved.\n\n" +
      "Your FFB account now has verified status, and eligible account features such as withdrawals and platform tasks can continue according to platform rules.\n\n" +
      "You can review your account from your dashboard: {{dashboardLink}}\n\n" +
      "Thank you for completing verification.\n\n" +
      "FFB Compliance Team\n",
    html: buildBrandedEmailHtml({
      title: "KYC Verification Approved",
      preheader: "Your FFB identity verification has been approved.",
      message:
        "Hi {{name}},\n\n" +
        "Good news. Your identity verification has been approved.\n\n" +
        "Your FFB account now has verified status, and eligible account features such as withdrawals and platform tasks can continue according to platform rules.\n\n" +
        "Thank you for completing verification.",
      ctaLabel: "Open Dashboard",
      ctaUrl: "{{dashboardLink}}",
      footerNote: "FFB Compliance Team",
    }),
  },
  kyc_rejected_user: {
    description: "Notify a user that KYC verification was not approved",
    subject: "Action required: your FFB KYC verification was not approved",
    text:
      "Hi {{name}},\n\n" +
      "We reviewed your identity verification submission, but it was not approved.\n\n" +
      "{{#if reason}}Reason: {{reason}}\n\n{{/if}}" +
      "Please review your information and submit clear, valid documents from your account settings page: {{kycLink}}\n\n" +
      "If you believe this was a mistake, contact support and our team will review your case.\n\n" +
      "FFB Compliance Team\n",
    html: buildBrandedEmailHtml({
      title: "KYC Verification Not Approved",
      preheader: "Your FFB KYC submission needs attention.",
      message:
        "Hi {{name}},\n\n" +
        "We reviewed your identity verification submission, but it was not approved.\n\n" +
        "{{#if reason}}Reason: {{reason}}\n\n{{/if}}" +
        "Please review your information and submit clear, valid documents from your account settings page.\n\n" +
        "If you believe this was a mistake, contact support and our team will review your case.",
      ctaLabel: "Review KYC",
      ctaUrl: "{{kycLink}}",
      footerNote: "FFB Compliance Team",
    }),
  },
  referral_invite: {
    description: "Invite friends to join using your referral link",
    subject: "Join FFB and get a bonus from {{senderName}}",
    text:
      "Hi,\n\n" +
      "{{senderName}} invited you to join FFB. Sign up using the link below to receive a bonus:\n\n" +
      "{{referralLink}}\n\n" +
      "{{#if personalMessage}}Personal message:\n{{personalMessage}}\n\n{{/if}}" +
      "— FFB Team\n",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
        <p>Hi,</p>
        <p><strong>{{senderName}}</strong> invited you to join FFB. Sign up using the link below to receive a bonus:</p>
        <p><a href="{{referralLink}}">{{referralLink}}</a></p>
        {{#if personalMessage}}
          <hr/>
          <p><strong>Personal message:</strong></p>
          <p>{{personalMessage}}</p>
        {{/if}}
        <p>— FFB Team</p>
      </div>
    `,
  },

  referral_invite: {
    description: "Invite someone via referral link",
    subject: "{{inviterName}} invited you to join FFB",
    text:
      "Hi,\n\n" +
      "{{inviterName}} invited you to join FFB.\n\n" +
      "Sign up using this link: {{referralLink}}\n\n" +
      "{{#if message}}Message from {{inviterName}}: {{message}}\n\n{{/if}}" +
      "— FFB Team\n",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111">
        <p>Hi,</p>
        <p><strong>{{inviterName}}</strong> invited you to join FFB.</p>
        <p>
          <a href="{{referralLink}}" style="display:inline-block;padding:10px 14px;background:#0ea5e9;color:#fff;border-radius:6px;text-decoration:none">
            Create your account
          </a>
        </p>
        <p style="font-size:12px;opacity:0.8">Or copy this link: {{referralLink}}</p>

        {{#if message}}
          <hr/>
          <p><strong>Message from {{inviterName}}:</strong></p>
          <p>{{message}}</p>
        {{/if}}

        <hr/>
        <p style="font-size:12px;opacity:0.8">— FFB Team</p>
      </div>
    `,
  },
});

export function renderHandlebars(templateString, variables) {
  const compile = handlebars.compile(String(templateString || ""), {
    noEscape: false,
    strict: false,
  });
  return compile(variables || {});
}
