export const Footer = () => {
  return (
    <footer className="bg-glass-bg border-t border-glass-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-center text-sm text-text-muted">
          &copy; {new Date().getFullYear()} Arthur Technologies Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
};
