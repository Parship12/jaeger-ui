// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import {
  TextMessageContentEventSchema,
  type AssistantMessage,
  type TextMessageContentEvent,
  type UserMessage,
} from '@ag-ui/core';
import { Input } from 'antd';
import { Button } from 'antd';
import * as React from 'react';
import { IoClose } from 'react-icons/io5';

import { getJaegerCopilotRuntimeUrl } from './copilot-runtime';
import { useJaegerAssistant } from './JaegerAssistantContext';

import './JaegerAssistantPanel.css';

type TChatMessage = UserMessage | AssistantMessage;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function parseSseChunk(raw: string): TextMessageContentEvent | undefined {
  const dataLines = raw
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim());
  if (!dataLines.length) {
    return undefined;
  }
  const payload = dataLines.join('\n');
  if (!payload || payload === '[DONE]') {
    return undefined;
  }
  try {
    const parsed = TextMessageContentEventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function contentToString(message: TChatMessage): string {
  const { content } = message;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content.map(item => (item.type === 'text' ? item.text : '[binary]')).join('\n');
}

function JaegerAssistantPanelInner(): React.ReactElement {
  const { isOpen, close, pendingMessage, consumePending, bootstrapId } = useJaegerAssistant();
  const runtimeUrl = getJaegerCopilotRuntimeUrl();
  const [messages, setMessages] = React.useState<TChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastHandledBootstrapId = React.useRef<number>(0);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !runtimeUrl || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    const userMessage: UserMessage = {
      id: makeId('user'),
      role: 'user',
      content: trimmed,
    };
    const assistantMessageId = makeId('assistant');
    const assistantMessage: AssistantMessage = { id: assistantMessageId, role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');

    try {
      const history = [...messages, userMessage]
        .map(msg => ({ role: msg.role, content: contentToString(msg).trim() }))
        .filter(msg => msg.content !== '');

      const response = await fetch(runtimeUrl, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed with status ${response.status}`);
      }

      if (!response.body) {
        setIsSending(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const payload = parseSseChunk(event);
          if (!payload) {
            continue;
          }
          if (typeof payload.delta === 'string') {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: `${contentToString(msg)}${payload.delta}` }
                  : msg
              )
            );
          }
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown assistant error';
      setError(detail);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId ? { ...msg, content: `Assistant request failed: ${detail}` } : msg
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  React.useEffect(() => {
    if (!isOpen) {
      lastHandledBootstrapId.current = 0;
      return;
    }
    if (!pendingMessage || bootstrapId === 0 || lastHandledBootstrapId.current === bootstrapId) {
      return;
    }
    lastHandledBootstrapId.current = bootstrapId;
    void sendMessage(pendingMessage)
      .catch(() => {
        lastHandledBootstrapId.current = 0;
      })
      .finally(() => {
        consumePending();
      });
    // sendMessage intentionally omitted from deps to avoid re-sending when local state changes.
    // eslint-disable-next-line react-x/exhaustive-deps
  }, [bootstrapId, consumePending, isOpen, pendingMessage]);

  const onSubmit = () => {
    void sendMessage(input);
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <aside className="JaegerAssistantPanel" data-testid="JaegerAssistantPanel">
      <div className="JaegerAssistantPanel-toolbar">
        <span className="JaegerAssistantPanel-title">Jaeger assistant</span>
        <Button
          type="text"
          className="JaegerAssistantPanel-close"
          icon={<IoClose size={22} />}
          onClick={close}
          aria-label="Close"
        />
      </div>
      <div className="JaegerAssistantPanel-chatWrap">
        <div className="JaegerAssistantPanel-messages" data-testid="JaegerAssistantPanel-messages">
          {messages.length === 0 && (
            <div className="JaegerAssistantPanel-empty">Ask about this trace, spans, or errors.</div>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`JaegerAssistantPanel-message JaegerAssistantPanel-message--${msg.role}`}
            >
              <div className="JaegerAssistantPanel-messageRole">
                {msg.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="JaegerAssistantPanel-messageText">{contentToString(msg)}</div>
            </div>
          ))}
        </div>
        {error && <div className="JaegerAssistantPanel-error">{error}</div>}
        <div className="JaegerAssistantPanel-inputBar">
          <Input.TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Message…"
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={isSending}
            onPressEnter={e => {
              if (!e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <Button type="primary" onClick={onSubmit} disabled={isSending || input.trim() === ''}>
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default function JaegerAssistantPanel(): React.ReactElement | null {
  if (!getJaegerCopilotRuntimeUrl()) {
    return null;
  }
  return <JaegerAssistantPanelInner />;
}
