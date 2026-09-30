import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import logger from '../middleware/logger.js';

let firebaseApp;

const firebaseAdmin = {
  auth: () => getAuth(firebaseApp),
};

export function initFirebaseAdmin() {
  if (firebaseApp) return firebaseAdmin;

  try {
    // Serverless instances can be reused. Reuse an existing Admin app instead
    // of trying to initialize the default app a second time.
    firebaseApp = getApps()[0];
    if (firebaseApp) return firebaseAdmin;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      logger.info('Initialized Firebase Admin from SERVICE_ACCOUNT_JSON');
      return firebaseAdmin;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Uses the environment variable pointing to service account JSON file
      firebaseApp = initializeApp({ credential: applicationDefault() });
      logger.info('Initialized Firebase Admin using GOOGLE_APPLICATION_CREDENTIALS');
      return firebaseAdmin;
    }

    logger.warn('Firebase Admin not initialized: no service account provided');
    return null;
  } catch (err) {
    logger.error('Error initializing Firebase Admin:', err);
    return null;
  }
}

export default firebaseAdmin;
