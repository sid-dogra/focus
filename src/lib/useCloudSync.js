import { useCallback, useEffect, useRef, useState } from 'react';
import { retryCloudSync } from './firestore';
import { deriveSyncStatus, syncErrorMessage, watchSyncRecovery } from './sync';

export default function useCloudSync({ userId, tasksReady, settingsReady, taskMeta, settingsMeta, localPending }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [listenerVersion, setListenerVersion] = useState(0);
  const inFlight = useRef(null);
  const lastCheck = useRef(0);
  const activeUser = useRef(null);
  const latest = useRef({});

  const status = deriveSyncStatus({
    online, checking, error, ready: tasksReady && settingsReady,
    taskMeta, settingsMeta, localPending,
  });
  latest.current = { status, error };

  const reportError = useCallback((nextError) => setError(nextError), []);

  const checkConnection = useCallback((manual = false) => {
    if (inFlight.current) return inFlight.current;
    if (!manual && Date.now() - lastCheck.current < 5000) return Promise.resolve(false);
    lastCheck.current = Date.now();
    const session = activeUser.current;
    if (!session) return Promise.resolve(false);
    setOnline(navigator.onLine);
    setChecking(true);
    setError(null);
    // A failed snapshot listener stops permanently; recreate it when retrying.
    if (latest.current.error) setListenerVersion(version => version + 1);
    const operation = retryCloudSync(userId).then(() => {
      if (activeUser.current === session) {
        setOnline(true);
        setError(null);
      }
      return true;
    }, (nextError) => {
      if (activeUser.current === session) setError(nextError);
      return false;
    }).finally(() => {
      if (activeUser.current === session) setChecking(false);
      if (inFlight.current === operation) inFlight.current = null;
    });
    inFlight.current = operation;
    return operation;
  }, [userId]);

  useEffect(() => {
    const session = {};
    activeUser.current = session;
    lastCheck.current = 0;
    inFlight.current = null;
    setError(null);
    const stop = watchSyncRecovery({
      browserWindow: window,
      browserDocument: document,
      reconnect: () => { void checkConnection(); },
      onOffline: () => setOnline(false),
      shouldRetry: () => latest.current.status !== 'synced',
    });
    void checkConnection();
    return () => {
      stop();
      if (activeUser.current === session) activeUser.current = null;
    };
  }, [checkConnection]);

  useEffect(() => {
    if (tasksReady && settingsReady && !taskMeta.fromCache && !settingsMeta.fromCache) {
      setOnline(true);
      setError(null);
    }
  }, [tasksReady, settingsReady, taskMeta, settingsMeta]);

  return {
    status, online, checking, listenerVersion, reportError,
    errorMessage: error ? syncErrorMessage(error) : '',
    retry: () => checkConnection(true),
  };
}
