'use client';

import Link from 'next/link';

export default function Footer({ onOpenPrivacy }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>© {new Date().getFullYear()} Hide Gemini Watermark · 100% client-side · Your files never leave your browser</span>
        <div className="footer-links">
          <a href="https://github.com/harik90/Gemini_WatermarkHider" target="_blank" rel="noopener noreferrer">GitHub</a>
          <Link
            href="/privacy"
            onClick={(e) => {
              if (onOpenPrivacy) {
                e.preventDefault();
                onOpenPrivacy();
              }
            }}
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
