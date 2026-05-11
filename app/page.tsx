import { ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[calc(100vh-var(--nav-height)*2)] bg-background-base">
      <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-text-primary tracking-tight leading-tighter">
        Your AI Chief of Staff
      </h1>
      <p className="mt-8 max-w-3xl text-xl text-text-secondary">
        Arthur is an AI that compounds value across your entire life, from business operations to personal goals. It's wired into your tools, learns from your actions, and executes complex tasks autonomously.
      </p>
      <div className="mt-12">
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center px-10 py-5 border border-transparent text-lg font-semibold rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-all duration-300 ease-in-out shadow-lg transform hover:scale-105"
        >
          Enter Dashboard
          <ArrowRight className="ml-3 h-6 w-6" />
        </a>
      </div>
    </div>
  );
}
