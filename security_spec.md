# Security Specification & Test Plan

## 1. Data Invariants
- Users: Email must be unique and valid. Roles restricted to set values.
- Tickets: Must be linked to a valid project. pp_number/passenger_name required.
- Projects: budget_allocated must be positive.
- TicketTasks: Must have a ticket_id.
- ActivityLogs: Log entries are immutable after creation.

## 2. The "Dirty Dozen" Payloads (Examples)
1. Write PII to public collection: `{email: "attacker@malice.com", role: "ADMIN", is_active: true}` to `users` where current user is HR.
2. Inject ghost field to user: `{email: "user@test.com", role: "HR", is_active: true, admin: true}` to `users/testUser`.
3. Create ticket without project: `{pp_number: "A123", passenger_name: "John Doe", status: "DRAFT"}` (missing project_id).
4. Update terminal status: Try to update a COMPLETED ticket.
5. ID poisoning: `projects/!@#$%^&*()`.
6. Self-assigned role: Create user with role "ADMIN".
7. Orphaned task: Create task with non-existent ticketId.
8. Role escalation: Update task status to skip requirement checks.
9. PII read: Authenticated HR reads another user's private data (if split).
10. Temporal shift: Create ticket with `createdAt: 1999-01-01`.
11. Payload size: 2MB string into `passenger_name`.
12. Status shortcut: Skip Stage 1 to set to COMPLETED.

## 3. Test Runner Outline (firestore.rules.test.ts)
- Utilize `@firebase/rules-unit-testing`.
- `describe` blocks for each collection.
- `it` blocks for every "Dirty Dozen" payload to ensure `assertFails`.
- `it` blocks for valid CRUD operations to ensure `assertSucceeds` for authorized owners/roles.
