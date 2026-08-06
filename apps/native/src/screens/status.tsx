import { createClient } from '@/lib/api';
import { ApiError } from '@waveger/api-client';
import type { ApiStatus } from '@waveger/domain';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; status: ApiStatus }
  | { kind: 'failed'; message: string };

export function Status() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    createClient()
      .getStatus({ signal: controller.signal })
      .then((status) => setState({ kind: 'loaded', status }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'failed',
          message:
            error instanceof ApiError
              ? `${error.code}: ${error.message}`
              : String(error),
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Waveger</Text>
      <Text style={styles.subtitle}>
        Fetched from /api/v1/status through the shared client.
      </Text>

      {state.kind === 'loading' && <ActivityIndicator />}

      {state.kind === 'failed' && (
        <Text style={styles.error}>{state.message}</Text>
      )}

      {state.kind === 'loaded' && (
        <View style={styles.rows}>
          <Row
            label="Service"
            value={`${state.status.service} ${state.status.version}`}
          />
          <Row
            label="Database"
            value={`reachable, ${state.status.database.migrations.length} migration(s) applied`}
          />
          {state.status.charts.map((chart) => (
            <Row key={chart.slug} label="Chart" value={chart.name} />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.6,
  },
  rows: {
    gap: 10,
  },
  row: {
    gap: 2,
  },
  label: {
    fontSize: 12,
    opacity: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 15,
  },
  error: {
    color: '#b00020',
    fontSize: 14,
  },
});
