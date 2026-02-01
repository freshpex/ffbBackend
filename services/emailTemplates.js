import handlebars from "handlebars";

// Central registry of default email templates.
// Templates use Handlebars placeholders, e.g. {{name}}, {{kycLink}}.
export const DEFAULT_EMAIL_TEMPLATES = Object.freeze({
  "account_suspended": {
    description: "Suspicious activity / suspension notice to user",
    subject: "Account Suspended — Action Required",
    text: (
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
      "support@ffbroker.cam\n"
    ),
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

  "password_changed_user": {
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

  "password_changed_admin": {
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

  "new_signup_admin": {
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
  "referral_invite": {
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

  "referral_invite": {
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
