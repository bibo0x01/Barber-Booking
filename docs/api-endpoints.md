# API Endpoints

Base URL used for testing: `http://127.0.0.1:3000/api/v1` (local development server).

All tests below were run as one happy-path HTTP request per endpoint. No automated test framework or test script is configured in `package.json`, so these were manual HTTP smoke tests. Test credentials and bearer tokens were generated/used only during the run and are not recorded here.

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
