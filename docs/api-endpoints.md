# API Endpoints

Base URL used for testing: `http://127.0.0.1:3000/api/v1` (local development server).

The endpoint results below are the original manual HTTP smoke tests (one happy-path request per listed endpoint). Automated tests are also configured using Node's test runner through `npm test`; the Barber Gallery integration suite is available as `npm run test:gallery`. The gallery suite was run against the local development database: **12 passed, 0 failed**. Test credentials and bearer tokens are not recorded here.

## Authentication

### POST /api/v1/auth/register
**Description:** Register a new USER account.

**Authentication:** No

**Role:** None (the endpoint assigns `USER`).

**Request Body:** `name` (2–100 characters), `email`, `phone` (7–15 digits, optional leading `+`), `password` (8–72 characters).

```json
{
  "name": "Test User",
  "email": "test@example.com",
  "phone": "01000000000",
  "password": "ExamplePass123!"
}
```

**Expected Status:** `201`

**Test:** PASS

**Test Result:** Received HTTP `201`; a local development test user was registered and its access token was kept in memory for dependent endpoint tests.

---

### POST /api/v1/auth/register/barber
**Description:** Register a new BARBER account.

**Authentication:** No

**Role:** None (the endpoint assigns `BARBER`).

**Request Body:** Same fields and validation as USER registration.

```json
{
  "name": "Test Barber",
  "email": "test-barber@example.com",
  "phone": "01000000001",
  "password": "ExamplePass123!"
}
```

**Expected Status:** `201`

**Test:** PASS

**Test Result:** Received HTTP `201`; a local development test barber was registered and its access token was kept in memory for dependent endpoint tests.

---

### POST /api/v1/auth/login
**Description:** Log in with email and password.

**Authentication:** No

**Role:** None

**Request Body:** `email`, `password`.

```json
{
  "email": "test@example.com",
  "password": "ExamplePass123!"
}
```

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` using the test USER account registered during this run.

---

### GET /api/v1/auth/me
**Description:** Return the authenticated user's identity.

**Authentication:** Yes — Bearer access token

**Role:** Any authenticated role

**Request Body:** None

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` using the access token from the test USER registration.

## Users

### PATCH /api/v1/users/me
**Description:** Update the authenticated user's profile.

**Authentication:** Yes — Bearer access token

**Role:** Any authenticated role

**Request Body:** At least one of `name`, `phone`, or `avatarUrl` (nullable URL). Only those fields are accepted.

```json
{
  "name": "Test User Updated"
}
```

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` using the test USER access token.

---

### PATCH /api/v1/users/me/password
**Description:** Change the authenticated user's password.

**Authentication:** Yes — Bearer access token

**Role:** Any authenticated role

**Request Body:** `currentPassword`, `newPassword` (8–72 characters; must differ from current password).

```json
{
  "currentPassword": "ExamplePass123!",
  "newPassword": "ExamplePass456!"
}
```

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200`; the local test user's password was changed during this run.

## Barbers

### POST /api/v1/barbers
**Description:** Create a Barber profile for the authenticated user.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** `businessName` (2–100 characters), optional `bio` (up to 500 characters).

```json
{
  "businessName": "Test Barber Shop",
  "bio": "Professional barber."
}
```

**Expected Status:** `201`

**Test:** PASS

**Test Result:** Received HTTP `201` using the access token from the test BARBER registration.

---

### GET /api/v1/barbers/me
**Description:** Return the authenticated Barber's profile.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** None

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` using the test BARBER access token and profile created earlier in this run.

---

### PATCH /api/v1/barbers/me
**Description:** Update the authenticated Barber's profile.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** At least one of `businessName` (2–100 characters) or `bio` (up to 500 characters). Only those fields are accepted.

```json
{
  "businessName": "Test Barber Shop Updated"
}
```

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` using the test BARBER access token.

### GET /api/v1/barbers/me/status
**Description:** Return the authenticated Barber's manual open/closed status.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** None

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` and a default `isOpen: false` value for newly created barber profiles.

### PATCH /api/v1/barbers/me/status
**Description:** Update the authenticated Barber's manual open/closed status.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** `isOpen` (boolean only).

```json
{
  "isOpen": true
}
```

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` and the updated `isOpen` value persisted to the barber profile.

### GET /api/v1/barbers/:barberId/profile
**Description:** Return the public profile for an active Barber profile, including the manual `isOpen` flag and its public location (`null` when none is set). The response intentionally excludes private user/account metadata.

**Authentication:** No

**Role:** None

**Expected Status:** `200` (or `404` for inactive/nonexistent Barber)

**Test:** PASS

**Test Result:** Received HTTP `200` for an active barber; inactive barbers return `404`.

### GET /api/v1/barbers/:barberId
**Description:** Return complete public details for one active Barber, combining profile/status, ordered gallery, active services, working hours, and optional location in one response. The query uses one Prisma relation selection and excludes private User fields.

**Authentication:** No

**Role:** None

**Expected Status:** `200` (or `404` for inactive/nonexistent Barber)

**Response Data:** `id`, `businessName`, `bio`, `isVerified`, `isOpen`, `gallery`, `services`, `workingHours`, and `location`. Gallery is ordered by `sortOrder`; services use the existing `createdAt` then `id` order and include active services only; working hours are ordered by weekday and retain `isActive`. Empty collections are `[]`; absent location is `null`.

### GET /api/v1/barbers
**Description:** Return a paginated list of active barbers for public discovery. The endpoint is intentionally simple and does not include advanced search, location filters, rankings, or booking availability.

**Authentication:** No

**Role:** None

**Query Parameters:** `page` (positive integer, default `1`), `limit` (positive integer up to `50`, default `20`), optional `search` (trimmed case-insensitive partial match against `businessName` and `bio`)

**Example Request:**

```http
GET /api/v1/barbers?search=barber&page=1&limit=10
```

**Example Response:**

```json
{
  "success": true,
  "message": "Barbers retrieved successfully",
  "data": {
    "items": [
      {
        "id": "cl...",
        "businessName": "Joey Barber",
        "bio": "Professional barber",
        "isVerified": true,
        "isOpen": true,
        "location": {
          "latitude": 30.0444,
          "longitude": 31.2357,
          "address": "Cairo, Egypt"
        },
        "primaryImage": {
          "id": "cl...",
          "imageUrl": "https://example.com/image.jpg",
          "altText": "Joey Barber"
        },
        "services": [
          {
            "id": "cl...",
            "name": "Haircut",
            "price": 150,
            "durationMinutes": 30
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 125,
      "totalPages": 13
    }
  }
}
```

**Public Fields:** `id`, `businessName`, `bio`, `isVerified`, `isOpen`, `location`

**Filtering Rules:** Only `isActive = true` barbers are included. When `search` is present, it is trimmed and matched case-insensitively against `businessName` and `bio` using a partial match. Empty or whitespace-only searches behave the same as the default discovery list. There is no requirement for `isVerified = true` in this feature.

**Primary Image Rules:** `images` are filtered to `sortOrder = 0`, limited to one result, and returned as `primaryImage` or `null` when no primary image exists.

**Service Rules:** Only active services are returned, and they include only `id`, `name`, `price`, and `durationMinutes`.

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` for active barber discovery with pagination metadata and public-only data.

## Barber Location

### PUT /api/v1/barbers/me/location
**Description:** Create or update the authenticated Barber's coordinates and optional human-readable address. Ownership is derived from the authenticated user; client-supplied `barberId` fields are rejected.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** Numeric `latitude` (-90 to 90), numeric `longitude` (-180 to 180), optional `address` (up to 500 characters; trimmed; blank becomes `null`).

```json
{
  "latitude": 30.0444,
  "longitude": 31.2357,
  "address": "Cairo, Egypt"
}
```

**Expected Status:** `200`

### GET /api/v1/barbers/me/location
**Description:** Return the authenticated Barber's saved location. Returns `404` if the Barber has not set a location.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Expected Status:** `200` (or `404` when no location exists)

### GET /api/v1/barbers/:barberId/location
**Description:** Return the coordinates and optional address of an active Barber. Inactive or nonexistent Barbers return `404`. Public output contains only `latitude`, `longitude`, and `address`.

**Authentication:** No

**Role:** None

**Expected Status:** `200` (or `404` for inactive/nonexistent Barbers or when no location exists)

Barber discovery and public profile responses also include a `location` object with those same three public fields, or `null` if the active Barber has not set a location. Discovery continues to use its existing pagination and name/bio search only; it does not filter or sort by geographic distance.

## Bookings

Booking working hours are interpreted in the configured IANA timezone from `APP_TIMEZONE` (default `Africa/Cairo`). Request datetimes must include a timezone offset; the API stores and returns the corresponding absolute instant. Booking duration is copied from the active service at creation, and service details are snapshotted so later service edits/deactivation do not change existing bookings. A PostgreSQL GiST exclusion constraint prevents overlapping confirmed intervals for the same barber; the interval is half-open, so adjacent appointments are allowed.

### POST /api/v1/bookings
**Description:** Create a confirmed booking for an active, manually open Barber and an active service belonging to that Barber. The requested interval must be in the future and fit inside an active working-hour interval. `endAt` is calculated by the server from the service duration.

**Authentication:** Yes — Bearer access token

**Role:** `USER`

**Request Body:** `barberId`, `serviceId`, and timezone-aware ISO 8601 `startAt`. Client-supplied `userId` or `endAt` fields are rejected.

**Expected Status:** `201` (or `409` when the selected interval conflicts with an existing confirmed booking)

### GET /api/v1/bookings/me
**Description:** Return bookings belonging to the authenticated customer, ordered by start time ascending.

**Authentication:** Yes — Bearer access token

**Role:** `USER`

**Query Parameters:** `page` (positive integer, default `1`), `limit` (positive integer up to `50`, default `20`)

**Expected Status:** `200`

### GET /api/v1/bookings/:bookingId
**Description:** Return one booking belonging to the authenticated customer, including its service snapshot and public Barber name. Foreign or nonexistent bookings return `404`.

**Authentication:** Yes — Bearer access token

**Role:** `USER`

**Expected Status:** `200` (or `404`)

### GET /api/v1/barbers/me/bookings
**Description:** Return bookings belonging to the authenticated Barber profile, ordered by start time ascending.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Query Parameters:** `page` (positive integer, default `1`), `limit` (positive integer up to `50`, default `20`)

**Expected Status:** `200`

### GET /api/v1/barbers/me/bookings/:bookingId
**Description:** Return a booking for the authenticated Barber profile, including only the customer's public name and avatar fields. Foreign or nonexistent bookings return `404`.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Expected Status:** `200` (or `404`)

## Barber Gallery

Gallery management endpoints require a Bearer access token and the `BARBER` role. The barber profile is resolved from the authenticated user; clients cannot supply a `barberId` for management operations. Each barber may have up to 10 images. Gallery results contain only image fields (`id`, `imageUrl`, `altText`, and `sortOrder`) and are ordered by `sortOrder` ascending.

### POST /api/v1/barbers/me/gallery
**Description:** Add an image to the authenticated Barber's gallery.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** Required `imageUrl` (valid URL), optional `altText`.

```json
{
  "imageUrl": "https://cdn.example.com/barbers/image-1.jpg",
  "altText": "Modern haircut"
}
```

**Expected Status:** `201` (or `409` when the 10-image limit is reached)

### GET /api/v1/barbers/me/gallery
**Description:** Return the authenticated Barber's gallery.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Expected Status:** `200`

### GET /api/v1/barbers/:barberId/gallery
**Description:** Return the public gallery for an active Barber profile. `barberId` is the Barber profile ID, not the User ID. Inactive or nonexistent barber profiles return `404`.

**Authentication:** No

**Role:** None

**Expected Status:** `200` (or `404` for an inactive/nonexistent Barber)

### PATCH /api/v1/barbers/me/gallery/reorder
**Description:** Set the order of all images in the authenticated Barber's gallery. The request must include every owned image ID exactly once; IDs belonging to another Barber are rejected.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** `imageIds`, ordered from first to last.

```json
{
  "imageIds": ["image-c", "image-a", "image-b"]
}
```

**Expected Status:** `200`

### DELETE /api/v1/barbers/me/gallery/:imageId
**Description:** Delete an image owned by the authenticated Barber. A missing or foreign image returns `404`.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Expected Status:** `200` (or `404` when the image is not owned by the Barber)

**Automated tests:** `npm run test:gallery` — PASS (12 tests; covers add, own/public galleries, ordering, deletion, ownership, role/auth restrictions, image limit, inactive profiles, and invalid input).

## Barber Services

### POST /api/v1/barbers/me/services
**Description:** Create a service for the authenticated Barber.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** `name` (2–100 characters), optional `description` (max 500 chars), required `price` (non-negative monetary value with at most 2 decimal places), required `durationMinutes` (5–480 minutes).

```json
{
  "name": "Classic Haircut",
  "description": "Classic men's haircut",
  "price": 150,
  "durationMinutes": 30
}
```

**Expected Status:** `201`

**Response:** `id`, `barberId`, `name`, `description`, `price`, `durationMinutes`, `isActive`, `createdAt`, `updatedAt`

**Important errors:** `401` if unauthenticated, `403` if not `BARBER`, `400` for validation failures, `404` if the Barber profile is missing.

**Automated tests:** `npx tsx --test src/tests/service.test.ts` — PASS (9 tests; covers create, validation, auth, ownership, public filtering, update, delete/deactivation, and reactivation).

### GET /api/v1/barbers/me/services
**Description:** Return the authenticated Barber's services in deterministic order.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Expected Status:** `200`

**Response:** Array of the current Barber's services.

**Important errors:** `401` if unauthenticated, `403` if not `BARBER`, `404` if the Barber profile is missing.

### GET /api/v1/barbers/:barberId/services
**Description:** Return public services for an active Barber. Only active services are included.

**Authentication:** No

**Role:** None

**Parameters:** `barberId` — the Barber profile ID.

**Expected Status:** `200` or `404` when the Barber does not exist or is inactive.

**Response:** Only the public fields: `id`, `name`, `description`, `price`, `durationMinutes`.

**Important errors:** `404` for inactive or missing Barbers; no private User information is exposed.

### PATCH /api/v1/barbers/me/services/:serviceId
**Description:** Update one of the authenticated Barber's services.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Parameters:** `serviceId` — the owned service ID.

**Request Body:** Any subset of `name`, `description`, `price`, `durationMinutes`, or `isActive`; the request must not be empty and may not include `id`, `barberId`, `createdAt`, or `updatedAt`.

```json
{
  "name": "Premium Cut",
  "price": 220,
  "isActive": true
}
```

**Expected Status:** `200`

**Important errors:** `400` for empty or invalid payloads, `404` when the service is not owned by the authenticated Barber.

### DELETE /api/v1/barbers/me/services/:serviceId
**Description:** Deactivate a service instead of deleting it permanently. This preserves booking compatibility for future historical snapshots.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Parameters:** `serviceId` — the owned service ID.

**Expected Status:** `200`

**Response:** `success: true`, `message: "Service deactivated successfully"`, `data: null`

**Important errors:** `401` for missing/invalid token, `403` for non-Barber users, `404` when the service is not owned by the Barber.

## Barber Working Hours

Weekday convention for the weekly schedule is explicit: `0 = Sunday`, `1 = Monday`, `2 = Tuesday`, `3 = Wednesday`, `4 = Thursday`, `5 = Friday`, `6 = Saturday`.

The MVP intentionally does not support overnight shifts such as `22:00 -> 02:00`; a schedule must remain within the same calendar day. This prevents ambiguity before the booking engine is introduced.

### POST /api/v1/barbers/me/working-hours
**Description:** Create a working-hour record for the authenticated Barber for one weekday.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Request Body:** `dayOfWeek` (`0`-`6`), `openTime` (`HH:mm`), `closeTime` (`HH:mm`), optional `isActive` (`true` by default). `openTime` must be earlier than `closeTime` and overnight windows are not allowed in MVP.

```json
{
  "dayOfWeek": 6,
  "openTime": "10:00",
  "closeTime": "22:00"
}
```

**Expected Status:** `201`

**Response:** `id`, `barberId`, `dayOfWeek`, `openTime`, `closeTime`, `isActive`, `createdAt`, `updatedAt`

**Important errors:** `401` if unauthenticated, `403` if the caller is not a `BARBER`, `409` when the same Barber already has a record for that weekday, `400` for invalid time or day values.

**Automated tests:** `npx tsx --test src/tests/working-hours.test.ts` — PASS (9 tests covering create, duplicates, validation, auth, ownership, public schedule, update, and deactivation).

### GET /api/v1/barbers/me/working-hours
**Description:** Return the authenticated Barber's schedule ordered by `dayOfWeek` ascending.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Expected Status:** `200`

**Response:** Array of the current Barber's working-hour records.

**Important errors:** `401` for missing/invalid auth, `403` for non-Barber users, `404` if the Barber profile is missing.

### GET /api/v1/barbers/:barberId/working-hours
**Description:** Return the public schedule for an active Barber.

**Authentication:** No

**Role:** None

**Parameters:** `barberId` — Barber profile ID.

**Expected Status:** `200` or `404` when the Barber is inactive or missing.

**Response:** `dayOfWeek`, `openTime`, `closeTime`, `isActive` only.

**Important errors:** `404` if the Barber profile is not found or is inactive; no private user data is exposed.

### PATCH /api/v1/barbers/me/working-hours/:workingHourId
**Description:** Update an owned working-hour record. Optional fields are `dayOfWeek`, `openTime`, `closeTime`, and `isActive`.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Parameters:** `workingHourId` — owned working-hour ID.

**Request Body example:**

```json
{
  "openTime": "11:00",
  "closeTime": "19:00"
}
```

**Expected Status:** `200`

**Important errors:** `400` for invalid range or malformed time, `404` if the record is not owned by the authenticated Barber, `409` if the new weekday collides with another record for the same Barber.

### DELETE /api/v1/barbers/me/working-hours/:workingHourId
**Description:** Deactivate a working-hour record instead of deleting it permanently.

**Authentication:** Yes — Bearer access token

**Role:** `BARBER`

**Parameters:** `workingHourId` — owned working-hour ID.

**Expected Status:** `200`

**Response:** `success: true`, `message: "Working hour deactivated successfully"`, `data: null`

**Important errors:** `401` for missing/invalid auth, `403` for non-Barber users, `404` when the record is not owned by the Barber.

## System

### GET /api/v1/health
**Description:** Report that the API is running.

**Authentication:** No

**Role:** None

**Request Body:** None

**Expected Status:** `200`

**Test:** PASS

**Test Result:** Received HTTP `200` with the API health response.

## Summary

The following totals refer only to the original 10 endpoints in the manual smoke-test run above; they do not include the separately automated Gallery coverage.

Total Endpoints: 10

Passed: 10
Failed: 0
Blocked: 0

| Method | Endpoint | Auth | Role | Test |
|---|---|---|---|---|
| POST | /api/v1/auth/register | No | None (`USER` assigned) | PASS |
| POST | /api/v1/auth/register/barber | No | None (`BARBER` assigned) | PASS |
| POST | /api/v1/auth/login | No | None | PASS |
| GET | /api/v1/auth/me | Yes | Any authenticated role | PASS |
| PATCH | /api/v1/users/me | Yes | Any authenticated role | PASS |
| PATCH | /api/v1/users/me/password | Yes | Any authenticated role | PASS |
| POST | /api/v1/barbers | Yes | `BARBER` | PASS |
| GET | /api/v1/barbers/me | Yes | `BARBER` | PASS |
| PATCH | /api/v1/barbers/me | Yes | `BARBER` | PASS |
| GET | /api/v1/health | No | None | PASS |

**Test data note:** The API was confirmed to run with `NODE_ENV=development`. This run created two local test accounts (USER and BARBER) and one Barber profile, updated the test user's name/password and the test Barber profile, and did not run against production data. The generated credentials/tokens were not added to this document.
