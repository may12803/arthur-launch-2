import { ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[calc(100vh-var(--nav-height)*2)]">
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-active tracking-tighter leading-tight">
        Chief of Staff for the <br /> Multi-Domain Operator
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-text-muted">
        An AI that compounds value across your entire life—from your business operations to your personal goals. Arthur is wired into your tools, learns from your actions, and executes complex tasks autonomously.
      </p>
      <div className="mt-8">
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-base font-medium rounded-full text-white bg-accent-orange hover:bg-opacity-80 transition-colors"
        >
          Enter Dashboard
          <ArrowRight className="ml-2 h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
