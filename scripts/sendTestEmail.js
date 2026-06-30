import 'dotenv';
import { sendSuspensionEmail } from './mailjet.js';

(async () => {
  const r = await sendSuspensionEmail({
    toEmail: 'epekipoluenoch@gmail.com',
    toName: 'Enoch',
    kycLink: 'https://ffbroker.cam/login/accountsettings',
    resetLink: 'https://restuarant-ac2e2.firebaseapp.com/__/auth/action?mode=action&oobCode=code',
    suspiciousDetails: 'Multiple login locations'
  });
  console.log('Send result:', r);
})();