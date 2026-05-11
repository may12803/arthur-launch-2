'use client';

import { useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: Handle submission
    console.log('Submitted:', inputValue);
    setInputValue('');
  };

  return (
    <div className="w-full max-w-3xl px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-medium text-text-active">Good morning, Daniel.</h1>
        <p className="text-text-muted">What can I help you with today?</p>
      </div>
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Ask me anything, or type a command..."
          className="w-full pl-6 pr-14 py-4 bg-glass-bg border border-glass-border rounded-full text-text-active placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-orange/50 transition-shadow"
        />
        <button
          type="submit"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 bg-accent-orange rounded-full text-white hover:bg-opacity-80 disabled:bg-opacity-50 transition-colors"
          disabled={!inputValue.trim()}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
