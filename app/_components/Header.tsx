import Link from 'next/link';

export const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-nav-height bg-glass-bg border-b border-glass-border backdrop-blur-lg">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" className="text-nav-logo font-bold text-text-active">
            Arthur
          </Link>
        </div>
        <nav className="hidden md:flex items-center space-x-8">
          <Link href="/dashboard" className="text-sm font-medium text-text-muted hover:text-text-active">
            Dashboard
          </Link>
          <Link href="/communications" className="text-sm font-medium text-text-muted hover:text-text-active">
            Communications
          </Link>
          <Link href="/superlearner" className="text-sm font-medium text-text-muted hover:text-text-active">
            Superlearner
          </Link>
        </nav>
        <div className="flex items-center">
          <Link href="/login" className="text-sm font-medium text-text-muted hover:text-text-active">
            Log In
          </Link>
        </div>
      </div>
    </header>
  );
};
