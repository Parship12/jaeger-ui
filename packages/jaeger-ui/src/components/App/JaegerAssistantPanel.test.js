// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('./copilot-runtime', () => ({
  getJaegerCopilotRuntimeUrl: jest.fn(),
}));

import { getJaegerCopilotRuntimeUrl } from './copilot-runtime';
import JaegerAssistantPanel from './JaegerAssistantPanel';
import { JaegerAssistantProvider, useJaegerAssistant } from './JaegerAssistantContext';

function OpenPanelHarness() {
  const { openWithMessage } = useJaegerAssistant();
  return (
    <div>
      <button type="button" onClick={() => openWithMessage('hi')}>
        open assistant
      </button>
      <JaegerAssistantPanel />
    </div>
  );
}

describe('JaegerAssistantPanel', () => {
  beforeEach(() => {
    getJaegerCopilotRuntimeUrl.mockReset();
    global.ResizeObserver = class ResizeObserver {
      observe() {}

      unobserve() {}

      disconnect() {}
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
      text: jest.fn().mockResolvedValue(''),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders nothing when no Copilot runtime URL is configured', () => {
    getJaegerCopilotRuntimeUrl.mockReturnValue(undefined);
    render(
      <JaegerAssistantProvider>
        <OpenPanelHarness />
      </JaegerAssistantProvider>
    );
    expect(screen.queryByTestId('JaegerAssistantPanel')).not.toBeInTheDocument();
  });

  it('shows the panel when open and runtime URL exists', async () => {
    const user = userEvent.setup();
    getJaegerCopilotRuntimeUrl.mockReturnValue('https://example/runtime');
    render(
      <JaegerAssistantProvider>
        <OpenPanelHarness />
      </JaegerAssistantProvider>
    );
    await user.click(screen.getByRole('button', { name: 'open assistant' }));
    expect(screen.getByTestId('JaegerAssistantPanel')).toBeInTheDocument();
    expect(screen.getByText('Jaeger assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message…')).toBeInTheDocument();
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    getJaegerCopilotRuntimeUrl.mockReturnValue('https://example/runtime');
    render(
      <JaegerAssistantProvider>
        <OpenPanelHarness />
      </JaegerAssistantProvider>
    );
    await user.click(screen.getByRole('button', { name: 'open assistant' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('JaegerAssistantPanel')).not.toBeInTheDocument();
  });
});
