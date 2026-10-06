const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
const FIREBASE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID;

export function hasFirebaseEnv() {
  return Boolean(
    FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY && FIREBASE_API_KEY,
  );
}

export function getFirebaseEnv() {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY || !FIREBASE_API_KEY) {
    throw new Error(
      "Missing Firebase environment variables. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and FIREBASE_API_KEY.",
    );
  }

  return {
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    // Private keys pasted into .env files usually carry escaped newlines.
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    apiKey: FIREBASE_API_KEY,
    storageBucket: FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
    databaseId: FIREBASE_DATABASE_ID || "(default)",
  };
}
