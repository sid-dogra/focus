import React from 'react';

export default function CalendarConnectionNotice({
  error,
  hasClientId,
  loading,
  onConnect,
  onOpenSettings,
  previouslyConnected,
  ready,
}) {
  return (
    <section className="mb-4 flex flex-col gap-3 rounded-xl border border-violet-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center" aria-label="Google Calendar connection">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-base" aria-hidden="true">📅</div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {previouslyConnected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-gray-500">
            {hasClientId
              ? 'Your tasks are synced. Calendar access expires between browser sessions, so reconnect to load your events.'
              : 'Your tasks are synced. Add your Google Calendar Client ID in Settings to load calendar events.'}
          </p>
          {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={hasClientId ? onConnect : onOpenSettings}
        disabled={hasClientId && (!ready || loading)}
        className="min-h-10 shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
      >
        {!hasClientId
          ? 'Open Settings'
          : loading
            ? 'Connecting…'
            : !ready
              ? 'Loading Calendar…'
              : previouslyConnected ? 'Reconnect Calendar' : 'Connect Calendar'}
      </button>
    </section>
  );
}
