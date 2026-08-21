import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { incidentsRepository } from '@/db/incidentsRepository';
import { reduce, selectNextUploadable, type OutboxRecord } from '@/features/outbox/outboxMachine';
import { useOutboxStore } from '@/stores/outboxStore';

/**
 * The sync engine.
 *
 * Owns exactly one job: move queued reports to the server, one at a time,
 * oldest first, surviving connectivity loss and app restarts.
 *
 * All decision-making lives in the pure reducer and selector it calls — this
 * file is the imperative shell around them: subscriptions, the drain loop, and
 * persistence. That split is why the queue's behaviour is unit-tested without a
 * device.
 */

export interface Connectivity {
  online: boolean;
  /** True only on Wi-Fi; drives the video deferral setting. */
  wifi: boolean;
}

type Uploader = (record: OutboxRecord) => Promise<void>;

let unsubscribeNet: (() => void) | null = null;
let unsubscribeAppState: (() => void) | null = null;
let draining = false;
let connectivity: Connectivity = { online: false, wifi: false };

/**
 * Translate a NetInfo state into what the queue actually cares about.
 *
 * `isInternetReachable` rather than `isConnected`: a captive-portal Wi-Fi at a
 * hotel or a café reports connected while every request 302s to a login page.
 * Draining against that burns retries and marks healthy reports as failed.
 */
function toConnectivity(state: NetInfoState): Connectivity {
  return {
    online: Boolean(state.isConnected && state.isInternetReachable !== false),
    wifi: state.type === 'wifi',
  };
}

/** Uploader is injected so tests can drive the loop without a network. */
let upload: Uploader = async () => {
  throw new Error('Sync engine started without an uploader');
};

export function configureUploader(uploader: Uploader): void {
  upload = uploader;
}

/**
 * Drain the queue until nothing is eligible.
 *
 * Reentrancy is guarded rather than queued: a second call while a drain is
 * already running would upload the same record twice, because both would read
 * the same `queued` row before either wrote `uploading` back.
 */
export async function drain(): Promise<void> {
  if (draining || !connectivity.online) return;
  draining = true;

  try {
    for (;;) {
      const pending = incidentsRepository.listPending();
      const next = selectNextUploadable(pending, { hasWifi: connectivity.wifi });
      if (!next) break;

      try {
        await upload(next);
      } catch (cause) {
        // The uploader is responsible for recording its own failure via the
        // reducer. Anything reaching here is unexpected, so stop the loop
        // rather than spinning on a record that cannot progress.
        console.error('[sync] drain aborted', cause);
        break;
      }

      useOutboxStore.getState().refresh();
    }
  } finally {
    draining = false;
    useOutboxStore.getState().refresh();
  }
}

/** Move a record through a transition and persist the result. */
export function applyEvent(
  record: OutboxRecord,
  event: Parameters<typeof reduce>[1],
): OutboxRecord {
  const next = reduce(record, event);
  // The reducer returns the same reference for an illegal transition, so an
  // identity check is a free way to skip a pointless write.
  if (next !== record) {
    incidentsRepository.save(next);
    useOutboxStore.getState().refresh();
  }
  return next;
}

/**
 * Start the engine.
 *
 * Safe to call more than once; a second call replaces the subscriptions rather
 * than stacking them.
 */
export function startSyncEngine(): void {
  stopSyncEngine();

  // A report caught mid-upload by a crash is stuck in `uploading` forever,
  // because the drain loop only ever picks up `queued` and due `failed` rows.
  const recovered = incidentsRepository.recoverInterrupted();
  if (recovered > 0) console.warn(`[sync] recovered ${recovered} interrupted upload(s)`);

  unsubscribeNet = NetInfo.addEventListener((state) => {
    const previous = connectivity;
    connectivity = toConnectivity(state);

    // Only act on the rising edge. NetInfo fires repeatedly on a flaky
    // connection, and re-entering drain on each event is wasted work.
    if (!previous.online && connectivity.online) void drain();
    if (!previous.wifi && connectivity.wifi) void drain();
  });

  const appStateSub = AppState.addEventListener('change', (status: AppStateStatus) => {
    // iOS background execution is opportunistic and may never run, so the app
    // also drains whenever it returns to the foreground. This is the guarantee;
    // the background task is the optimisation.
    if (status === 'active') void drain();
  });
  unsubscribeAppState = () => appStateSub.remove();

  void NetInfo.fetch().then((state) => {
    connectivity = toConnectivity(state);
    void drain();
  });
}

export function stopSyncEngine(): void {
  unsubscribeNet?.();
  unsubscribeAppState?.();
  unsubscribeNet = null;
  unsubscribeAppState = null;
}

export function getConnectivity(): Connectivity {
  return connectivity;
}

/** Test seam — lets a suite drive the loop without NetInfo. */
export function __setConnectivityForTest(next: Connectivity): void {
  connectivity = next;
}
