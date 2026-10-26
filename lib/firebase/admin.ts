import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

import { getFirebaseEnv } from "@/lib/firebase/config";

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

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminBucket() {
  return getStorage(getAdminApp()).bucket();
}
