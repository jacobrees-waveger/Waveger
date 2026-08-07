import { createClient } from '@/lib/api';
import { describeError } from '@waveger/api-client';
import { publishedDate, type ChartEntry, type ChartWeek } from '@waveger/domain';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * This week's chart, from Position 1 down.
 *
 * The same Chart Week the website shows, from the same API — and written
 * separately, because ADR 0001 shares logic and types but never UI. A FlatList
 * rather than a scrolled column, so a hundred Entries scroll the way the
 * platform's own lists do.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'held'; week: ChartWeek }
  | { kind: 'empty' }
  | { kind: 'failed'; message: string };

export function Chart() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    createClient()
      .getLatestChartWeek({ signal: controller.signal })
      .then((week) =>
        setState(week === null ? { kind: 'empty' } : { kind: 'held', week }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'failed', message: describeError(error) });
      });

    return () => controller.abort();
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Waveger</Text>
        <Text style={styles.subtitle}>
          {state.kind === 'held'
            ? `${state.week.chart.name}, ${publishedDate(state.week.date)}`
            : 'The UK Official Singles Chart.'}
        </Text>
      </View>

      {state.kind === 'loading' && <ActivityIndicator style={styles.notice} />}

      {state.kind === 'failed' && (
        <Text style={[styles.notice, styles.error]}>{state.message}</Text>
      )}

      {state.kind === 'empty' && (
        <Text style={[styles.notice, styles.empty]}>
          No Chart Week yet. Waveger shows a Chart Week once it has ingested
          one.
        </Text>
      )}

      {state.kind === 'held' && (
        <FlatList
          data={state.week.entries}
          keyExtractor={(entry) => String(entry.position)}
          renderItem={({ item }) => <Row entry={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ entry }: { entry: ChartEntry }) {
  return (
    <View style={styles.row}>
      <Text style={styles.position}>{entry.position}</Text>
      <View style={styles.song}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {entry.artist}
        </Text>
      </View>
      <Text style={styles.reported}>
        {`Peak ${entry.peakPosition}\n${entry.weeksOnChart} ${
          entry.weeksOnChart === 1 ? 'wk' : 'wks'
        }`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    opacity: 0.6,
  },
  notice: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  error: {
    color: '#b00020',
    fontSize: 14,
  },
  empty: {
    fontSize: 14,
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000018',
  },
  position: {
    width: 30,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    opacity: 0.6,
  },
  song: {
    flex: 1,
    gap: 2,
  },
  songTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  artist: {
    fontSize: 13,
    opacity: 0.6,
  },
  reported: {
    fontSize: 11,
    textAlign: 'right',
    opacity: 0.6,
    fontVariant: ['tabular-nums'],
  },
});
