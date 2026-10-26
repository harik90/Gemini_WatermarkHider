'use client';

import Link from 'next/link';

export default function Footer({ onOpenPrivacy }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-meta-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <img src={`${basePath}/app-icon.png`} alt="" width={15} height={15} style={{ borderRadius: '2px', objectFit: 'contain' }} />
          <span>Gemini Cleaner</span>
          <span>·</span>
          <span>Dual-Star Calibrated Unblend</span>
          <span>·</span>
          <span>Client-Side Privacy</span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/harik90/Gemini_WatermarkHider" target="_blank" rel="noopener noreferrer" className="quiet-link">
            GitHub ↗
          </a>
          <span className="footer-sep">·</span>
          <Link
            href="/privacy"
            className="quiet-link"
            onClick={(e) => {
              if (onOpenPrivacy) {
                e.preventDefault();
                onOpenPrivacy();
              }
            }}
          >
            Privacy ↗
          </Link>
          <span className="footer-sep">·</span>
          <span className="footer-sub-note">Zero-Upload Local Processing</span>
        </div>
      </div>
    </footer>
  );
}
