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
  initializeFirestore,
} from "firebase/firestore";
import { Database, connectDatabaseEmulator, getDatabase } from "firebase/database";
import { FirebaseStorage, connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, Functions } from "firebase/functions";
import { appCheckSiteKey, firebaseConfig, isFirebaseConfigured, useFirebaseEmulators } from "@/app/config";

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
  if (!firestore) {
    // Forces XHR long-polling instead of Firestore's default WebChannel
    // streaming transport — a defensive setting for networks (some
    // corporate proxies, sandboxed containers) where chunked "forever
    // frame" streaming responses get silently dropped. Harmless,
    // slightly higher-latency fallback everywhere else, including
    // production. (The actual root cause hit during this project's own
    // E2E verification turned out to be unrelated — see
    // IMPLEMENTATION_PLAN.md Phase 7 and roomsApi.ts's comment on why
    // room creation avoids writeBatch — but this setting is cheap
    // insurance worth keeping regardless.)
    firestore = initializeFirestore(getFirebaseApp(), { experimentalForceLongPolling: true });
  }
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

/**
 * Call once at app startup, before any other Firebase SDK usage. A
 * missing .env (no real/emulator Firebase project configured yet — the
 * normal state of this repository until a human completes the setup in
 * docs/deployment.md) is not a crash: Firebase-dependent features simply
 * report "not configured" instead of touching the SDK at all.
 */
export function bootstrapFirebase(): void {
  if (!isFirebaseConfigured()) {
    console.warn(
      "[firebase] No Firebase project configured (.env missing or incomplete) — " +
        "auth/puzzle-room features are disabled until docs/deployment.md's setup is done.",
    );
    return;
  }
  getFirebaseApp();
  initializeClientAppCheck();
  connectEmulatorsOnce();
}
