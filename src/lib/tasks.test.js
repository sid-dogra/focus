import { describe, expect, it } from 'vitest';
import {
  formatDateTimeLocal,
  normalizeTask,
  selectLegacyTasksToImport,
  taskForFirestore,
  timestampToMillis,
} from './tasks';

const task = (overrides = {}) => ({
  id: 'task-1',
  title: 'Read cases',
  category: 'research',
  effort: 'medium',
  importance: 2,
  status: 'todo',
  createdAt: '2026-09-07T12:00:00.000Z',
  updatedAt: 100,
  ...overrides,
});

describe('task normalization', () => {
  it('preserves null schedule fields instead of converting them to midnight', () => {
    const normalized = normalizeTask(task({ scheduledStart: null, scheduledEnd: null }));
    expect(normalized.scheduledStart).toBeNull();
    expect(normalized.scheduledEnd).toBeNull();
  });

  it('clamps legacy priority values to the current three-level UI', () => {
    expect(normalizeTask(task({ importance: 5 })).importance).toBe(3);
    expect(normalizeTask(task({ importance: -4 })).importance).toBe(1);
  });

  it('uses a server timestamp when available', () => {
    const timestamp = { toMillis: () => 300 };
    expect(normalizeTask(task({ updatedAt: 100, updatedAtServer: timestamp })).updatedAt).toBe(300);
    expect(timestampToMillis(timestamp)).toBe(300);
  });

  it('adds the active query flag for Firestore', () => {
    expect(taskForFirestore(task()).active).toBe(true);
    expect(taskForFirestore(task({ status: 'done' })).active).toBe(false);
    expect(taskForFirestore(task({ deleted: true })).active).toBe(false);
  });
});

describe('legacy migration selection', () => {
  it('imports missing tasks and newer legacy versions without downgrading cloud tasks', () => {
    const cloud = [task({ id: 'same-newer-cloud', updatedAt: 500 }), task({ id: 'older-cloud', updatedAt: 100 })];
    const legacy = [
      task({ id: 'missing', updatedAt: 50 }),
      task({ id: 'same-newer-cloud', updatedAt: 400 }),
      task({ id: 'older-cloud', updatedAt: 200 }),
    ];
    expect(selectLegacyTasksToImport(legacy, cloud).map(item => item.id)).toEqual(['missing', 'older-cloud']);
  });

  it('rejects malformed task records', () => {
    expect(selectLegacyTasksToImport([{ id: '', title: '' }], [])).toEqual([]);
  });

  it('does not resurrect a task protected by a newer deletion marker', () => {
    const cloudTombstone = task({ id: 'deleted-task', deleted: true, updatedAt: 500 });
    const staleDeviceCopy = task({ id: 'deleted-task', updatedAt: 100 });
    expect(selectLegacyTasksToImport([staleDeviceCopy], [cloudTombstone])).toEqual([]);
  });
});

describe('deadline formatting', () => {
  it('formats the wall-clock time instead of slicing a UTC string', () => {
    const localDate = new Date(2026, 8, 7, 15, 30);
    expect(formatDateTimeLocal(localDate.toISOString())).toBe('2026-09-07T15:30');
  });
});
