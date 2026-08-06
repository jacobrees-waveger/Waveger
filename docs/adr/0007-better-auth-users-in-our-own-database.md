# Better Auth, with user records in our own database

Authentication uses Better Auth against our own Postgres, serving both the web
app (cookie sessions) and the native app (bearer tokens). Sign-in methods are
email magic link, Sign in with Apple, and Google.

## Why

User records stay in our database rather than a vendor's, which is what keeps
the provider replaceable. Auth.js, the incumbent alternative, now carries a
banner stating it has joined Better Auth and strongly recommends new projects
start with Better Auth instead. Clerk and Supabase Auth both hold the user table
themselves.

Note that offering Google sign-in on iOS obliges us to offer Sign in with Apple
alongside it.

## Consequences

Native sessions use Better Auth's **bearer plugin**, whose own documentation
warns that "improper implementation could easily lead to security
vulnerabilities" and whose example stores the token in `localStorage`. On Expo
the token must go in `expo-secure-store`. This is a sharp edge to implement
carefully, not a turnkey feature.

Players have a public handle distinct from their login identity. Handles appear
on Leaderboards, so they need a blocklist and a report path.
