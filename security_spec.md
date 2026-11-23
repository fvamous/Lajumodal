# Security Specification: LajuModal Multi-User SaaS

## 1. Data Invariants
1. **Strict Ownership & PII Isolation**: Every document under `/users/{userId}/private/profile`, `/users/{userId}/assets/{assetId}`, `/users/{userId}/sprints/{sprintId}`, and `/users/{userId}/rules/{ruleId}` belongs strictly to `userId` (`request.auth.uid == userId` and `email_verified == true`), and `ownerId` inside the payload must equal `userId` and remain immutable on update.
2. **Temporal Integrity**: `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time` on both create and update.
3. **Strict Key & Type Boundaries**: All document creates must pass `hasAll` and `hasOnly` key allowlists; all updates are action-partitioned with `affectedKeys().hasOnly(...)` and wrapped by `isValid[Entity](incoming())`.
4. **Quota & Numeric Bounds**: `aiCreditsUsed >= 0 && aiCreditsUsed <= aiCreditsLimit`, `balanceIDR >= 0`, `targetPercent >= 0 && targetPercent <= 100`, and all string lengths match `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read/write on `/users/userA/private/profile`.
2. Authenticated User B attempting to `get` or `list` `/users/userA/assets`.
3. User A with `email_verified == false` attempting to create an asset.
4. User A attempting to set `ownerId: "userB"` inside `/users/userA/assets/asset1`.
5. User A sending a shadow field `isAdmin: true` on `/users/userA/private/profile`.
6. User A attempting to create an asset with a 150-character document ID (`isValidId` rejection).
7. User A attempting to modify `createdAt` or `ownerId` during an update on `/users/userA/assets/asset1`.
8. User A attempting to forge a client-side `updatedAt` timestamp instead of `request.time`.
9. User A attempting to set `aiCreditsLimit: 999999` on `"free"` plan tier or bypass `aiCreditsUsed` decrement.
10. User A attempting to inject `balanceIDR: -5000000` (negative balance poisoning).
11. User A attempting to inject a 5KB string into `asset.name` (`maxLength: 120`).
12. User A attempting an update with an unknown field `extraNote` not in `affectedKeys().hasOnly(...)`.
