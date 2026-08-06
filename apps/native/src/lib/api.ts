import { createApiClient, type ApiClient } from '@waveger/api-client';
import Constants from 'expo-constants';

/**
 * Where this build looks for the API.
 *
 * A deployed build is told outright with `EXPO_PUBLIC_API_URL`. In development
 * the fallback derives the host from the Metro server the app was loaded from,
 * so a phone on the same network reaches the dev machine rather than its own
 * localhost. `EXPO_PUBLIC_API_PORT` covers worktrees, where `orca.yaml` moves
 * the web app off port 3000.
 */
export function apiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    const port = process.env.EXPO_PUBLIC_API_PORT ?? '3000';
    return `http://${host}:${port}`;
  }

  throw new Error(
    'Set EXPO_PUBLIC_API_URL in apps/native/.env.local — see .env.example.',
  );
}

export function createClient(): ApiClient {
  return createApiClient({ baseUrl: apiBaseUrl() });
}
