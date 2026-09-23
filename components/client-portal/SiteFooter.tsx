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
          <span>&copy; 2026 LOVELEEDAY Studios</span>
          <a href="https://loveleedaystudios.com/privacy.html">Privacy</a>
          <a href="https://loveleedaystudios.com/principles.html">Principles</a>
        </div>
      </div>
    </footer>
  );
}
