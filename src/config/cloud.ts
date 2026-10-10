/**
 * Cloud export configuration (presentation-adjacent, never project data).
 *
 * Google OAuth needs a Client ID — there is no login without one, so the app
 * owner creates it ONCE in the Google Cloud Console and pastes it here. Every
 * viewer then just presses Connect: no setup on their side. Anyone hosting
 * their own copy registers their own ID (origins are bound to it) and
 * replaces this value, or overrides it in the dashboard's Cloud section.
 *
 * One-time owner setup:
 * 1. Google Cloud Console → APIs & Services → Credentials → Create
 *    Credentials → OAuth client ID → application type "Web application".
 * 2. Authorized JavaScript origins: the production URL
 *    (https://koosoli.github.io) plus http://localhost:3000 for local use.
 * 3. APIs & Services → Library → enable the Google Drive API.
 * 4. OAuth consent screen → publish the app (Testing mode only allows
 *    registered test users; the public build needs Production). Until
 *    Google verifies the app, sign-in shows an "unverified app" warning —
 *    expected, and Advanced → Continue proceeds.
 */
export const GOOGLE_DRIVE_CLIENT_ID_DEFAULT = '';
