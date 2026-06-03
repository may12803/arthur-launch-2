'use client';

import { useState, useRef } from 'react';
import { ArrowUp, Paperclip, X } from 'lucide-react';

interface UploadedFile {
  url: string;
  signedUrl: string;
  mime: string;
  name: string;
  size: number;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, Daniel.';
  if (h < 17) return 'Good afternoon, Daniel.';
  return 'Good evening, Daniel.';
}

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/chat/upload', { method: 'POST', body: formData });
        if (!response.ok) { console.error('Upload failed:', await response.json()); continue; }
        const data = await response.json() as UploadedFile;
        setUploadedFiles(prev => [...prev, data]);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: wire to /api/chat
    setInputValue('');
    setUploadedFiles([]);
  };

  const canSubmit = inputValue.trim().length > 0 || uploadedFiles.length > 0;

  return (
    <div className="w-full max-w-3xl px-4">
      <div className="text-center mb-8">
        <h1 className="font-medium text-text-active" style={{ fontFamily: 'var(--font-lora, Lora, Georgia, serif)', fontSize: 26, letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: 6 }}>
          {greeting()}
        </h1>
        <p className="text-text-muted" style={{ fontSize: 14 }}>What can I help you with today?</p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mb-4 space-y-2">
          {uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-glass-bg border border-glass-border rounded-lg">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Paperclip className="h-4 w-4 text-text-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-text-active truncate">{file.name}</p>
                  <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button type="button" onClick={() => removeFile(index)} className="p-1 text-text-muted hover:text-text-active transition-colors flex-shrink-0" aria-label={`Remove ${file.name}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Ask me anything, or type a command..."
            className="w-full pl-6 pr-14 py-4 bg-glass-bg border border-glass-border rounded-full text-text-active placeholder:text-text-muted focus:outline-none transition-shadow"
            style={{ boxShadow: 'none' }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(11,80,79,0.20)'; e.currentTarget.style.borderColor = 'rgba(11,80,79,0.35)'; }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = ''; }}
            aria-label="Ask Arthur anything"
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2.5 text-text-muted hover:text-accent-orange disabled:opacity-50 transition-colors" title="Attach files" aria-label="Attach files">
            <Paperclip className="h-5 w-5" />
          </button>
          <button type="submit" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 bg-accent-orange rounded-full hover:opacity-80 disabled:opacity-40 transition-opacity" style={{ color: 'var(--accent-text-on)' }} disabled={!canSubmit || isUploading} aria-label="Send message">
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.json,.csv" />
      </form>
    </div>
  );
}
