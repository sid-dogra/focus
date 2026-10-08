import {
  collection,
  doc,
  enableNetwork,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  normalizeTask,
  selectLegacyTasksToImport,
  taskForFirestore,
} from './tasks';
import { withSyncTimeout } from './sync';

const tasksCollection = (userId) => collection(db, 'users', userId, 'tasks');
const taskDocument = (userId, taskId) => doc(db, 'users', userId, 'tasks', taskId);
const settingsDocument = (userId) => doc(db, 'users', userId, 'settings', 'app');

export function subscribeToTasks(userId, onTasks, onError) {
  const activeTasks = query(tasksCollection(userId), where('active', '==', true));
  return onSnapshot(activeTasks, { includeMetadataChanges: true }, (snapshot) => {
    const tasks = snapshot.docs
      .map((taskSnapshot) => normalizeTask(
        taskSnapshot.data({ serverTimestamps: 'estimate' }),
        taskSnapshot.id,
      ))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    onTasks(tasks, {
      fromCache: snapshot.metadata.fromCache,
      hasPendingWrites: snapshot.metadata.hasPendingWrites,
    });
  }, onError);
}

export function subscribeToSettings(userId, onSettings, onError) {
  return onSnapshot(settingsDocument(userId), { includeMetadataChanges: true }, (snapshot) => {
    onSettings(snapshot.exists() ? snapshot.data({ serverTimestamps: 'estimate' }) : null, {
      fromCache: snapshot.metadata.fromCache,
      hasPendingWrites: snapshot.metadata.hasPendingWrites,
    });
  }, onError);
}

export async function createTaskDocument(userId, task) {
  const reference = taskDocument(userId, task.id);
  await setDoc(reference, {
    ...taskForFirestore(task),
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  });
}

export async function updateTaskDocument(userId, taskId, updates) {
  const payload = {
    ...updates,
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp(),
  };
  if (Object.hasOwn(updates, 'status')) payload.active = updates.status !== 'done';
  await setDoc(taskDocument(userId, taskId), payload, { merge: true });
}

export function deleteTaskDocument(userId, taskId) {
  const deletedAt = Date.now();
  return setDoc(taskDocument(userId, taskId), {
    active: false,
    deleted: true,
    deletedAt,
    updatedAt: deletedAt,
    updatedAtServer: serverTimestamp(),
  }, { merge: true });
}

export function updateSettingsDocument(userId, settings) {
  return setDoc(settingsDocument(userId), {
    ...settings,
    schemaVersion: 1,
    updatedAtServer: serverTimestamp(),
  }, { merge: true });
}

let pendingWritesCheck;

export function retryCloudSync(userId) {
  return withSyncTimeout(async () => {
    await enableNetwork(db);
    // Reuse an outstanding wait across retries; timeouts do not discard queued writes.
    if (!pendingWritesCheck) {
      const pending = waitForPendingWrites(db);
      pendingWritesCheck = pending;
      const reset = () => { if (pendingWritesCheck === pending) pendingWritesCheck = null; };
      pending.then(reset, reset);
    }
    await Promise.all([
      getDocsFromServer(query(tasksCollection(userId), where('active', '==', true), limit(1))),
      getDocFromServer(settingsDocument(userId)),
      pendingWritesCheck,
    ]);
  });
}

export async function importLegacyTasks(userId, legacyTasks) {
  // Migration must compare against the server so an offline, stale device
  // cannot overwrite a newer cloud edit or deletion marker.
  const cloudSnapshot = await getDocsFromServer(tasksCollection(userId));
  const cloudTasks = cloudSnapshot.docs.map((taskSnapshot) => normalizeTask(
    taskSnapshot.data({ serverTimestamps: 'estimate' }),
    taskSnapshot.id,
  ));
  const tasksToImport = selectLegacyTasksToImport(legacyTasks, cloudTasks);

  for (let offset = 0; offset < tasksToImport.length; offset += 450) {
    const batch = writeBatch(db);
    tasksToImport.slice(offset, offset + 450).forEach((task) => {
      batch.set(taskDocument(userId, task.id), {
        ...taskForFirestore(task),
        migratedFromLegacy: true,
        updatedAtServer: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }

  return {
    imported: tasksToImport.length,
    skipped: Math.max(0, (legacyTasks || []).length - tasksToImport.length),
  };
}

export async function getAllTaskDocuments(userId) {
  // A partial IndexedDB cache is not a safe backup source.
  const snapshot = await getDocsFromServer(tasksCollection(userId));
  return snapshot.docs
    .map((taskSnapshot) => normalizeTask(
      taskSnapshot.data({ serverTimestamps: 'estimate' }),
      taskSnapshot.id,
    ))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
