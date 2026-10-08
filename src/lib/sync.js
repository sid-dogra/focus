export function deriveSyncStatus({ online, checking, error, ready, taskMeta, settingsMeta, localPending = false }) {
  if (checking) return 'connecting';
  if (error) {
    if (['unavailable', 'deadline-exceeded'].includes(error.code)) {
      return online ? 'disconnected' : 'offline';
    }
    return 'error';
  }
  // Server snapshots are stronger evidence than the browser's connectivity hint.
  const serverConfirmed = ready && !taskMeta.fromCache && !settingsMeta.fromCache;
  if (!online && !serverConfirmed) return 'offline';
  if (!ready) return 'connecting';
  if (taskMeta.hasPendingWrites || settingsMeta.hasPendingWrites || localPending) return 'pending';
  return serverConfirmed ? 'synced' : 'connecting';
}

export function syncErrorMessage(error) {
  if (error?.code === 'permission-denied') return 'Cloud access was denied. Check your signed-in account and Firestore rules.';
  if (error?.code === 'unauthenticated') return 'Your sign-in needs refreshing. Reconnect to try again.';
  if (error?.code === 'resource-exhausted') return 'Cloud sync reached its usage limit. Your changes are still saved on this device.';
  if (['unavailable', 'deadline-exceeded'].includes(error?.code)) {
    return 'Could not confirm cloud sync. Changes stay on this device until the connection recovers. Check Wi-Fi, VPN, or content blockers, then retry.';
  }
  return 'Cloud sync failed. Your changes are still saved on this device. Try reconnecting.';
}

export function withSyncTimeout(operation, timeoutMs = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Cloud sync timed out'), { code: 'deadline-exceeded' })), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(operation), timeout]).finally(() => clearTimeout(timer));
}

export function watchSyncRecovery({ browserWindow, browserDocument, reconnect, onOffline, shouldRetry }) {
  const onResume = () => {
    if (!browserDocument.hidden) reconnect();
  };
  browserWindow.addEventListener('online', onResume);
  browserWindow.addEventListener('offline', onOffline);
  browserWindow.addEventListener('focus', onResume);
  browserDocument.addEventListener('visibilitychange', onResume);
  // A blocked connection may recover without a browser online event.
  const timer = browserWindow.setInterval(() => {
    if (!browserDocument.hidden && shouldRetry()) reconnect();
  }, 60000);
  return () => {
    browserWindow.removeEventListener('online', onResume);
    browserWindow.removeEventListener('offline', onOffline);
    browserWindow.removeEventListener('focus', onResume);
    browserDocument.removeEventListener('visibilitychange', onResume);
    browserWindow.clearInterval(timer);
  };
}
