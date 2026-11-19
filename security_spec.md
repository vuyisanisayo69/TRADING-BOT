# Apex Trader AI — Firestore Security Specification

1. **Deny by Default**: All Firestore paths not explicitly matched are denied (`read, write: if false`).
2. **Authentication Required**: Every user workspace document, preference document, environment document (`SIMULATION` or `MT5_DEMO`), alert, and trade journal entry requires `request.auth != null`.
3. **Strict Owner Isolation**: A user can only read, create, update, or delete documents under `/users/{userId}/...` where `request.auth.uid == userId`.
4. **Live Trading Safety Invariant**: Documents under `/users/{userId}` must enforce `liveTradingEnabled == false`. Any attempt to write `liveTradingEnabled == true` from client code is rejected by Firestore security rules.
5. **No Client-Side Role Escalation**: A user cannot assign themselves `role == 'admin'` on creation or escalate their `role` on update.
6. **Input Validation & Bounds**:
   - `activeEnvironment` must be `'SIMULATION'` or `'MT5_DEMO'`.
   - `fixedPositionSize` must be a number in `(0, 100]`.
   - `symbols` must be a non-empty list capped at 25 entries.
   - All text fields are bounded in length to prevent storage abuse.
   - `uid` in `/users/{userId}` must equal `userId` and cannot be changed on update.
