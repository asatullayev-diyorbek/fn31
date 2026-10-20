import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  AppCheck,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import {
  Auth,
  connectAuthEmulator,
  getAuth,
} from "firebase/auth";
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";
import { Database, connectDatabaseEmulator, getDatabase } from "firebase/database";
import { FirebaseStorage, connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, Functions } from "firebase/functions";
import { appCheckSiteKey, firebaseConfig, useFirebaseEmulators } from "@/app/config";

/**
 * Single composition point for every Firebase service the client uses.
 * Nothing here is a secret: see docs/security.md for why the web config
 * object is safe to ship and what actually protects data (Security Rules
 * + App Check + Auth).
 */
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firestore: Firestore | undefined;
let database: Database | undefined;
let storage: FirebaseStorage | undefined;
let functions: Functions | undefined;
let appCheck: AppCheck | undefined;
let emulatorsConnected = false;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * App Check is skipped against emulators (no real site key is needed
 * there) and initialized lazily so a missing/placeholder key during local
 * development never blocks the app from loading.
 */
export function initializeClientAppCheck(): AppCheck | undefined {
  if (useFirebaseEmulators || !appCheckSiteKey) {
    return undefined;
  }
  if (!appCheck) {
    appCheck = initializeAppCheck(getFirebaseApp(), {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return appCheck;
}

function connectEmulatorsOnce(): void {
  if (emulatorsConnected || !useFirebaseEmulators) return;
  connectAuthEmulator(getFirebaseAuth(), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(getFirebaseFirestore(), "127.0.0.1", 8080);
  connectDatabaseEmulator(getFirebaseDatabase(), "127.0.0.1", 9000);
  connectStorageEmulator(getFirebaseStorage(), "127.0.0.1", 9199);
  connectFunctionsEmulator(getFirebaseFunctions(), "127.0.0.1", 5001);
  emulatorsConnected = true;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  if (!firestore) firestore = getFirestore(getFirebaseApp());
  return firestore;
}

export function getFirebaseDatabase(): Database {
  if (!database) database = getDatabase(getFirebaseApp());
  return database;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp());
  return functions;
}

/** Call once at app startup, before any other Firebase SDK usage. */
export function bootstrapFirebase(): void {
  getFirebaseApp();
  initializeClientAppCheck();
  connectEmulatorsOnce();
}
