import { createClient } from '@/lib/api';
import { describeError } from '@waveger/api-client';
import {
  publishedDate,
  type ChartEntry,
  type ChartExit,
  type ChartMovement,
  type ChartWeek,
} from '@waveger/domain';
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
 * This week's chart, from Position 1 down, with how far each Entry moved and
 * the Songs that left.
 *
 * The same Chart Week the website shows, from the same API — and written
 * separately, because ADR 0001 shares logic and types but never UI. A FlatList
 * rather than a scrolled column, so a hundred Entries scroll the way the
 * platform's own lists do; the exits ride along as its footer rather than in a
 * second list, so the whole week is one scroll.
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
          ListFooterComponent={<Exits exits={state.week.exits} />}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ entry }: { entry: ChartEntry }) {
  const movement = describe(entry.movement);

  return (
    <View style={styles.row}>
      <Text style={styles.position}>{entry.position}</Text>
      <Text style={[styles.movement, { color: movement.colour }]}>
        {movement.label}
      </Text>
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

/**
 * How far an Entry moved, in the width of a couple of characters.
 *
 * The four states are shown as four different things rather than as one number
 * with special cases in it. A debut is a word, because a Song arriving is not a
 * move of some size; unknown is blank, because Waveger holding no previous
 * Chart Week is a fact about Waveger and there is nothing to tell the reader
 * about the Song.
 */
function describe(movement: ChartMovement): { label: string; colour: string } {
  switch (movement.kind) {
    case 'moved':
      return movement.positionsGained > 0
        ? { label: `▲ ${movement.positionsGained}`, colour: '#047857' }
        : { label: `▼ ${-movement.positionsGained}`, colour: '#be123c' };
    case 'non-mover':
      return { label: '–', colour: '#00000066' };
    case 'debut':
      return { label: 'New', colour: '#0369a1' };
    case 'unknown':
      return { label: '', colour: '#00000066' };
  }
}

/**
 * The Songs that left the Chart, named rather than silently missing.
 *
 * Nothing at all when the week has no predecessor to have left: an empty
 * heading would read as "nothing dropped out this week", which is a different
 * claim from "Waveger cannot say".
 */
function Exits({ exits }: { exits: readonly ChartExit[] }) {
  if (exits.length === 0) return null;

  return (
    <View style={styles.exits}>
      <Text style={styles.exitsHeading}>Left the chart</Text>
      {exits.map((exit) => (
        <View key={exit.previousPosition} style={styles.row}>
          <Text style={[styles.position, styles.exitPosition]}>
            {exit.previousPosition}
          </Text>
          {/* An exit has no movement, but it keeps the column so its Song
              lines up with the Songs above it and the two read as one Chart. */}
          <View style={styles.movement} />
          <View style={styles.song}>
            <Text style={styles.exitTitle} numberOfLines={1}>
              {exit.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {exit.artist}
            </Text>
          </View>
        </View>
      ))}
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
  movement: {
    width: 38,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontSize: 12,
  },
  exits: {
    paddingTop: 24,
    paddingBottom: 32,
  },
  exitsHeading: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  exitPosition: {
    textDecorationLine: 'line-through',
    opacity: 0.4,
  },
  exitTitle: {
    fontSize: 15,
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
