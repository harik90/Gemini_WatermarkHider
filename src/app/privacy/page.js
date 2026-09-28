'use client';

import Link from 'next/link';
import { ThemeProvider } from '@/hooks/useTheme';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PrivacyContent from '@/components/PrivacyContent';

export default function PrivacyPage() {
  return (
    <ThemeProvider>
      <div className="privacy-page-layout">
        <Header />

        <main className="privacy-page-main">
          <div className="container privacy-container">
            <div className="privacy-page-nav">
              <Link href="/" className="btn btn-secondary btn-sm privacy-back-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Cleaner
              </Link>
            </div>

            <PrivacyContent />

            <div className="privacy-page-footer-nav">
              <Link href="/" className="btn btn-primary privacy-back-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Return to Watermark Remover
              </Link>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </ThemeProvider>
  );
}
