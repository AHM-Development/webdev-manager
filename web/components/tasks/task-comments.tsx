"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  createTaskComment,
  deleteTaskComment,
  listTaskComments,
  type TaskComment,
} from "@/libs/api/tasks";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

type MentionUser = { id: string; name: string };

const MENTION_TOKEN = /@\[([^\]]+)\]\((\d+)\)/g;

/** Render a comment body, turning @[Name](id) tokens into highlighted mentions. */
function renderBody(body: string) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_TOKEN.lastIndex = 0;
  let key = 0;
  while ((match = MENTION_TOKEN.exec(body)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={key++}>{body.slice(lastIndex, match.index)}</Fragment>
      );
    }
    nodes.push(
      <span
        key={key++}
        className="rounded bg-[#e8f5ff] px-1 font-medium text-[#0b62b6]"
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    nodes.push(<Fragment key={key++}>{body.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** A comment/reply input with @-mention autocomplete over registered users. */
function CommentComposer({
  users,
  onSubmit,
  placeholder,
  submitLabel = "Comment",
  autoFocus = false,
}: {
  users: MentionUser[];
  onSubmit: (body: string) => Promise<void>;
  placeholder: string;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(
    null
  );
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return users
      .filter((user) => user.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, users]);

  const detectMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\w.-]*)$/);
    if (!m) {
      setMention(null);
      return;
    }
    setMention({ query: m[1], start: caret - m[1].length - 1 });
    setHighlight(0);
  };

  const pick = (user: MentionUser) => {
    if (!mention) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const token = `@[${user.name}](${user.id}) `;
    const next = value.slice(0, mention.start) + token + value.slice(caret);
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + token.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const body = value.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(body);
      setValue("");
      setMention(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      {mention && matches.length > 0 && (
        <ul className="absolute bottom-full z-20 mb-1 max-h-52 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(user);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  index === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8f5ff] text-[10px] font-semibold text-[#0b62b6]">
                  {initials(user.name)}
                </span>
                <span className="truncate">{user.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          rows={2}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            detectMention(event.target.value, event.target.selectionStart ?? 0);
          }}
          onKeyDown={(event) => {
            if (mention && matches.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((h) => (h + 1) % matches.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((h) => (h - 1 + matches.length) % matches.length);
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                pick(matches[highlight]);
                return;
              }
              if (event.key === "Escape") {
                setMention(null);
                return;
              }
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-[52px] w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !value.trim()}
          aria-label={submitLabel}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0b7de3] px-3 text-sm font-medium text-white hover:bg-[#0961ad] disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {submitLabel}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Type @ to mention someone · ⌘/Ctrl+Enter to send
      </p>
    </div>
  );
}

function CommentView({
  comment,
  users,
  currentUserId,
  onReply,
  onDelete,
}: {
  comment: TaskComment;
  users: MentionUser[];
  currentUserId?: string;
  onReply: (parentId: string, body: string) => Promise<void>;
  onDelete: (comment: TaskComment) => void;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const canDelete = !!currentUserId && comment.author.id === currentUserId;

  return (
    <div className="space-y-2">
      <div className="flex gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f5ff] text-[11px] font-semibold text-[#0b62b6]">
          {initials(comment.author.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {comment.author.name}
            </span>
            <span className="text-[11px] text-slate-400">
              {timeAgo(comment.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
            {renderBody(comment.body)}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Reply
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {(comment.replies.length > 0 || replying) && (
        <div className="ml-9 space-y-3 border-l border-slate-100 pl-3">
          {comment.replies.map((reply) => (
            <CommentView
              key={reply.id}
              comment={reply}
              users={users}
              currentUserId={currentUserId}
              onReply={onReply}
              onDelete={onDelete}
              isReply
            />
          ))}
          {replying && (
            <CommentComposer
              users={users}
              placeholder={`Reply to ${comment.author.name}...`}
              submitLabel="Reply"
              autoFocus
              onSubmit={async (body) => {
                await onReply(comment.id, body);
                setReplying(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function TaskComments({
  taskId,
  users,
}: {
  taskId: string;
  users: MentionUser[];
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listTaskComments(taskId)
      .then((data) => {
        if (active) setComments(data);
      })
      .catch(() => {
        if (active) setComments([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  const total = useMemo(
    () => comments.reduce((sum, c) => sum + 1 + c.replies.length, 0),
    [comments]
  );

  const add = async (body: string, parentId?: string) => {
    try {
      const created = await createTaskComment(taskId, { body, parentId });
      setComments((current) => {
        if (!created.parentId) return [...current, created];
        return current.map((root) =>
          root.id === created.parentId
            ? { ...root, replies: [...root.replies, created] }
            : root
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't post comment.";
      notify.error("Couldn't post comment", { description: message });
      throw err;
    }
  };

  const remove = async (comment: TaskComment) => {
    try {
      await deleteTaskComment(taskId, comment.id);
      setComments((current) =>
        current
          .filter((c) => c.id !== comment.id)
          .map((c) => ({
            ...c,
            replies: c.replies.filter((r) => r.id !== comment.id),
          }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't delete comment.";
      notify.error("Couldn't delete comment", { description: message });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-800">
        Comments{total > 0 ? ` (${total})` : ""}
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-400">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentView
              key={comment.id}
              comment={comment}
              users={users}
              currentUserId={user?.id}
              onReply={(parentId, body) => add(body, parentId)}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      <CommentComposer
        users={users}
        placeholder="Write a comment… use @ to mention someone"
        onSubmit={(body) => add(body)}
      />
    </div>
  );
}
