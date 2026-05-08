import Link from "next/link";

const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-xs border-t border-gray-800 bg-black/50 backdrop-blur-sm text-gray-400">
      <div className="flex items-center gap-4">
        <span>© 2026 Aspen & May, LLC</span>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/terms" className="hover:text-white">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-white">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
