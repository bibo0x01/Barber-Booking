# API reference and client setup

## OpenAPI / Swagger UI

In development and test environments, start the Express API and open `http://localhost:3000/api-docs`. The raw OpenAPI 3.0.3 document is available at `/api-docs/openapi.json`. The server injects the configured `API_PREFIX` into the document's server URL (default `/api/v1`). Swagger UI is not mounted when `NODE_ENV=production`.

The static contract is [openapi.json](openapi.json). It covers the registered HTTP routes and shared error/auth response shapes; operation-level error lists include the statuses established by the controllers and service rules. Some persisted model response shapes are intentionally described more generally where there is no single response serializer shared by all variants. See the source schemas/controllers and automated tests for exact conditional fields.

## Postman

Import [Barber-Booking-API.postman_collection.json](../postman/Barber-Booking-API.postman_collection.json) and [Barber-Booking-Local.postman_environment.json](../postman/Barber-Booking-Local.postman_environment.json). The environment defaults to the local API URL and has blank password placeholders. Login and registration scripts capture JWTs in collection variables; barber/service/booking/device IDs are captured where a response has a stable ID. Clear collection variables after use, do not export a populated collection or environment, and never commit personal credentials or tokens. The checked-in examples contain no real credentials or tokens. The collection calls HTTP endpoints only and contains no database connection or SQL requests.

Suggested sequence:

1. Set distinct disposable USER and BARBER email, phone, and password values; register or log in to capture each JWT automatically.
2. With the BARBER token, create a barber profile, then add services and working hours. Add a gallery image or location as needed. The create-profile request captures `barberId`; service and working-hour requests capture their IDs where relevant.
3. With the USER token, create a favorite or create a booking using the captured barber/service IDs. Booking `startAt` must be a future ISO 8601 timestamp with an offset, fall within an active working-hour interval in the configured application timezone, and not overlap an existing booking.
4. Use response IDs for booking, queue, notification, device-token, and gallery operations. Queue entries are created as part of booking creation; retrieve the barber queue to obtain its queue ID.

Request assertions check for the actual success envelope and HTTP 200/201. Failure scenarios and all schema constraints are documented in the OpenAPI document; the collection is primarily for successful client workflows.

## Contract notes

- Bearer JWT is supplied in `Authorization: Bearer <token>`.
- In production, configure `CORS_ALLOWED_ORIGINS` as a comma-separated exact-origin allowlist for browser clients (for example, `https://app.example.test`). If it is empty, browser origins receive no CORS permission; native Flutter clients and server-to-server calls without an `Origin` header are not blocked by CORS.
- Production startup rejects a `JWT_SECRET` shorter than 32 bytes. Use a cryptographically random secret and keep it out of source control/logs.
- Login, registration, and password-change routes currently have no built-in rate limiter. Before public deployment, choose and configure a shared edge/API-gateway rate limit (including correct client-IP forwarding); a per-process in-memory limiter would not reliably protect a multi-instance deployment.
- Authentication middleware returns 401 for missing, invalid, or expired access tokens; role middleware returns 403 for a disallowed role.
- Zod validation failures return HTTP 400 and `{ "success": false, "message": "Validation failed", "errors": [...] }`. Unknown-key handling follows each actual schema: strict object schemas reject extra fields; auth registration/login schemas are not strict.
- Successful API responses use `success: true` and `data`, generally with a `message`; `/health` has `success` and `message` without `data`.
- `ADMIN` has no general bypass in route guards: routes requiring USER or BARBER reject ADMIN unless a route's middleware explicitly allows it. Current profile and notification routes authenticated without a role restriction permit any authenticated role.
- Resource access is derived from the authenticated identity on `/me` routes. Foreign owned resources are often represented as 404 to avoid disclosing their existence; exact behavior is operation-specific.
- Swagger UI is a development/test aid, not a production diagnostic endpoint.
