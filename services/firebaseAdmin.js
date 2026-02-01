import admin from 'firebase-admin';
import logger from '../middleware/logger.js';

let firebaseAppInitialized = false;

export function initFirebaseAdmin() {
  if (firebaseAppInitialized) return admin;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseAppInitialized = true;
      logger.info('Initialized Firebase Admin from SERVICE_ACCOUNT_JSON');
      return admin;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Uses the environment variable pointing to service account JSON file
      admin.initializeApp();
      firebaseAppInitialized = true;
      logger.info('Initialized Firebase Admin using GOOGLE_APPLICATION_CREDENTIALS');
      return admin;
    }

    logger.warn('Firebase Admin not initialized: no service account provided');
    return null;
  } catch (err) {
    logger.error('Error initializing Firebase Admin:', err);
    return null;
  }
}

export default admin;
