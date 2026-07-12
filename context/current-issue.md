I checked context/05-api-spec.md: GET /institutions and POST /institutions are marked super-admin only, but the data model currently has no super-admin role. Granting these permissions to admin means any institutional admin will pass requirePermission(PERMISSIONS.INSTITUTION_LIST/CREATE) once those routes are mounted, widening access to global institution management instead of failing closed until a proper system role exists.

For ownership resolvers that query the database, this catch turns every thrown error — including connection failures, malformed queries, or other unexpected service bugs — into a 404 Resource not found. Only a deliberate null result should mean not found; unexpected resolver exceptions should be passed to the error handler or returned as 500 so operational failures are not hidden as missing resources.

In `@server/middleware/rbac.ts` around lines 93 - 100, Update the catch blocks in
both requireOwnership and requireSameInstitution so exceptions from
resolveOwnerId are treated as unexpected server failures rather than converted
to 404 responses. Preserve the existing 404 handling for a resolver result of
null, while propagating or passing resolver exceptions to the application’s
standard 5xx error handling and retaining appropriate error logging.

In `@tests/integration/rbac.test.ts` around lines 50 - 102, Add a probe route in
createTestApp using requireAuth and requireSameInstitution with an institutionId
route parameter, then extend the integration tests with a second seeded
institution/user. Assert that an authenticated user can access a matching
institution and receives the expected forbidden response for a different
institution, while preserving coverage of the guard’s existing
unauthenticated/not-found behavior where applicable.
