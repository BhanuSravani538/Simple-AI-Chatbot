import { type FormEvent, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSendChatMessage, type ChatMessage } from '@workspace/api-client-react';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CornerDownLeft,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { useSupabaseAuth } from '@/auth/supabase-auth';

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface PendingSend {
  conversationId: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  userMessageId: string;
  userSaved: boolean;
  assistantMessageId: string;
  reply?: string;
}

const starters = [
  { title: 'Untangle a thought', prompt: 'I have a lot on my mind. Can you help me sort through it?' },
  { title: 'Make a small plan', prompt: 'Help me make a simple plan for the rest of today.' },
  { title: 'Find the right words', prompt: 'Help me write a thoughtful message to someone I care about.' },
];

function messageFromError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/PGRST205|42P01|schema cache|could not find the table/i.test(message)) {
    return 'Chat storage is not set up yet. Run artifacts/simple-ai-chatbot/supabase/schema.sql in the Supabase SQL Editor, then reload.';
  }
  return message || 'Something went wrong. Your message is still here; you can try again.';
}

function BrandMark({ mini = false }: { mini?: boolean }) {
  return (
    <div className={`brand-mark${mini ? ' mini' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function ChatApp() {
  const { client, session } = useSupabaseAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSend = useRef<PendingSend | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [sendError, setSendError] = useState('');

  const sendMessage = useSendChatMessage({
    request: {
      headers: session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    },
  });

  const isBusy = loadingHistory || loadingMessages || sending || sendMessage.isPending;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    if (!client || !session) return;
    let cancelled = false;

    const loadLatest = async () => {
      setLoadingHistory(true);
      setHistoryError('');
      const { data, error } = await client
        .from('conversations')
        .select('id, title, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        setHistoryError(messageFromError(error));
        setLoadingHistory(false);
        return;
      }

      const rows = (data ?? []) as Conversation[];
      setConversations(rows);
      if (rows.length === 0) {
        setActiveConversationId(null);
        setMessages([]);
        setLoadingHistory(false);
        return;
      }

      const latest = rows[0];
      setActiveConversationId(latest.id);
      const result = await client
        .from('messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', latest.id)
        .order('created_at', { ascending: true });

      if (!cancelled) {
        if (result.error) {
          setHistoryError(messageFromError(result.error));
        } else {
          setMessages((result.data ?? []).map((message) => ({
            role: message.role as ChatMessage['role'],
            content: message.content,
          })));
        }
        setLoadingHistory(false);
      }
    };

    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, [client, session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isBusy]);

  const loadConversation = async (conversationId: string) => {
    if (!client || !session || isBusy) return;
    setLoadingMessages(true);
    setHistoryError('');
    setSendError('');
    pendingSend.current = null;
    sendMessage.reset();

    const { data, error } = await client
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      setHistoryError(messageFromError(error));
    } else {
      setActiveConversationId(conversationId);
      setMessages((data ?? []).map((message) => ({
        role: message.role as ChatMessage['role'],
        content: message.content,
      })));
    }
    setLoadingMessages(false);
  };

  const runPendingSend = async (pending: PendingSend) => {
    if (!client || !session) return;
    pendingSend.current = pending;
    setSending(true);
    setSendError('');

    try {
      if (!pending.userSaved) {
        const { error } = await client.from('messages').upsert(
          {
            id: pending.userMessageId,
            conversation_id: pending.conversationId,
            user_id: session.user.id,
            role: 'user',
            content: pending.userMessage.content,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        );
        if (error) throw error;
        pending.userSaved = true;
      }

      if (!pending.reply) {
        const response = await sendMessage.mutateAsync({
          data: { messages: pending.history },
        });
        pending.reply = response.reply;
        setMessages([
          ...pending.history,
          { role: 'assistant', content: response.reply },
        ]);
      }

      const { error } = await client.from('messages').upsert(
        {
          id: pending.assistantMessageId,
          conversation_id: pending.conversationId,
          user_id: session.user.id,
          role: 'assistant',
          content: pending.reply,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) {
        throw new Error(`The reply arrived but could not be saved: ${error.message}`);
      }

      pendingSend.current = null;
      setMessages([
        ...pending.history,
        { role: 'assistant', content: pending.reply },
      ]);
      setConversations((current) => {
        const updated = current.map((conversation) =>
          conversation.id === pending.conversationId
            ? { ...conversation, updated_at: new Date().toISOString() }
            : conversation,
        );
        return updated.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      });
      setSendError('');
    } catch (error) {
      pendingSend.current = pending;
      setSendError(messageFromError(error));
    } finally {
      setSending(false);
    }
  };

  const submit = async (text: string) => {
    const content = text.trim();
    if (!content || !client || !session || isBusy) return;
    setSending(true);
    setSendError('');
    setHistoryError('');

    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const title = content.replace(/\s+/g, ' ').slice(0, 64);
        const { data, error } = await client
          .from('conversations')
          .insert({ user_id: session.user.id, title })
          .select('id, title, updated_at')
          .single();
        if (error) throw error;

        const created = data as Conversation;
        conversationId = created.id;
        setActiveConversationId(created.id);
        setConversations((current) => [created, ...current]);
      }

      const userMessage: ChatMessage = { role: 'user', content };
      const history = [...messages, userMessage];
      const pending: PendingSend = {
        conversationId,
        history,
        userMessage,
        userMessageId: crypto.randomUUID(),
        userSaved: false,
        assistantMessageId: crypto.randomUUID(),
      };

      setMessages(history);
      setDraft('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await runPendingSend(pending);
    } catch (error) {
      setSendError(messageFromError(error));
    } finally {
      setSending(false);
    }
  };

  const retry = () => {
    if (isBusy || !pendingSend.current) return;
    void runPendingSend(pendingSend.current);
  };

  const startNewConversation = () => {
    if (isBusy) return;
    setActiveConversationId(null);
    setMessages([]);
    setDraft('');
    setHistoryError('');
    setSendError('');
    pendingSend.current = null;
    sendMessage.reset();
    textareaRef.current?.focus();
  };

  const signOut = async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setSendError(error.message);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(draft);
  };

  return (
    <main className="chat-app min-h-[100dvh] bg-background text-foreground">
      <aside className="chat-rail">
        <div className="brand-lockup" aria-label="Morrow">
          <BrandMark />
          <span className="brand-name">morrow</span>
        </div>
        <div className="rail-rule" />
        <button
          className="new-chat-button"
          onClick={startNewConversation}
          disabled={isBusy}
          data-testid="button-new-chat"
        >
          <Plus size={17} strokeWidth={1.8} />
          <span>New conversation</span>
        </button>

        <nav className="conversation-nav" aria-label="Saved conversations">
          <span className="conversation-nav-label">YOUR CONVERSATIONS</span>
          {loadingHistory ? (
            <span className="conversation-nav-empty">Loading saved chats…</span>
          ) : conversations.length === 0 ? (
            <span className="conversation-nav-empty">Your saved chats will appear here.</span>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-link${activeConversationId === conversation.id ? ' is-active' : ''}`}
                onClick={() => void loadConversation(conversation.id)}
                disabled={isBusy}
                title={conversation.title}
              >
                <span>{conversation.title}</span>
              </button>
            ))
          )}
        </nav>

        <div className="rail-note">
          <span className="rail-note-label">A little room to think</span>
          <p>Bring a question, a half-formed thought, or just see where a conversation goes.</p>
        </div>
        <div className="rail-footer account-footer">
          <div className="presence-mark"><span /></div>
          <span className="account-email" title={session?.user.email ?? ''}>
            {session?.user.email ?? 'Signed in'}
          </span>
          <button className="signout-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="conversation-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <BrandMark />
            <span className="brand-name">morrow</span>
          </div>
          <div className="conversation-label">
            <span className="conversation-kicker">YOUR SPACE</span>
            <span className="conversation-title">
              {activeConversationId
                ? conversations.find((conversation) => conversation.id === activeConversationId)?.title ?? 'Conversation'
                : 'A fresh page'}
            </span>
            <select
              className="mobile-history-select"
              aria-label="Open a saved conversation"
              value={activeConversationId ?? ''}
              onChange={(event) => {
                if (event.target.value) void loadConversation(event.target.value);
                else startNewConversation();
              }}
              disabled={isBusy}
            >
              <option value="">New conversation</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
              ))}
            </select>
          </div>
          <div className="topbar-actions">
            <span className="privacy-note"><span className="privacy-dot" /> Chat with Gemini</span>
            <button className="mobile-signout" onClick={() => void signOut()}>Sign out</button>
            {messages.length > 0 && (
              <button
                className="icon-button clear-button"
                onClick={startNewConversation}
                disabled={isBusy}
                aria-label="Start a new conversation"
                data-testid="button-clear-chat"
              >
                <RotateCcw size={16} />
                <span>Start over</span>
              </button>
            )}
          </div>
        </header>

        <div className={`chat-content ${isEmpty ? 'is-empty' : 'has-messages'}`} ref={scrollRef}>
          {isLoadingMessages ? (
            <div className="history-loading" role="status">Opening your conversation…</div>
          ) : isEmpty ? (
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
                    onClick={() => void submit(starter.prompt)}
                    disabled={isBusy}
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
                <article
                  className={`message-row ${message.role === 'user' ? 'from-user' : 'from-assistant'} message-enter`}
                  key={`${index}-${message.role}`}
                  data-testid={`message-${message.role}-${index}`}
                >
                  {message.role === 'assistant' && (
                    <div className="assistant-stamp"><BrandMark mini /></div>
                  )}
                  <div className="message-body">
                    {message.role === 'assistant' && <span className="speaker-label">MORROW</span>}
                    <p>{message.content}</p>
                  </div>
                  {message.role === 'user' && <span className="user-mark">YOU</span>}
                </article>
              ))}
              {isBusy && (
                <div className="message-row from-assistant pending-row" role="status" aria-label="Morrow is thinking" data-testid="status-pending">
                  <div className="assistant-stamp"><BrandMark mini /></div>
                  <div className="thinking-card">
                    <span className="thinking-label">GATHERING A THOUGHT</span>
                    <span className="typing-dots"><i className="typing-dot" /><i className="typing-dot" /><i className="typing-dot" /></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {(historyError || sendError) && (
            <div className="error-card message-enter" role="alert" data-testid="status-send-error">
              <div className="error-icon"><CircleAlert size={17} /></div>
              <div className="error-copy">
                <strong>{historyError ? 'Couldn’t open saved conversations' : 'Couldn’t finish that message'}</strong>
                <p>{historyError || sendError}</p>
              </div>
              {pendingSend.current && (
                <button className="retry-button" onClick={retry} disabled={isBusy} data-testid="button-retry">
                  <RotateCcw size={14} /> Try again
                </button>
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
                  void submit(draft);
                }
              }}
              placeholder="Tell me what’s on your mind..."
              rows={1}
              disabled={isBusy}
              aria-label="Write a message"
              data-testid="input-message"
            />
            <div className="composer-bottom">
              <span className="composer-hint"><CornerDownLeft size={13} /> <span>to send</span><span className="hint-divider">·</span><span>shift + enter for a new line</span></span>
              <button className="send-button" type="submit" disabled={!draft.trim() || isBusy} aria-label="Send message" data-testid="button-send">
                {isBusy ? <span className="send-pulse"><i /><i /><i /></span> : <ArrowUp size={18} strokeWidth={2.3} />}
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
        <button onClick={startNewConversation} disabled={isBusy} aria-label="New conversation" data-testid="button-mobile-new-chat">
          {isEmpty ? <Plus size={18} /> : <X size={17} />}
        </button>
      </div>
    </main>
  );
}

export function ChatAppWithProviders() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ErrorBoundary>
        <ChatApp />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
