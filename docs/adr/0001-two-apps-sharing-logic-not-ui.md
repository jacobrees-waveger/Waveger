# Two apps in a monorepo, sharing logic but not UI

Waveger ships a Next.js web app and an Expo native app at equal priority. We
build them as two apps in one monorepo that share domain types, scoring rules,
the chart-source client and design tokens — but **not** UI components. Screens
are written twice, once per platform.

## Considered options

1. **One universal codebase** (Expo Router + React Native Web, web as a build
   target). Rejected: Expo Router's web output is build-time only. There is no
   incremental revalidation and no request-time rendering outside an alpha
   flag, so every chart update would require rebuilding the whole site. Public
   chart pages are the acquisition channel and cannot ride on `unstable_` APIs.
2. **Two apps sharing UI too**, via a cross-platform component layer. Rejected:
   Solito is stalled and its App Router support requires opting out of React
   Server Components; react-native-web has had no release in ten months.

## Consequences

The known failure mode of this choice is **drift** — mobile falling behind web
until it stops shipping. Mitigate by keeping shared packages genuinely shared:
anything in `packages/` must import nothing from `next/*`, `expo-*`, or
`react-native`.

Revisit when Expo Router's server output leaves alpha and RSC-payload-to-HTML
lands. Sharing logic and tokens strictly is what keeps that migration cheap.
