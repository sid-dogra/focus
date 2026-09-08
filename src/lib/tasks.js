const DEFAULT_EFFORT = 'medium';
const DEFAULT_CATEGORY = 'research';

export function timestampToMillis(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

export function normalizeTask(raw, id = raw?.id) {
  const now = Date.now();
  const createdAt = typeof raw?.createdAt === 'string'
    ? raw.createdAt
    : new Date(timestampToMillis(raw?.createdAt, now)).toISOString();
  const updatedAt = timestampToMillis(
    raw?.updatedAtServer,
    timestampToMillis(raw?.updatedAt, Date.parse(createdAt) || now),
  );

  return {
    id: String(id || raw?.id || ''),
    title: String(raw?.title || '').trim(),
    notes: String(raw?.notes || ''),
    category: raw?.category || DEFAULT_CATEGORY,
    effort: raw?.effort || DEFAULT_EFFORT,
    importance: Math.max(1, Math.min(3, Number(raw?.importance) || 2)),
    customMinutes: Number.isFinite(Number(raw?.customMinutes)) && Number(raw.customMinutes) > 0
      ? Number(raw.customMinutes)
      : null,
    deadline: raw?.deadline || null,
    link: raw?.link || null,
    assignedDate: raw?.assignedDate || null,
    scheduledStart: raw?.scheduledStart != null && Number.isFinite(Number(raw.scheduledStart))
      ? Number(raw.scheduledStart)
      : null,
    scheduledEnd: raw?.scheduledEnd != null && Number.isFinite(Number(raw.scheduledEnd))
      ? Number(raw.scheduledEnd)
      : null,
    scheduledDate: raw?.scheduledDate || null,
    gcalEventId: raw?.gcalEventId || null,
    status: raw?.status === 'done' ? 'done' : 'todo',
    deleted: raw?.deleted === true,
    deletedAt: timestampToMillis(raw?.deletedAt, 0) || null,
    createdAt,
    updatedAt,
  };
}

export function taskForFirestore(task) {
  const normalized = normalizeTask(task);
  const { id: _id, ...data } = normalized;
  return {
    ...data,
    active: normalized.status !== 'done' && !normalized.deleted,
    schemaVersion: 1,
  };
}

export function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function selectLegacyTasksToImport(legacyTasks, cloudTasks) {
  const cloudById = new Map((cloudTasks || []).map((task) => [task.id, normalizeTask(task)]));
  return (legacyTasks || [])
    .map((task) => normalizeTask(task))
    .filter((task) => {
      if (!task.id || !task.title) return false;
      const cloud = cloudById.get(task.id);
      return !cloud || task.updatedAt > cloud.updatedAt;
    });
}
