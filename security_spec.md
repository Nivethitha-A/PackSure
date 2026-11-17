# PackSure AI – Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Authentication & Email Verification**:
   - No unauthenticated user may read, list, create, update, or delete any document in any collection.
   - All write operations require `request.auth != null && request.auth.token.email_verified == true`.
2. **Privilege Escalation Prevention & PII Isolation (`users/{userId}`, `admins/{userId}`)**:
   - A standard user creating their own `users/{userId}` document MUST set `uid == request.auth.uid` and `role == 'operator'` (unless they are the verified bootstrapped admin `nivethithaadiyapatham@gmail.com`).
   - Users can NEVER modify their own `role`, `uid`, `email`, or `createdAt` fields. Only an existing verified Admin (`isAdmin()`) may change a user's role or write to `/admins/{userId}`.
   - User profile reads (`get`) containing PII (`email`) are strictly restricted to `isOwner(userId) || isAdmin()`. `list` on `/users` is strictly restricted so non-admins can only query their own `uid`, never scrape all personnel emails.
3. **Order Ownership, Bounded Maps & Temporal Integrity (`orders/{orderId}`)**:
   - `orderId` path variable MUST match `^[a-zA-Z0-9_\-]+$` and `<= 128` chars.
   - `createdBy` MUST equal `request.auth.uid` on creation and is immutable thereafter.
   - `created_at` MUST equal `request.time` on creation and is immutable; `updated_at` MUST equal `request.time` on creation and every update.
   - `expected_components` is a strictly bounded map (`size() >= 1 && size() <= 4`) whose keys are restricted to `['Bearing', 'Bolt', 'Gear', 'Nut']`.
   - `list` queries on `/orders` enforce `resource.data.createdBy == request.auth.uid || isBootstrappedAdmin()` (no `get()`/`exists()` inside `allow list`, no blanket client delegation).
4. **Inspection Immutability, Parent Order Consistency & Fail-Safe Dispatch Approval (`inspections/{inspectionId}`)**:
   - An inspection MUST reference an existing parent order (`exists(/databases/$(database)/documents/orders/$(incoming().order_doc_id))`) and atomically update the parent order's `last_inspection_id` (`getAfter(...)` check on `create`).
   - `inspected_by` MUST equal `request.auth.uid` on creation and is immutable.
   - `original_image_path` and `annotated_image_path` MUST be path/URL strings (`<= 512` chars), preventing 1MB base64 blob injection into Firestore.
   - `detections` array is strictly bounded (`size() <= 200`) and type-guarded.
   - **Fail-Safe Terminal Locking**: Once created, inspection results (`inspection_status`, `detected_components`, `verification_result`, `detections`, `expected_components`) are immutable. The ONLY non-admin update allowed is adding `digital_signoff` when `existing().inspection_status == 'PASS'` and `existing().get('digital_signoff', null) == null`. Any attempt to approve a `FAIL` or `NEEDS_REVIEW` inspection, or overwrite an existing `digital_signoff`, is rejected with `PERMISSION_DENIED`.
5. **Global Configuration & Catalog (`settings/{settingId}`, `components/{componentId}`)**:
   - Only verified admins may create or update `settings` and `components`.
   - Verified signed-in users may `get` `settings/station` and `list` active `components` (`resource.data.active == true`).
6. **Global Default-Deny**:
   - Any unmatched path falls through to `match /{document=**} { allow read, write: if false; }`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

Every payload below MUST evaluate to `PERMISSION_DENIED`:

1. **Unauthenticated Order Read**: Unauthenticated client runs `getDoc(doc(db, 'orders', 'ord-1001'))`.
2. **Self-Assigned Admin Role on Signup**: Non-admin user (`alice@example.com`, `email_verified: true`) tries `setDoc(doc(db, 'users', aliceUid), { uid: aliceUid, name: 'Alice', email: 'alice@example.com', role: 'admin', createdAt: serverTimestamp(), lastLogin: serverTimestamp() })`.
3. **Self-Promotion via Profile Update**: Existing operator tries `updateDoc(doc(db, 'users', aliceUid), { role: 'admin', lastLogin: serverTimestamp() })`.
4. **PII Cross-User Read**: Non-admin user `alice` tries `getDoc(doc(db, 'users', bobUid))` to read Bob's email address.
5. **Unverified Email Spoof Attack on Admin**: Attacker with `email: 'nivethithaadiyapatham@gmail.com'` and `email_verified: false` tries to read `/users` or write `/settings/station`.
6. **Shadow / Ghost Field Injection on Order**: Authenticated user creates an order with all valid fields plus an undeclared ghost field `{ ..., isVerified: true }`.
7. **Client Timestamp Forgery**: Authenticated user creates an order passing a backdated client timestamp `created_at: Timestamp.fromDate(new Date('2020-01-01'))` instead of `request.time`.
8. **ID Poisoning (1.5KB Document ID)**: Authenticated user attempts `setDoc(doc(db, 'orders', 'A'.repeat(1500)), validOrderPayload)`.
9. **Orphaned Inspection Without Parent Order**: Authenticated user attempts to create an inspection in `/inspections/insp-fake` pointing to a non-existent `order_doc_id: 'nonexistent-order'` or without updating the parent order atomically.
10. **Fail-Safe Bypass (Approve FAIL Inspection)**: Authenticated inspector/operator attempts `updateDoc(doc(db, 'inspections', 'insp-fail-1'), { digital_signoff: { approved_by: 'Hacker', approved_at: serverTimestamp(), dispatch_authorization_code: 'AUTH-9999' }, updated_at: serverTimestamp() })` on an inspection whose `inspection_status == 'FAIL'`.
11. **Inspection Result Tampering (State Shortcutting)**: Non-admin user attempts `updateDoc(doc(db, 'inspections', 'insp-fail-1'), { inspection_status: 'PASS', updated_at: serverTimestamp() })`.
12. **Blanket List Query Scraping**: Non-admin user `alice` runs `getDocs(collection(db, 'orders'))` without a `where('createdBy', '==', aliceUid)` filter (exposing Bob's orders).
