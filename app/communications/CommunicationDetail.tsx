import { CommRow } from './CommunicationsList';

export default function CommunicationDetail({ comm }: { comm: CommRow }) {
  return (
    <div className="p-6 h-full flex flex-col">
      <div className="pb-4 border-b border-glass-border mb-4">
        <h2 className="text-xl font-semibold text-text-active">{comm.subject || 'Communication'}</h2>
        <div className="flex items-center text-sm text-text-muted mt-1">
          <span>From: {comm.from_address}</span>
          <span className="mx-2">|</span>
          <span>To: {comm.to_address}</span>
        </div>
        <span className="text-xs text-text-muted">{new Date(comm.ts).toLocaleString()}</span>
      </div>
      <div className="flex-grow prose prose-invert max-w-none">
        <p>{comm.body}</p>
      </div>
    </div>
  );
}
