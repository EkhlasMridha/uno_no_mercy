import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, MessageCircle, Send, Smile, SmilePlus } from 'lucide-react';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  REACTION_EMOJIS,
  type ChatMessage,
  type ReactionEmoji,
} from '@nomercy/shared';
import type { TableAvatars } from '../lib/avatar';
import { reactToChat, sendChat } from '../net/actions';
import { useAppState } from '../state/store';
import { PlayerAvatar } from './PlayerAvatar';
import { CollapseButton } from './ui/CollapseButton';

// prettier-ignore
const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '😎', '🤔', '😮',
  '😅', '😬', '😭', '😡', '🥳', '😴', '🙃', '😏',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀',
  '🔥', '💥', '🎉', '❤️', '💔', '💀', '😈', '🤯',
  '🃏', '🎲', '🏆', '⭐', '🍀', '🚫', '⚡', '🌈',
];

/** Show the length counter only when the limit is close enough to matter. */
const COUNTER_FROM = CHAT_MESSAGE_MAX_LENGTH - 60;

const timeOf = (m: ChatMessage) =>
  new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A short run of emoji with no words: drawn big, like a sticker, without a bubble. */
const isStickerText = (text: string) => {
  // Variation selectors and joiners only glue emoji together; they are not characters of their own.
  const glyphs = text.replace(/‍|️|\s/g, '');
  return /^\p{Extended_Pictographic}+$/u.test(glyphs) && Array.from(glyphs).length <= 6;
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The room's group chat: the lines, reactions, an emoji picker and the box to type in. It can be
 * minimized to its header; a count of unread lines then shows next to the title.
 */
export function ChatBox({
  meId,
  avatarOf,
  open,
  onToggle,
}: {
  meId: string;
  avatarOf: TableAvatars;
  open: boolean;
  onToggle: () => void;
}) {
  const messages = useAppState((s) => s.chat);
  const players = useAppState((s) => s.room?.players);
  const latestId = messages.at(-1)?.id ?? 0;
  const [seenId, setSeenId] = useState(latestId);
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  // The message whose reaction bar is open.
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  // Newest message id the reader has been scrolled down to; lines past it show in the catch-up pill.
  const [caughtUpId, setCaughtUpId] = useState(latestId);
  const [atEnd, setAtEnd] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nameOf = (id: string) => players?.find((p) => p.id === id)?.name ?? 'Someone';

  useEffect(() => {
    if (open) setSeenId(latestId);
  }, [open, latestId]);

  // Follow new lines while the reader is at the bottom; your own line always brings you there.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !open) return;
    if (atEnd || messages.at(-1)?.senderId === meId) {
      list.scrollTop = list.scrollHeight;
      setCaughtUpId(latestId);
    }
  }, [messages, open, meId, atEnd, latestId]);

  const unread = open ? 0 : messages.filter((m) => m.id > seenId && m.senderId !== meId).length;
  const missed = atEnd
    ? 0
    : messages.filter((m) => m.id > caughtUpId && m.senderId !== meId).length;

  const jumpToLatest = () => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > CHAT_MESSAGE_MAX_LENGTH) return;
    setDraft(next);
    // Put the caret after the emoji once React has written the new value.
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const react = (messageId: number, emoji: ReactionEmoji) => {
    setReactingTo(null);
    void reactToChat(messageId, emoji);
  };

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    setShowEmoji(false);
    const result = await sendChat(text);
    setSending(false);
    // Hand the text back if it didn't go through, unless they've already started something new.
    if (!result.ok) setDraft((current) => current || text);
    inputRef.current?.focus();
  };

  return (
    <section
      aria-label="Group chat"
      className={`flex min-h-0 flex-col ${open ? 'flex-1 basis-0' : 'shrink-0'}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
        <h3 className="flex items-center gap-2 px-1 text-sm font-semibold text-chalk">
          <MessageCircle size={16} className="text-brass" /> Group chat
          {unread > 0 && (
            <span
              className="rounded-full bg-brass px-1.5 text-xs font-bold text-felt-950"
              aria-label={`${unread} unread`}
            >
              {unread}
            </span>
          )}
        </h3>
        <CollapseButton open={open} label="group chat" onToggle={onToggle} />
      </div>

      {open && (
        <>
          <div className="relative flex min-h-0 flex-1">
            <ol
              ref={listRef}
              role="log"
              aria-label="Chat messages"
              aria-live="polite"
              onScroll={(e) => {
                const el = e.currentTarget;
                const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                setAtEnd(nearEnd);
                if (nearEnd) setCaughtUpId(latestId);
              }}
              className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto py-2 pr-1 text-sm"
            >
              {messages.length === 0 && (
                <li className="px-1 py-2 text-chalk/50">
                  No messages yet. Say hello, or send an emoji.
                </li>
              )}
              {messages.map((m, i) => {
                const mine = m.senderId === meId;
                const startsRun = messages[i - 1]?.senderId !== m.senderId;
                const sticker = isStickerText(m.text);
                const chips = REACTION_EMOJIS.filter((e) => (m.reactions[e]?.length ?? 0) > 0);
                return (
                  <li
                    key={m.id}
                    className={`group flex gap-2 ${startsRun ? 'mt-2' : ''} ${mine ? 'justify-end' : ''}`}
                  >
                    {!mine &&
                      (startsRun ? (
                        <PlayerAvatar
                          traits={avatarOf(m.senderId)}
                          className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                        />
                      ) : (
                        <span aria-hidden className="w-7 shrink-0" />
                      ))}
                    <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? 'items-end' : ''}`}>
                      {startsRun && !mine && (
                        <span className="px-1 text-xs font-semibold text-chalk/60">
                          {m.senderName}
                        </span>
                      )}
                      <div className={`flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                        <span
                          title={timeOf(m)}
                          className={
                            sticker
                              ? 'break-words text-4xl leading-tight'
                              : `break-words rounded-2xl px-3 py-1.5 leading-snug ring-1 ${
                                  mine
                                    ? 'bg-brass/15 text-chalk ring-brass/30'
                                    : 'bg-chalk/[0.06] text-chalk ring-white/10'
                                }`
                          }
                        >
                          {m.text}
                        </span>
                        <button
                          type="button"
                          aria-label={`React to ${mine ? 'your message' : `${m.senderName}'s message`}`}
                          aria-expanded={reactingTo === m.id}
                          onClick={() => setReactingTo((id) => (id === m.id ? null : m.id))}
                          className={`shrink-0 rounded-full p-1 text-chalk/60 transition hover:bg-white/10 hover:text-chalk focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white group-hover:opacity-100 [@media(hover:none)]:opacity-70 ${
                            reactingTo === m.id ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          <SmilePlus size={15} />
                        </button>
                      </div>
                      {reactingTo === m.id && (
                        <div
                          role="group"
                          aria-label="Pick a reaction"
                          className="my-1 flex gap-0.5 rounded-full bg-felt-950/85 p-1 ring-1 ring-white/15"
                        >
                          {REACTION_EMOJIS.map((emoji) => {
                            const chosen = m.reactions[emoji]?.includes(meId) ?? false;
                            return (
                              <button
                                key={emoji}
                                type="button"
                                aria-pressed={chosen}
                                aria-label={emoji}
                                onClick={() => react(m.id, emoji)}
                                className={`rounded-full px-1.5 py-0.5 text-xl leading-none transition hover:scale-110 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                                  chosen ? 'bg-brass/20 ring-1 ring-brass' : ''
                                }`}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {chips.length > 0 && (
                        <div className={`mt-0.5 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
                          {chips.map((emoji) => (
                            <ReactionChip
                              key={emoji}
                              emoji={emoji}
                              ids={m.reactions[emoji] ?? []}
                              meId={meId}
                              nameOf={nameOf}
                              onToggle={() => react(m.id, emoji)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {missed > 0 && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="pill absolute bottom-2 left-1/2 -translate-x-1/2 gap-1.5 py-1 text-xs font-semibold text-brass hover:bg-felt-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <ArrowDown size={13} />
                {missed === 1 ? '1 new message' : `${missed} new messages`}
              </button>
            )}
          </div>

          {showEmoji && (
            <div
              role="group"
              aria-label="Emoji"
              className="scroll-thin mb-2 grid max-h-36 grid-cols-8 gap-0.5 overflow-y-auto rounded-xl bg-felt-950/70 p-1.5 ring-1 ring-white/10"
            >
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Insert ${emoji}`}
                  onClick={() => insertEmoji(emoji)}
                  className="rounded-md py-1 text-2xl leading-none transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {draft.length >= COUNTER_FROM && (
            <p
              className={`mb-1 pr-1 text-right text-xs ${
                draft.length >= CHAT_MESSAGE_MAX_LENGTH - 10 ? 'text-rose-300' : 'text-chalk/50'
              }`}
            >
              {CHAT_MESSAGE_MAX_LENGTH - draft.length} characters left
            </p>
          )}

          <form className="flex items-center gap-1.5" onSubmit={(e) => void onSend(e)}>
            <button
              type="button"
              aria-label="Emoji"
              aria-expanded={showEmoji}
              onClick={() => setShowEmoji((v) => !v)}
              className={`shrink-0 rounded-xl p-2 ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                showEmoji
                  ? 'bg-brass/15 text-brass ring-brass'
                  : 'text-chalk/70 ring-white/15 hover:bg-white/10 hover:text-chalk'
              }`}
            >
              <Smile size={18} />
            </button>
            <input
              ref={inputRef}
              className="input min-w-0 px-3 py-2 text-sm"
              value={draft}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              autoComplete="off"
              placeholder="Message the room"
              aria-label="Message"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim() || sending}
              className="btn-primary shrink-0 px-3 py-2"
            >
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

/** One reaction under a message: the emoji and how many chose it. Gold when it includes you. */
function ReactionChip({
  emoji,
  ids,
  meId,
  nameOf,
  onToggle,
}: {
  emoji: string;
  ids: string[];
  meId: string;
  nameOf: (id: string) => string;
  onToggle: () => void;
}) {
  const mine = ids.includes(meId);
  // The count bumps when it changes, not when the chip first appears with the history.
  const [bumps, setBumps] = useState(0);
  const previous = useRef(ids.length);
  useEffect(() => {
    if (previous.current !== ids.length) setBumps((n) => n + 1);
    previous.current = ids.length;
  }, [ids.length]);

  return (
    <button
      type="button"
      aria-pressed={mine}
      aria-label={`${emoji} ${ids.length}: ${ids.map(nameOf).join(', ')}`}
      title={ids.map((id) => (id === meId ? 'You' : nameOf(id))).join(', ')}
      onClick={onToggle}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
        mine
          ? 'bg-brass/20 text-brass ring-brass'
          : 'bg-chalk/[0.06] text-chalk/80 ring-white/15 hover:bg-white/10'
      }`}
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span key={bumps} className={`font-semibold ${bumps > 0 ? 'anim-bump' : ''}`}>
        {ids.length}
      </span>
    </button>
  );
}
