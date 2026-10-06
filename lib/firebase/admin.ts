import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { getFirebaseEnv } from "@/lib/firebase/config";

let firestoreConfigured = false;

function getAdminApp(): App {
  if (getApps().length) {
    return getApp();
  }

  const { projectId, clientEmail, privateKey, storageBucket } = getFirebaseEnv();

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
    storageBucket,
  });
}

export function adminDb() {
  const db = getFirestore(getAdminApp(), getFirebaseEnv().databaseId);

  if (!firestoreConfigured) {
    firestoreConfigured = true;
    try {
      // Postgres-style payloads routinely carry undefined optional fields.
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured by a previous module instance (dev hot reload).
    }
  }

  return db;
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminBucket() {
  return getStorage(getAdminApp()).bucket();
}
