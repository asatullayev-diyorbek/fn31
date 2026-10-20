/**
 * Firestore document shapes used by Cloud Functions. Deliberately
 * duplicated (not imported) from src/types/firestore.ts in the frontend
 * package: functions/ is a separate, independently deployed package with
 * its own dependency graph (AGENT.md §"Keep privileged functions separate
 * from frontend code"), and these shapes use `admin.firestore.Timestamp`
 * rather than the client SDK's `Timestamp` type.
 */
import type { Timestamp } from "firebase-admin/firestore";

export type AuthTransactionStatus = "pending" | "verified" | "completed" | "expired" | "failed";

export interface AuthTransaction {
  status: AuthTransactionStatus;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  telegramUserId?: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  uid?: string;
  sessionMarker: string;
  failureReason?: string;
}

export interface TelegramIdentity {
  telegramUserId: string;
  uid: string;
  linkedAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  telegramUserId: string;
  displayName: string;
  telegramUsername?: string;
  photoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
