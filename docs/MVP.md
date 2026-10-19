# Barber Booking SaaS

## MVP Master Reference

> **Document Type:** Product + Technical Reference
> **Status:** MVP Development
> **Backend:** TypeScript + Express.js
> **Database:** PostgreSQL
> **ORM:** Prisma
> **Mobile:** Flutter
> **Authentication:** JWT
> **Validation:** Zod
> **Realtime:** Socket.IO
> **Push Notifications:** Firebase Cloud Messaging (FCM)

---

# 1. Project Overview

## 1.1 Product

The application is a SaaS platform that connects customers with barbers.

Customers can:

* Create an account.
* Discover barbers.
* Search for barbers.
* View barber profiles.
* View barber services.
* View barber gallery.
* View barber location.
* View working hours.
* Check whether a barber is currently open/closed.
* Book appointments.
* Track their queue/turn.
* Receive notifications.
* Review barbers.
* View booking history.
* Favorite barbers.
* Rebook with a barber.

Barbers can:

* Create a barber account.
* Create and manage their barber profile.
* Add gallery images.
* Add and manage services.
* Configure working hours.
* Set availability/open/closed status.
* Configure their location.
* Receive and manage bookings.
* Manage the queue.
* Receive notifications.
* View reviews.
* Give feedback about customers.

Admins can:

* Manage the platform.
* Verify barbers.
* Manage users/barbers.
* Monitor the system.
* Access administrative functionality.

---

# 2. Main Product Goal

The MVP should make this flow possible:

```text
Customer
   ↓
Discover Barber
   ↓
View Barber Profile
   ↓
View Services
   ↓
Choose Service
   ↓
Choose Available Time
   ↓
Create Booking
   ↓
Receive Confirmation
   ↓
Track Queue / Turn
   ↓
Receive Notifications
   ↓
Complete Appointment
   ↓
Review Barber
```

Barber flow:

```text
Barber Registration
        ↓
Create Barber Profile
        ↓
Add Gallery
        ↓
Add Services
        ↓
Configure Location
        ↓
Configure Working Hours
        ↓
Set Availability
        ↓
Receive Bookings
        ↓
Manage Queue
        ↓
Complete Appointments
```

---

# 3. MVP Scope

The MVP consists of the following features.

```text
01. Backend Foundation
02. Database Foundation
03. Authentication & Authorization
04. User Profile
05. Barber Registration
06. Barber Profile
07. Barber Gallery
08. Barber Services
09. Working Hours
10. Open / Closed Status
11. Barber Discovery
12. Search
13. Map / Location
14. Barber Details
15. Booking
16. Queue
17. Real-Time Queue
18. Notifications
19. Reviews
20. Booking History
21. Barber Feedback
22. Favorites
23. Rebook
24. Barber Verification
25. Admin Dashboard
```

---

# 4. Current Implementation Status

The project currently contains the backend API.

Implemented:

* Backend foundation
* PostgreSQL + Prisma
* Authentication
* Authorization
* JWT
* User profile
* Barber registration
* Barber profile
* Barber gallery implementation

The Gallery feature must be verified before it is considered complete.

Known Gallery verification points:

* Gallery router must be confirmed as mounted in the main router.
* `BarberImage` must exist correctly in `schema.prisma`.
* Existing migration must be reconciled with Prisma schema.
* Automated Gallery tests must match the documentation.
* API documentation must reflect the actual test setup.

Not implemented yet:

* Barber Services
* Working Hours
* Open/Closed
* Discovery
* Search
* Maps
* Booking
* Queue
* Realtime Queue
* Notifications
* Reviews
* Booking History
* Barber Feedback
* Favorites
* Rebook
* Barber Verification
* Admin Dashboard
* Flutter application

---

# 5. Technology Stack

## Backend

```text
Node.js
TypeScript
Express.js
```

## Database

```text
PostgreSQL
Prisma ORM
```

## Authentication

```text
JWT
bcrypt
```

## Validation

```text
Zod
```

## Security

```text
Helmet
CORS
JWT authentication
Role-based authorization
Input validation
```

## Mobile

```text
Flutter
```

## Realtime

```text
Socket.IO
```

## Push Notifications

```text
Firebase Cloud Messaging
```

## Maps

Possible:

```text
Google Maps
```

or:

```text
Mapbox
```

The final provider should be selected before implementing the Map feature.

---

# 6. User Roles

There are three roles.

```text
USER
BARBER
ADMIN
```

## USER

A normal customer.

Can:

* Manage own profile.
* Discover barbers.
* Search.
* View public barber information.
* Create bookings.
* Manage own bookings.
* Track queue.
* Receive notifications.
* Review barbers.
* Favorite barbers.
* Rebook.

Cannot:

* Create barber services.
* Modify barber profiles.
* Manage barber gallery.
* Manage barber queue.
* Access admin functionality.

---

## BARBER

A barber account.

Can:

* Manage own barber profile.
* Manage own gallery.
* Manage own services.
* Configure working hours.
* Configure location.
* Manage availability.
* Manage bookings.
* Manage queue.
* Receive notifications.
* View customer-related booking information.
* Give customer feedback.

Cannot:

* Verify itself.
* Modify another barber's data.
* Access admin-only functionality.

---

## ADMIN

Platform administrator.

Can:

* Verify barbers.
* Manage platform users.
* Manage barbers.
* Access admin dashboard.
* Perform administrative actions.

Admin permissions must be implemented explicitly through role middleware.

---

# 7. Authentication

Authentication uses JWT.

## Register Customer

```http
POST /api/v1/auth/register
```

Example:

```json
{
  "name": "Youssef Al-Saeedi",
  "email": "youssef@example.com",
  "phone": "01012345678",
  "password": "Password123!"
}
```

The client cannot select the role.

The normal registration endpoint creates:

```text
USER
```

---

# 8. Barber Registration

```http
POST /api/v1/auth/register/barber
```

Example:

```json
{
  "name": "Ahmed Mohamed",
  "email": "ahmed.barber@example.com",
  "phone": "01098765432",
  "password": "Password123!"
}
```

Creates:

```text
User.role = BARBER
```

This does NOT automatically verify the barber.

Important distinction:

```text
Account Registration
        ≠
Barber Profile Creation
        ≠
Barber Verification
        ≠
Publishing
```

---

# 9. Authentication Rules

JWT payload should contain the minimum required information.

Example:

```json
{
  "userId": "user_id",
  "role": "BARBER"
}
```

Passwords must always be hashed.

Never store:

```text
plaintext password
```

Never return:

```text
passwordHash
```

Protected endpoints use:

```http
Authorization: Bearer <token>
```

---

# 10. API Response Convention

## Success

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

## Error

```json
{
  "success": false,
  "message": "Something went wrong",
  "errors": []
}
```

The API should maintain consistent response structures.

---

# 11. HTTP Status Codes

Use standard HTTP semantics.

Common statuses:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Validation Error
429 Too Many Requests
500 Internal Server Error
```

Do not use status codes randomly.

---

# 12. User Profile

Users can update their own profile.

Allowed:

```text
name
phone
avatarUrl
```

The client cannot modify:

```text
id
role
passwordHash
createdAt
updatedAt
```

Password changes require the current password.

---

# 13. Barber Model

Conceptually:

```text
User
  │
  │ 1 : 1
  ▼
Barber
```

A barber profile belongs to exactly one User.

Important fields:

```text
id
userId
businessName
bio
isVerified
isActive
createdAt
updatedAt
```

`userId` must be unique.

---

# 14. Barber Profile

Public profile information must be separated from private authentication information.

Public information may include:

```text
barberId
businessName
bio
isVerified
gallery
services
location
working hours
availability
reviews
```

Do not expose sensitive User information through public barber endpoints.

Never expose:

```text
passwordHash
```

Avoid exposing:

```text
email
phone
role
userId
```

unless a specific business requirement explicitly requires it.

---

# 15. Barber Gallery

A barber can have multiple images.

Relationship:

```text
Barber
   │
   └── BarberImage[]
```

Expected model:

```prisma
model BarberImage {
  id String @id @default(cuid())

  barberId String

  imageUrl String
  altText  String?

  sortOrder Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  barber Barber @relation(
    fields: [barberId],
    references: [id],
    onDelete: Cascade
  )

  @@index([barberId, sortOrder])
}
```

Barber:

```prisma
images BarberImage[]
```

Maximum:

```text
10 images per barber
```

The image with:

```text
sortOrder = 0
```

is considered the first/primary image.

Do not add `isPrimary` unless a real business requirement appears.

---

# 16. Gallery Endpoints

```http
POST   /api/v1/barbers/me/gallery
GET    /api/v1/barbers/me/gallery
GET    /api/v1/barbers/:barberId/gallery
PATCH  /api/v1/barbers/me/gallery/reorder
DELETE /api/v1/barbers/me/gallery/:imageId
```

The server determines the barber from the authenticated user.

The client must never provide:

```text
barberId
```

for ownership.

---

# 17. Image Storage

The database should store image metadata and URL.

Possible future storage:

```text
S3
Cloudinary
Cloudflare R2
Other object storage
```

The application should not store large image binaries directly inside PostgreSQL.

For MVP, if no object-storage provider exists, a valid image URL can be used.

---

# 18. Barber Services

A barber can create multiple services.

Example:

```text
Haircut
Beard
Haircut + Beard
Kids Haircut
Hair Styling
```

A service should contain conceptually:

```text
id
barberId
name
description
price
durationMinutes
isActive
createdAt
updatedAt
```

Important:

```text
price
duration
availability
```

belong to the service.

A customer chooses a service when creating a booking.

---

# 19. Service Rules

A barber can:

* Create a service.
* Update a service.
* Disable a service.
* Delete a service when allowed.

A customer can only book active services.

Do not allow a customer to modify:

```text
barberId
```

The server derives ownership from authentication.

---

# 20. Working Hours

Barbers configure weekly working hours.

Example:

```text
Saturday
10:00 → 22:00

Sunday
10:00 → 22:00

Monday
10:00 → 22:00
```

A barber can have:

```text
open time
close time
```

for each working day.

The system must validate:

```text
open < close
```

Working hours should be stored in a way that supports future timezone handling.

The business timezone should be explicit.

For the Egyptian market, the initial default may be:

```text
Africa/Cairo
```

but timezone should not be hardcoded throughout the application.

---

# 21. Open / Closed Status

There is a difference between:

```text
Working Hours
```

and:

```text
Current Availability
```

A barber may have working hours but temporarily be closed.

The system should support:

```text
OPEN
CLOSED
```

or an equivalent representation.

Do not confuse:

```text
isActive
```

with:

```text
isOpen
```

`isActive` means the barber account/profile is active on the platform.

`isOpen` represents current operational availability.

---

# 22. Barber Location

A barber must have a location.

The location can be obtained from:

1. Current device location.
2. Manual map search.
3. Moving a pin on the map.

The user must be able to correct the automatically detected location.

The system should store coordinates:

```text
latitude
longitude
```

Potential future fields:

```text
address
city
area
```

Do not depend only on a textual address for geographic search.

---

# 23. Location Accuracy

The application should allow the barber to:

```text
Detect current location
        ↓
Show marker
        ↓
Move marker
        ↓
Confirm location
```

The backend should validate coordinate ranges.

Latitude:

```text
-90 → 90
```

Longitude:

```text
-180 → 180
```

---

# 24. Barber Discovery

Customers should be able to discover barbers.

Possible discovery criteria:

```text
Nearby
Popular
Verified
Open now
Available
Recently active
```

The initial MVP should prioritize:

```text
Nearby
Search
```

Avoid building a complex recommendation engine during MVP.

---

# 25. Search

Customers can search by:

```text
Barber name
Business name
Location
```

Search should be implemented according to actual database access patterns.

Do not immediately introduce:

```text
Elasticsearch
```

unless PostgreSQL becomes an actual bottleneck.

---

# 26. Pagination

Large collections must not be returned without limits.

Use pagination for:

```text
Barber discovery
Search results
Reviews
Bookings
Admin lists
```

Small bounded collections such as:

```text
Gallery
```

do not require pagination when they have a hard limit of 10.

Prefer efficient pagination strategies when scale requires it.

---

# 27. Barber Details

A public barber details page should aggregate:

```text
Profile
Gallery
Services
Location
Working Hours
Current Status
Reviews
Verification Status
```

Avoid N+1 queries.

Use Prisma queries intentionally.

Do not load unrelated private User fields.

---

# 28. Booking

Booking is one of the most important MVP features.

Basic flow:

```text
Customer
   ↓
Select Barber
   ↓
Select Service
   ↓
Select Date
   ↓
Select Available Time
   ↓
Create Booking
```

A booking should conceptually contain:

```text
id
userId
barberId
serviceId
date/time
status
price snapshot
duration snapshot
createdAt
updatedAt
```

---

# 29. Booking Status

Possible statuses:

```text
PENDING
CONFIRMED
IN_PROGRESS
COMPLETED
CANCELLED
NO_SHOW
```

The exact state machine should be defined before implementation.

Invalid state transitions must be rejected.

Example:

```text
COMPLETED → PENDING
```

should not be allowed.

---

# 30. Booking Snapshot Rules

When a booking is created, important service values should be copied into the booking.

For example:

```text
service name
price
duration
```

Why?

Because the barber may later change:

```text
service price
```

but old bookings must retain their historical value.

Therefore:

```text
Current Service Price
        ≠
Historical Booking Price
```

---

# 31. Booking Concurrency

Booking creation must be designed carefully.

Two customers must not be able to successfully reserve the same unavailable slot.

Use:

```text
database constraints
transactions
appropriate locking / isolation
```

where required.

Do not rely only on:

```text
SELECT → check → INSERT
```

because concurrent requests can race.

---

# 32. Queue

The queue represents the customer's current turn/order.

Conceptually:

```text
Barber
   ↓
Queue
   ├── Customer 1
   ├── Customer 2
   ├── Customer 3
   └── Customer 4
```

Customers should be able to see:

```text
Your position
People before you
Current turn
Estimated waiting information
```

The exact queue algorithm must be finalized before implementation.

---

# 33. Queue Rules

The queue must be tied to real bookings.

Do not create a completely independent queue that can contradict booking data.

The system must define:

```text
When customer enters queue
When position changes
When customer is served
When customer leaves/cancels
When barber skips a customer
```

These transitions must be controlled server-side.

---

# 34. Real-Time Queue

Socket.IO will be used for real-time updates.

Possible events:

```text
queue:updated
queue:position_changed
booking:status_changed
```

The client should not be trusted to modify queue state through socket events.

Sockets are for:

```text
real-time communication
```

The backend remains the source of truth.

---

# 35. Socket.IO Scaling

The initial implementation can use Socket.IO with the existing API architecture.

When horizontal scaling becomes necessary, use an appropriate adapter such as Redis.

Do not add Redis only because the target is 10 million users.

Introduce it when:

```text
multiple API instances
+
multiple Socket.IO instances
```

actually require shared realtime state/event propagation.

---

# 36. Notifications

Notifications are part of the MVP.

Potential events:

```text
Booking created
Booking confirmed
Booking cancelled
Appointment approaching
Queue position changed
Your turn is near
Barber opened/closed
```

Push notifications should use:

```text
Firebase Cloud Messaging
```

The backend should store device tokens separately from core User data when implemented.

A user may have multiple devices.

Therefore:

```text
User
  └── DeviceToken[]
```

is preferable to a single token field.

---

# 37. Notification Reliability

Notifications should not be the only source of truth.

For example:

```text
Queue state
Booking status
```

must always be retrievable through API.

If a push notification is missed, the application should still display the current state.

---

# 38. Reviews

After a completed appointment, the customer can review the barber.

Review concept:

```text
User
  ↓
Booking
  ↓
Review
  ↓
Barber
```

A review should be connected to the booking.

This prevents arbitrary reviews from users who never booked the barber.

---

# 39. Review Rules

Possible fields:

```text
id
userId
barberId
bookingId
rating
comment
createdAt
updatedAt
```

Rating should have a fixed valid range.

For example:

```text
1 → 5
```

A user should not be able to review the same completed booking multiple times.

---

# 40. Booking History

Customers need to see:

```text
Upcoming
Completed
Cancelled
```

history.

Barbers need to see their booking history as well.

Lists must be paginated.

Queries should use indexes according to actual filtering patterns.

---

# 41. Barber Feedback

The product allows barbers to leave feedback about customers.

This should not automatically become a public rating system.

The initial implementation should define:

```text
who can create feedback
when it can be created
who can view it
whether it is public/private
```

The backend must enforce these rules.

Do not expose private barber feedback publicly unless explicitly required.

---

# 42. Favorites

Customers can favorite barbers.

Relationship:

```text
User
  ↓
Favorite
  ↓
Barber
```

There must be a unique constraint preventing duplicate favorites.

Conceptually:

```text
@@unique([userId, barberId])
```

---

# 43. Rebook

A customer can rebook a barber from previous bookings.

The system should reuse:

```text
Barber
Service
```

but must calculate current availability again.

Do not blindly duplicate the old booking.

Important:

```text
Previous Booking
        ↓
Reuse selection
        ↓
Check current availability
        ↓
Create new booking
```

---

# 44. Barber Verification

Verification is an admin-controlled process.

Barber cannot verify itself.

Possible lifecycle:

```text
BARBER ACCOUNT
      ↓
PROFILE
      ↓
PENDING
      ↓
ADMIN REVIEW
      ↓
VERIFIED / REJECTED
```

The exact verification data can be expanded later.

The important MVP rule:

```text
isVerified
```

must not be writable by the barber.

---

# 45. Admin Dashboard

Admin dashboard is backend/admin functionality.

Initial capabilities:

```text
View users
View barbers
Verify barbers
Deactivate barber
View bookings
View platform activity
```

Admin endpoints must be protected by:

```text
authenticate
+
requireRole("ADMIN")
```

---

# 46. Database Principles

Use PostgreSQL as the primary source of truth.

Use Prisma for database access.

Models should generally use:

```text
String CUID IDs
createdAt
updatedAt
```

Foreign keys should use clear names:

```text
userId
barberId
bookingId
serviceId
```

---

# 47. Database Indexing

Indexes must be based on actual query patterns.

Do not add indexes blindly.

Common candidates may include:

```text
User.email
User.phone
Barber.userId
Barber.isActive
Barber.isVerified
BarberImage(barberId, sortOrder)
```

Future indexes should be added when their query pattern is clear.

---

# 48. Database Integrity

Business rules that can be enforced by PostgreSQL should be enforced at the database level where practical.

Examples:

```text
unique email
unique phone
unique barber.userId
unique favorite(userId, barberId)
foreign keys
```

Application validation is not a replacement for database integrity.

---

# 49. Transactions

Use transactions when multiple database operations must succeed or fail together.

Good examples:

```text
Booking creation
Queue state transition
Gallery reorder
Complex booking cancellation
```

Do not wrap every single CRUD operation in a transaction unnecessarily.

---

# 50. Ownership

Every resource that belongs to a user/barber must verify ownership server-side.

Never trust:

```json
{
  "barberId": "..."
}
```

from a barber request to determine ownership.

Use:

```text
authenticated user
        ↓
barber profile
        ↓
resource ownership
```

---

# 51. Security Rules

Never trust client input.

Always validate:

```text
body
params
query
headers where necessary
```

Use Zod.

Prevent:

```text
mass assignment
IDOR
privilege escalation
sensitive data leakage
```

Do not allow users to submit protected fields such as:

```text
role
isVerified
isActive
userId
barberId
createdAt
updatedAt
```

unless the specific endpoint explicitly requires controlled server-side behavior.

---

# 52. Error Handling

The backend should have one global error-handling strategy.

Expected errors should be converted into consistent API responses.

Examples:

```text
Validation error
Authentication error
Authorization error
Not found
Conflict
Database error
Unexpected server error
```

Do not expose internal stack traces in production.

---

# 53. API Versioning

Current API prefix:

```text
/api/v1
```

Example:

```text
/api/v1/auth/login
/api/v1/barbers
/api/v1/users/me
```

Do not randomly change endpoint versions.

Breaking API changes should result in a new version when necessary.

---

# 54. Project Architecture

Recommended architecture:

```text
src/
├── config/
├── middlewares/
├── routes/
├── utils/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── barbers/
│   │   ├── gallery/
│   │   ├── services/
│   │   ├── working-hours/
│   │   ├── location/
│   │   └── ...
│   ├── bookings/
│   ├── queue/
│   ├── notifications/
│   ├── reviews/
│   ├── favorites/
│   └── admin/
├── app.ts
└── server.ts
```

Each feature should preferably contain:

```text
controller
service
routes
validation
types
```

when those layers are actually needed.

Do not create empty abstraction layers just for the sake of architecture.

---

# 55. Controller vs Service

Controllers should primarily handle:

```text
HTTP request
HTTP response
```

Services should contain:

```text
business logic
database operations
business rules
```

Avoid putting large business logic directly inside controllers.

---

# 56. Validation

Use Zod for request validation.

Validate:

```text
body
params
query
```

Do not rely only on TypeScript types.

TypeScript disappears at runtime.

---

# 57. Environment Variables

Secrets and environment-specific configuration must be stored in environment variables.

Examples:

```text
DATABASE_URL
JWT_SECRET
PORT
NODE_ENV
API_PREFIX
```

Never commit secrets.

Use:

```text
.env
.env.example
```

`.env` must not be committed.

---

# 58. Scalability Target

The long-term target is approximately:

```text
10 million users
```

This does NOT mean that the MVP should immediately use microservices, Kubernetes, Elasticsearch, Redis, Kafka, or multiple databases.

The principle is:

```text
Design correctly first.
Measure bottlenecks.
Scale the bottleneck.
```

---

# 59. Scalability Principles

From the beginning:

* Avoid N+1 queries.
* Use appropriate indexes.
* Paginate large collections.
* Keep API responses focused.
* Avoid unnecessary joins.
* Use database constraints.
* Keep API servers stateless.
* Avoid loading large datasets into memory.
* Use connection pooling.
* Use background jobs for expensive asynchronous work when needed.
* Use caching only for data that benefits from caching.
* Design realtime communication so it can scale horizontally later.

---

# 60. PostgreSQL Performance

For important queries:

```text
WHERE
ORDER BY
JOIN
LIMIT
OFFSET/cursor
```

consider indexes based on actual access patterns.

When performance becomes important:

```text
EXPLAIN
EXPLAIN ANALYZE
```

should be used to inspect expensive queries.

Do not optimize based only on assumptions.

---

# 61. API Performance

Avoid:

```text
SELECT *
```

when only a few fields are required.

Use Prisma `select` where appropriate.

Example:

```ts
const barber = await prisma.barber.findFirst({
  where: {
    id: barberId,
    isActive: true
  },
  select: {
    id: true,
    businessName: true,
    bio: true,
    isVerified: true
  }
});
```

Return only what the endpoint needs.

---

# 62. Caching

Caching is NOT required for every feature.

Potential future cache candidates:

```text
Popular barber discovery
Static configuration
Frequently accessed public data
```

Do not cache:

```text
everything
```

without measuring the need.

Redis can be introduced later.

---

# 63. Background Jobs

Background jobs may eventually be useful for:

```text
Push notifications
Emails
Image processing
Analytics
Scheduled reminders
```

The initial MVP should avoid unnecessary infrastructure unless a real asynchronous requirement exists.

---

# 64. Logging

Production logs should help diagnose:

```text
request failures
database errors
authentication issues
booking conflicts
notification failures
```

Never log:

```text
passwords
JWT secrets
passwordHash
sensitive personal data unnecessarily
```

---

# 65. Testing Strategy

Each feature should have tests appropriate to its business risk.

At minimum test:

```text
happy path
validation
authorization
ownership
important business rules
database constraints
```

For critical features such as Booking and Queue, concurrency and state transitions are especially important.

---

# 66. API Documentation

Every implemented endpoint should be documented.

Documentation should include:

```text
Method
URL
Description
Authentication
Required Role
Request Body
Parameters
Example Request
Expected Response
Error Cases
Test Status
```

Documentation must describe the actual implementation.

Never document an endpoint that does not exist.

Never say tests do not exist when automated tests are present.

---

# 67. Manual API Testing

HTTP manual tests can be performed through:

```text
Postman
Insomnia
curl
```

At least one successful request should be verified for each endpoint during development.

---

# 68. Feature Development Rule

Before implementing a new feature:

1. Inspect existing code.
2. Inspect Prisma schema.
3. Inspect current migrations.
4. Inspect existing routes.
5. Inspect existing middleware.
6. Understand existing conventions.
7. Implement only the required feature.
8. Add tests.
9. Run validation/build/tests.
10. Update documentation.

Never blindly overwrite existing implementation.

---

# 69. AI Coding Agent Rules

Any AI coding agent working on this repository MUST follow these rules.

## Before changing code

Inspect:

```text
git status
git diff
relevant source files
schema.prisma
migrations
routes
tests
```

## Never run

```bash
git reset --hard
git checkout .
git clean -fd
prisma migrate reset
```

unless the developer explicitly requests it and understands the consequences.

## Never

* Rewrite the whole project.
* Replace working architecture without a reason.
* Delete existing features.
* Add dependencies unnecessarily.
* Introduce microservices unnecessarily.
* Introduce Redis without a real requirement.
* Introduce Elasticsearch without a real requirement.
* Change API conventions without approval.
* Modify unrelated features while implementing a feature.
* Assume documentation is correct without checking code.

---

# 70. AI Feature Implementation Workflow

For every new feature:

```text
READ
 ↓
UNDERSTAND
 ↓
PLAN
 ↓
IMPLEMENT
 ↓
VALIDATE
 ↓
TEST
 ↓
DOCUMENT
```

The AI must report:

```text
What existed
What was missing
What changed
What was tested
What passed
What failed
What remains
```

Never claim tests passed if they were not actually executed.

---

# 71. Git Safety

Before significant changes:

```bash
git status
git diff
```

After changes:

```bash
git diff
git status
```

Review changes before committing.

Keep commits focused.

Example:

```text
feat: add barber services
fix: repair gallery router
test: add booking concurrency tests
docs: update API reference
```

---

# 72. Mobile Application

The mobile application will be built using Flutter.

Main customer screens:

```text
Splash
Login
Register
Home
Search
Map
Barber List
Barber Details
Service Selection
Booking
Booking Confirmation
Queue
Notifications
Bookings
Favorites
Profile
Reviews
```

Main barber screens:

```text
Login
Register
Dashboard
Profile
Gallery
Services
Working Hours
Location
Availability
Bookings
Queue
Notifications
Reviews
Settings
```

Admin functionality may initially be web/API based.

---

# 73. Mobile/API Responsibility

Flutter handles:

```text
UI
local state
navigation
API communication
socket connection
push notification presentation
map UI
```

Backend handles:

```text
authentication
authorization
business rules
database
booking integrity
queue integrity
notifications
security
```

Never move critical business rules only into Flutter.

The backend is the source of truth.

---

# 74. Future Monetization

The MVP launches without platform fees.

However, the architecture must remain compatible with future monetization.

Potential future models:

```text
Subscription
Per-booking fee
Commission
Fixed platform fee
Freemium
Paid features
Featured barber
Advertising
```

Do NOT implement full payment/billing infrastructure during the MVP unless explicitly requested.

---

# 75. Billing Architecture Principle

Booking must remain independent from billing.

Future financial records should snapshot values.

For example:

```text
Booking
   ↓
Platform Fee
   ↓
Transaction
```

If the platform fee changes later:

```text
Old booking fee
```

must not change automatically.

Potential future models:

```text
Subscription
Payment
Transaction
PlatformFee
Payout
Invoice
```

These are future architecture concepts, not required MVP models.

---

# 76. Data Ownership

General ownership:

```text
User
 └── owns personal profile

Barber
 └── owns barber profile
 └── owns gallery
 └── owns services
 └── owns working hours
 └── owns location
 └── manages bookings
 └── manages queue

Booking
 └── belongs to User
 └── belongs to Barber
 └── references Service

Review
 └── belongs to User
 └── belongs to Barber
 └── should reference Booking
```

---

# 77. Important Business Principle

The backend is the source of truth.

The client must never be trusted for:

```text
role
ownership
verification
booking availability
booking price
queue position
queue status
service ownership
authorization
```

The backend must calculate and validate these values.

---

# 78. MVP Non-Goals

The following should NOT be built unless explicitly added to scope:

```text
Microservices
Complex recommendation engine
AI barber recommendations
Advanced analytics
Complex payment system
Marketplace commission engine
Multi-country support
Complex subscription billing
Elasticsearch
Kafka
Kubernetes
Advanced distributed caching
Complex loyalty system
```

These may become future features.

---

# 79. Definition of Done

A feature is considered complete only when:

```text
Implementation exists
        +
Routes are mounted
        +
Validation exists
        +
Authorization exists where needed
        +
Business rules are enforced
        +
Database schema is correct
        +
Migration state is correct
        +
Tests pass
        +
Build/typecheck passes
        +
Documentation is updated
```

A feature is NOT complete simply because its files exist.

---

# 80. Current Development Priority

The development order is:

```text
01 Backend Foundation        DONE
02 Database Foundation       DONE
03 Authentication            DONE
04 User Profile              DONE
05 Barber Registration       DONE
06 Barber Profile            DONE
07 Barber Gallery            IN REVIEW
08 Barber Services           NEXT
09 Working Hours             DONE     
10 Open / Closed             DONE
11 Barber Discovery          DONE
12 Search                    DONE
13 Map / Location            DONE
14 Barber Details            DONE
15 Booking                   DONE
16 Queue
17 Real-Time Queue
18 Notifications
19 Reviews
20 Booking History
21 Barber Feedback
22 Favorites
23 Rebook
24 Barber Verification
25 Admin Dashboard
```

---

# 81. Current Priority

Before starting Feature 08:

### Feature 07 must be verified.

Required checks:

```text
[ ] BarberImage exists in Prisma schema
[ ] Barber relation exists
[ ] Existing migration is consistent
[ ] Gallery router is mounted
[ ] Gallery endpoints are reachable
[ ] Add image works
[ ] Get own gallery works
[ ] Public gallery works
[ ] Reorder works
[ ] Delete works
[ ] Maximum 10 images enforced
[ ] Ownership protection works
[ ] Authorization works
[ ] Automated tests pass
[ ] Build passes
[ ] Prisma validation passes
[ ] Documentation is correct
```

Only after these checks pass should Feature 07 be marked:

```text
COMPLETE
```

---

# 82. Golden Rules

These rules apply to the entire project.

### Rule 1

Do not trust the client.

### Rule 2

Database integrity matters.

### Rule 3

Authentication and authorization are different.

### Rule 4

Registration is not verification.

### Rule 5

Current data and historical data should be separated when necessary.

### Rule 6

The backend is the source of truth.

### Rule 7

Do not over-engineer the MVP.

### Rule 8

Design for scale through good fundamentals first.

### Rule 9

Every feature needs tests.

### Rule 10

Documentation must match reality.

### Rule 11

Never modify unrelated features without a reason.

### Rule 12

AI coding agents must inspect before changing.

### Rule 13

Never use destructive Git/Prisma commands without explicit approval.

### Rule 14

Every new business rule must be enforced server-side.

### Rule 15

When a feature is unclear, stop and clarify the business rule before writing code.

---

# 83. Source of Truth

This document is the high-level reference for:

```text
Developers
AI Coding Agents
Backend
Flutter
Database
QA
Product
```

However, the actual source of truth hierarchy is:

```text
Business Requirements
        ↓
MVP Reference
        ↓
Actual Code
        ↓
Database Schema
        ↓
Tests
        ↓
Documentation
```

If documentation conflicts with actual code, the team must investigate the discrepancy rather than blindly trusting either side.

If a new requirement changes the MVP, this document must be updated.

---

# 84. Project Principle

The goal is not to build the largest architecture.

The goal is to build a reliable product that can evolve.

The MVP should therefore be:

```text
Simple
Secure
Testable
Maintainable
Scalable
```

with the ability to evolve toward a much larger SaaS platform without prematurely introducing unnecessary infrastructure.
