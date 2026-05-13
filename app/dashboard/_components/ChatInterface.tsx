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

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/chat/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          console.error('Upload failed:', err);
          continue;
        }

        const data = await response.json() as UploadedFile;
        setUploadedFiles(prev => [...prev, data]);
      }
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: Handle submission with files
    console.log('Submitted:', inputValue, uploadedFiles);
    setInputValue('');
    setUploadedFiles([]);
  };

  const canSubmit = inputValue.trim() || uploadedFiles.length > 0;

  return (
    <div className="w-full max-w-3xl px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-medium text-text-active">Good morning, Daniel.</h1>
        <p className="text-text-muted">What can I help you with today?</p>
      </div>
      
      {uploadedFiles.length > 0 && (
        <div className="mb-4 space-y-2">
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-glass-bg border border-glass-border rounded-lg"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Paperclip className="h-4 w-4 text-text-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-text-active truncate">{file.name}</p>
                  <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="p-1 text-text-muted hover:text-text-active transition-colors flex-shrink-0"
              >
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
            onChange={handleInputChange}
            placeholder="Ask me anything, or type a command..."
            className="w-full pl-6 pr-14 py-4 bg-glass-bg border border-glass-border rounded-full text-text-active placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-orange/50 transition-shadow"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2.5 text-text-muted hover:text-accent-orange disabled:opacity-50 transition-colors"
            title="Attach files"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <button
            type="submit"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 bg-accent-orange rounded-full text-white hover:bg-opacity-80 disabled:bg-opacity-50 transition-colors"
            disabled={!canSubmit || isUploading}
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.json,.csv"
        />
      </form>
    </div>
  );
}
