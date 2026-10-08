import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  enableNetwork: vi.fn(), getDocFromServer: vi.fn(), getDocsFromServer: vi.fn(),
  waitForPendingWrites: vi.fn(),
}));
vi.mock('./firebase', () => ({ db: 'test-db' }));
vi.mock('firebase/firestore', () => ({
  ...sdk,
  collection: (_db, ...parts) => parts.join('/'),
  doc: (_db, ...parts) => parts.join('/'),
  query: (collection, ...filters) => ({ collection, filters }),
  where: (...args) => args,
  limit: count => ({ limit: count }),
  onSnapshot: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), writeBatch: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  sdk.enableNetwork.mockResolvedValue();
  sdk.getDocFromServer.mockResolvedValue({ exists: () => true });
  sdk.getDocsFromServer.mockResolvedValue({ docs: [] });
  sdk.waitForPendingWrites.mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe('cloud retry', () => {
  it('checks both server paths even when there are no pending writes', async () => {
    const { retryCloudSync } = await import('./firestore');
    await retryCloudSync('owner-uid');
    expect(sdk.enableNetwork).toHaveBeenCalledWith('test-db');
    expect(sdk.getDocFromServer).toHaveBeenCalledWith('users/owner-uid/settings/app');
    expect(sdk.getDocsFromServer).toHaveBeenCalledWith({
      collection: 'users/owner-uid/tasks', filters: [['active', '==', true], { limit: 1 }],
    });
    expect(sdk.waitForPendingWrites).toHaveBeenCalledWith('test-db');
  });

  it('surfaces permission failures instead of reporting synced from the local cache', async () => {
    sdk.getDocsFromServer.mockRejectedValue({ code: 'permission-denied' });
    const { retryCloudSync } = await import('./firestore');
    await expect(retryCloudSync('owner-uid')).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('does not finish until queued task writes are acknowledged', async () => {
    let acknowledge;
    sdk.waitForPendingWrites.mockReturnValue(new Promise(resolve => { acknowledge = resolve; }));
    const { retryCloudSync } = await import('./firestore');
    let finished = false;
    const check = retryCloudSync('owner-uid').then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(finished).toBe(false);
    acknowledge();
    await check;
    expect(finished).toBe(true);
  });

  it('bounds repeated stalled retries without discarding or duplicating the write queue wait', async () => {
    vi.useFakeTimers();
    sdk.waitForPendingWrites.mockReturnValue(new Promise(() => {}));
    const { retryCloudSync } = await import('./firestore');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const assertion = expect(retryCloudSync('owner-uid')).rejects.toMatchObject({ code: 'deadline-exceeded' });
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
    }
    expect(sdk.waitForPendingWrites).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
