import { Wordmark } from "./LogoMark";

// The legal row of loveleedaystudios.com's dark `.site-footer`, so every
// portal page ends the way the marketing site does.
export function SiteFooter() {
  return (
    <footer className="ll-footer">
      <div className="ll-wrap ll-footer-inner">
        <a href="https://loveleedaystudios.com/" aria-label="LOVELEEDAY home">
          <Wordmark size={20} />
        </a>
        <div className="ll-footer-legal">
          <span>&copy; 2026 LOVELEEDAY Studios LLC</span>
          <a href="/client/privacy">Privacy</a>
          <a href="/client/terms">Terms</a>
          <a href="/trust">Trust center</a>
          <a href="https://loveleedaystudios.com/principles">Principles</a>
        </div>
      </div>
    </footer>
  );
}
