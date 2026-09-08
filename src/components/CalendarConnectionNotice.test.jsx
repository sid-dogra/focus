import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CalendarConnectionNotice from './CalendarConnectionNotice';

const renderNotice = (overrides = {}) => renderToStaticMarkup(
  <CalendarConnectionNotice
    error=""
    hasClientId
    loading={false}
    onConnect={() => {}}
    onOpenSettings={() => {}}
    previouslyConnected
    ready
    {...overrides}
  />,
);

describe('CalendarConnectionNotice', () => {
  it('explains why a previously connected calendar needs reconnection', () => {
    const html = renderNotice();
    expect(html).toContain('Reconnect Google Calendar');
    expect(html).toContain('Calendar access expires between browser sessions');
    expect(html).toContain('Reconnect Calendar');
  });

  it('routes users without a client ID to Settings', () => {
    const html = renderNotice({ hasClientId: false, previouslyConnected: false });
    expect(html).toContain('Add your Google Calendar Client ID in Settings');
    expect(html).toContain('Open Settings');
  });
});
