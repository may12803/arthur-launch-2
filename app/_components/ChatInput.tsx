'use client';

import { useRef, useState, useCallback, useEffect, DragEvent, ClipboardEvent, KeyboardEvent, ChangeEvent } from 'react';
import { Paperclip, X, Send, Mic, FileText, Image as ImageIcon } from 'lucide-react';

export interface PendingAttachment {
  file: File;
  previewUrl?: string; // for images
  id: string;
}

interface ChatInputProps {
  onSend: (text: string, attachments: PendingAttachment[]) => void;
  disabled?: boolean;
  onVoiceClick?: () => void;
  voiceActive?: boolean;
  placeholder?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

let idCounter = 0;
function nextId() {
  return `att-${Date.now()}-${idCounter++}`;
}

export function ChatInput({
  onSend,
  disabled = false,
  onVoiceClick,
  voiceActive,
  placeholder = 'Ask Arthur anything…',
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [text]);

  const addFiles = useCallback((files: File[]) => {
    const newAtts: PendingAttachment[] = files.map(file => {
      const att: PendingAttachment = { file, id: nextId() };
      if (file.type.startsWith('image/')) {
        att.previewUrl = URL.createObjectURL(file);
      }
      return att;
    });
    setAttachments(prev => [...prev, ...newAtts]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  // Drag-and-drop
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  // Cmd-V paste image
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map(item => item.getAsFile()).filter((f): f is File => f !== null);
      addFiles(files);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    // Reset input so same file can be re-attached
    e.target.value = '';
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 16px 16px',
        borderTop: '1px solid var(--glass-border)',
        background: 'var(--glass-bg-faint)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        transition: 'background 150ms',
        ...(dragging ? { background: 'var(--accent-orange-soft)', borderTopColor: 'var(--accent-orange)' } : {}),
      }}
    >
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '4px 0',
          }}
        >
          {attachments.map(att => (
            <AttachmentChip
              key={att.id}
              att={att}
              onRemove={() => removeAttachment(att.id)}
            />
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          background: 'var(--glass-bg-tier2)',
          border: '1px solid var(--glass-border-tier2)',
          borderRadius: '16px',
          padding: '10px 12px',
          transition: 'border-color 150ms',
        }}
      >
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach file"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            flexShrink: 0,
            opacity: disabled ? 0.4 : 1,
            minWidth: 'unset',
            minHeight: 'unset',
            width: '28px',
            height: '28px',
          }}
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.json,.md"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={dragging ? 'Drop files here…' : placeholder}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '14px',
            lineHeight: '1.5',
            color: 'var(--text-active)',
            padding: '2px 0',
            boxShadow: 'none',
            minHeight: '24px',
            maxHeight: '180px',
            overflowY: 'auto',
          }}
        />

        {/* Voice button */}
        <button
          onClick={onVoiceClick}
          title="Talk to Arthur"
          style={{
            background: voiceActive ? 'var(--accent-orange-soft)' : 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: voiceActive ? 'var(--accent-orange)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            flexShrink: 0,
            transition: 'all 150ms',
            minWidth: 'unset',
            minHeight: 'unset',
            width: '28px',
            height: '28px',
          }}
        >
          <Mic size={16} />
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!hasContent || disabled}
          title="Send (Enter)"
          style={{
            background: hasContent && !disabled ? 'var(--accent-orange)' : 'var(--glass-bg)',
            border: '1px solid ' + (hasContent && !disabled ? 'var(--accent-orange)' : 'var(--glass-border)'),
            padding: '0',
            width: '28px',
            height: '28px',
            cursor: hasContent && !disabled ? 'pointer' : 'default',
            color: hasContent && !disabled ? 'var(--accent-text-on)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            flexShrink: 0,
            transition: 'all 150ms',
            opacity: !hasContent || disabled ? 0.4 : 1,
            minWidth: 'unset',
            minHeight: 'unset',
          }}
        >
          <Send size={14} />
        </button>
      </div>

      {/* Hint line */}
      <div
        style={{
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          letterSpacing: '0.03em',
          opacity: 0.5,
        }}
      >
        Enter to send · Shift+Enter newline · Drag or paste images to attach
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachment chip shown above the input while staged
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentChip({ att, onRemove }: { att: PendingAttachment; onRemove: () => void }) {
  const isImage = att.file.type.startsWith('image/');
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px 4px 6px',
        background: 'var(--glass-bg-tier2)',
        border: '1px solid var(--glass-border-tier2)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--text-main)',
        maxWidth: '200px',
        position: 'relative',
      }}
    >
      {/* Thumbnail or icon */}
      {isImage && att.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={att.previewUrl}
          alt=""
          style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            background: 'var(--glass-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'var(--text-muted)',
          }}
        >
          {isImage ? <ImageIcon size={12} /> : <FileText size={12} />}
        </div>
      )}

      {/* Name + size */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', flex: 1 }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            color: 'var(--text-active)',
          }}
        >
          {att.file.name}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatSize(att.file.size)}</span>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          flexShrink: 0,
          minWidth: 'unset',
          minHeight: 'unset',
          width: '16px',
          height: '16px',
        }}
        title="Remove"
      >
        <X size={11} />
      </button>
    </div>
  );
}
