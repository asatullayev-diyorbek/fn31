export interface LockableEntity {
  lockedBy: string | null;
  lockExpiresAt: { toMillis: () => number } | null;
}

/** True if the entity is currently held by someone whose lease hasn't expired yet. */
export function isLockHeld(entity: LockableEntity, nowMs: number): boolean {
  if (!entity.lockedBy || !entity.lockExpiresAt) return false;
  return entity.lockExpiresAt.toMillis() > nowMs;
}

/** A dropped client (lease expired) never blocks a piece forever — anyone, including its original holder, can acquire it again once expired. */
export function canAcquireLock(entity: LockableEntity, uid: string, nowMs: number): boolean {
  if (!isLockHeld(entity, nowMs)) return true;
  return entity.lockedBy === uid;
}
