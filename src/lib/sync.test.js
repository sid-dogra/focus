import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveSyncStatus, syncErrorMessage, watchSyncRecovery, withSyncTimeout } from './sync';

const confirmed = { fromCache: false, hasPendingWrites: false };
const cached = { fromCache: true, hasPendingWrites: false };
const state = (overrides = {}) => ({
  online: true, checking: false, error: null, ready: true,
  taskMeta: confirmed, settingsMeta: confirmed, ...overrides,
});

afterEach(() => vi.useRealTimers());

describe('cloud confirmation', () => {
  it('never reports cached data as synced, even with no queued writes', () => {
    expect(deriveSyncStatus(state({ taskMeta: cached, settingsMeta: cached }))).toBe('connecting');
    expect(deriveSyncStatus(state({ settingsMeta: cached }))).toBe('connecting');
    expect(deriveSyncStatus(state({ taskMeta: cached }))).toBe('connecting');
  });

  it('accepts confirmed server snapshots over a stale browser offline flag', () => {
    expect(deriveSyncStatus(state({ online: false }))).toBe('synced');
    expect(deriveSyncStatus(state({ online: false, taskMeta: cached }))).toBe('offline');
  });

  it('does not show synced while task or debounced settings edits await confirmation', () => {
    expect(deriveSyncStatus(state({ taskMeta: { ...confirmed, hasPendingWrites: true } }))).toBe('pending');
    // A completion may remove the final task from the active query before its
    // write is acknowledged, leaving that query with no pending documents.
    expect(deriveSyncStatus(state({ localPending: true }))).toBe('pending');
  });

  it('distinguishes cloud connectivity failures from denied access', () => {
    expect(deriveSyncStatus(state({ error: { code: 'unavailable' } }))).toBe('disconnected');
    expect(deriveSyncStatus(state({ online: false, error: { code: 'deadline-exceeded' } }))).toBe('offline');
    expect(deriveSyncStatus(state({ error: { code: 'permission-denied' } }))).toBe('error');
    expect(syncErrorMessage({ code: 'permission-denied' })).toContain('denied');
  });
});

describe('bounded connection checks', () => {
  it('ends a stalled check without treating it as a successful sync', async () => {
    vi.useFakeTimers();
    const check = withSyncTimeout(() => new Promise(() => {}), 100);
    const assertion = expect(check).rejects.toMatchObject({ code: 'deadline-exceeded' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up its timer on a successful check or immediate failure', async () => {
    vi.useFakeTimers();
    await expect(withSyncTimeout(() => 'confirmed')).resolves.toBe('confirmed');
    await expect(withSyncTimeout(() => { throw { code: 'permission-denied' }; })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('phone and browser wake-up', () => {
  it('rechecks on focus, visibility and online events, and only retries in the foreground', () => {
    vi.useFakeTimers();
    const browserWindow = new EventTarget();
    browserWindow.setInterval = setInterval;
    browserWindow.clearInterval = clearInterval;
    const browserDocument = new EventTarget();
    browserDocument.hidden = false;
    const reconnect = vi.fn();
    const onOffline = vi.fn();
    let needsRetry = true;
    const stop = watchSyncRecovery({ browserWindow, browserDocument, reconnect, onOffline, shouldRetry: () => needsRetry });
    browserWindow.dispatchEvent(new Event('focus'));
    browserDocument.dispatchEvent(new Event('visibilitychange'));
    browserWindow.dispatchEvent(new Event('online'));
    expect(reconnect).toHaveBeenCalledTimes(3);
    browserWindow.dispatchEvent(new Event('offline'));
    expect(onOffline).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60000);
    expect(reconnect).toHaveBeenCalledTimes(4);
    browserDocument.hidden = true;
    browserWindow.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(60000);
    expect(reconnect).toHaveBeenCalledTimes(4);
    browserDocument.hidden = false;
    needsRetry = false;
    vi.advanceTimersByTime(60000);
    expect(reconnect).toHaveBeenCalledTimes(4);
    stop();
    browserWindow.dispatchEvent(new Event('focus'));
    browserDocument.dispatchEvent(new Event('visibilitychange'));
    expect(reconnect).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });
});
