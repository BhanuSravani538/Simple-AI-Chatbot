import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSendChatMessage } from '@workspace/api-client-react';
import type { ChatMessage } from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, CircleAlert, CornerDownLeft, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

const starters = [
  { title: 'Untangle a thought', prompt: 'I have a lot on my mind. Can you help me sort through it?' },
  { title: 'Make a small plan', prompt: 'Help me make a simple plan for the rest of today.' },
  { title: 'Find the right words', prompt: 'Help me write a thoughtful message to someone I care about.' },
];

function messageFromError(error: unknown) {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') {
    return error.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'The reply did not come through. Your message is still here; you can try again.';
}

function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingConversation = useRef<ChatMessage[] | null>(null);
  const sendMessage = useSendChatMessage();
  const isEmpty = messages.length === 0;
  const isPending = sendMessage.isPending;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isPending]);

  const submit = (text: string) => {
    const content = text.trim();
    if (!content || isPending) return;
    const next = [...messages, { role: 'user' as const, content }];
    pendingConversation.current = next;
    setMessages(next);
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendMessage.mutate(
      { data: { messages: next } },
      {
        onSuccess: ({ reply }) => {
          pendingConversation.current = null;
          setMessages((current) => [...current, { role: 'assistant', content: reply }]);
        },
      },
    );
  };

  const retry = () => {
    const payload = pendingConversation.current;
    if (!payload || isPending) return;
    sendMessage.mutate(
      { data: { messages: payload } },
      {
        onSuccess: ({ reply }) => {
          pendingConversation.current = null;
          setMessages((current) => [...current, { role: 'assistant', content: reply }]);
        },
      },
    );
  };

  const clearChat = () => {
    if (isPending) return;
    setMessages([]);
    setDraft('');
    pendingConversation.current = null;
    sendMessage.reset();
    textareaRef.current?.focus();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(draft);
  };

  return (
    <main className="chat-app min-h-[100dvh] bg-background text-foreground">
      <aside className="chat-rail">
        <div className="brand-lockup" aria-label="Morrow">
          <div className="brand-mark"><span /><span /><span /></div>
          <span className="brand-name">morrow</span>
        </div>
        <div className="rail-rule" />
        <button className="new-chat-button" onClick={clearChat} disabled={isPending} data-testid="button-new-chat">
          <Plus size={17} strokeWidth={1.8} />
          <span>New conversation</span>
        </button>
        <div className="rail-note">
          <span className="rail-note-label">A little room to think</span>
          <p>Bring a question, a half-formed thought, or just see where a conversation goes.</p>
        </div>
        <div className="rail-footer">
          <div className="presence-mark"><span /></div>
          <span>Here when you need it</span>
        </div>
      </aside>

      <section className="conversation-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark small"><span /><span /><span /></div>
            <span className="brand-name">morrow</span>
          </div>
          <div className="conversation-label">
            <span className="conversation-kicker">YOUR SPACE</span>
            <span className="conversation-title">{isEmpty ? 'A fresh page' : 'Conversation'}</span>
          </div>
          <div className="topbar-actions">
            <span className="privacy-note"><span className="privacy-dot" /> Chat with Gemini</span>
            {messages.length > 0 && (
              <button className="icon-button clear-button" onClick={clearChat} disabled={isPending} aria-label="Start a new conversation" data-testid="button-clear-chat">
                <RotateCcw size={16} />
                <span>Start over</span>
              </button>
            )}
          </div>
        </header>

        <div className={`chat-content ${isEmpty ? 'is-empty' : 'has-messages'}`} ref={scrollRef}>
          {isEmpty ? (
            <div className="welcome-panel">
              <div className="welcome-eyebrow"><span className="eyebrow-line" /> A thoughtful place to begin <span className="eyebrow-line" /></div>
              <div className="welcome-orbit" aria-hidden="true">
                <div className="orbit-ring ring-one" />
                <div className="orbit-ring ring-two" />
                <div className="orbit-center"><Sparkles size={25} strokeWidth={1.25} /></div>
                <span className="orbit-speck speck-a" />
                <span className="orbit-speck speck-b" />
                <span className="orbit-speck speck-c" />
              </div>
              <h1>What’s on your <em>mind?</em></h1>
              <p className="welcome-copy">A clear head starts with a good conversation.<br className="desktop-break" /> Start anywhere. We’ll find the thread together.</p>
              <div className="starter-list">
                {starters.map((starter, index) => (
                  <button
                    key={starter.title}
                    className="starter-card"
                    onClick={() => submit(starter.prompt)}
                    disabled={isPending}
                    data-testid={`button-starter-${index}`}
                  >
                    <span className="starter-index">0{index + 1}</span>
                    <span className="starter-copy">
                      <strong>{starter.title}</strong>
                      <span>{starter.prompt}</span>
                    </span>
                    <ArrowDown className="starter-arrow" size={15} strokeWidth={1.7} />
                  </button>
                ))}
              </div>
              <div className="welcome-footnote"><span /> No perfect prompt needed</div>
            </div>
          ) : (
            <div className="message-list">
              <div className="thread-start"><span /> WE’RE HERE</div>
              {messages.map((message, index) => (
                <article className={`message-row ${message.role === 'user' ? 'from-user' : 'from-assistant'} message-enter`} key={`${index}-${message.role}`} data-testid={`message-${message.role}-${index}`}>
                  {message.role === 'assistant' && (
                    <div className="assistant-stamp"><div className="brand-mark mini"><span /><span /><span /></div></div>
                  )}
                  <div className="message-body">
                    {message.role === 'assistant' && <span className="speaker-label">MORROW</span>}
                    <p>{message.content}</p>
                  </div>
                  {message.role === 'user' && <span className="user-mark">YOU</span>}
                </article>
              ))}
              {isPending && (
                <div className="message-row from-assistant pending-row" role="status" aria-label="Morrow is thinking" data-testid="status-pending">
                  <div className="assistant-stamp"><div className="brand-mark mini"><span /><span /><span /></div></div>
                  <div className="thinking-card">
                    <span className="thinking-label">GATHERING A THOUGHT</span>
                    <span className="typing-dots"><i className="typing-dot" /><i className="typing-dot" /><i className="typing-dot" /></span>
                  </div>
                </div>
              )}
              {sendMessage.isError && (
                <div className="error-card message-enter" role="alert" data-testid="status-send-error">
                  <div className="error-icon"><CircleAlert size={17} /></div>
                  <div className="error-copy">
                    <strong>Couldn’t reach the conversation</strong>
                    <p>{messageFromError(sendMessage.error)}</p>
                  </div>
                  <button className="retry-button" onClick={retry} disabled={isPending} data-testid="button-retry">
                    <RotateCcw size={14} /> Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="composer-area">
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                event.currentTarget.style.height = 'auto';
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(draft);
                }
              }}
              placeholder="Tell me what’s on your mind..."
              rows={1}
              disabled={isPending}
              aria-label="Write a message"
              data-testid="input-message"
            />
            <div className="composer-bottom">
              <span className="composer-hint"><CornerDownLeft size={13} /> <span>to send</span><span className="hint-divider">·</span><span>shift + enter for a new line</span></span>
              <button className="send-button" type="submit" disabled={!draft.trim() || isPending} aria-label="Send message" data-testid="button-send">
                {isPending ? <span className="send-pulse"><i /><i /><i /></span> : <ArrowUp size={18} strokeWidth={2.3} />}
              </button>
            </div>
          </form>
          <div className="composer-caption">
            <span>Take your time.</span>
            <span className="caption-divider">/</span>
            <span>There’s no wrong way to start.</span>
          </div>
        </footer>
      </section>
      <div className="mobile-new-chat">
        <button onClick={clearChat} disabled={isPending} aria-label="New conversation" data-testid="button-mobile-new-chat">
          {isEmpty ? <Plus size={18} /> : <X size={17} />}
        </button>
      </div>
    </main>
  );
}

function Router() {
  return (
    <RouteBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RouteBoundary>
  );
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
