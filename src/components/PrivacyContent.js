'use client';

export default function PrivacyContent({ isModal = false }) {
  return (
    <div className="privacy-content">
      {/* Hero Badge */}
      <div className="privacy-hero">
        <div className="privacy-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          100% Client-Side Privacy
        </div>
        <h1 className="privacy-title">Privacy Policy</h1>
        <p className="privacy-subtitle">
          Your files stay on your device. Simple, private, and anonymous.
        </p>
      </div>

      {/* Highlights Grid */}
      <div className="privacy-highlights-grid">
        <div className="privacy-highlight-card">
          <div className="highlight-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="highlight-title">Zero Server Uploads</div>
          <div className="highlight-desc">
            Your images and videos are processed directly in your browser. Nothing is ever sent to any remote server or cloud.
          </div>
        </div>

        <div className="privacy-highlight-card">
          <div className="highlight-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="highlight-title">No Accounts or Tracking</div>
          <div className="highlight-desc">
            No sign-up, no login, no cookies, and no tracking pixels. You use the service completely anonymously.
          </div>
        </div>

        <div className="privacy-highlight-card">
          <div className="highlight-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="highlight-title">In Your Control</div>
          <div className="highlight-desc">
            Your media is stored only in local memory while you work. When you close the tab, everything is cleared.
          </div>
        </div>
      </div>

      {/* Simple Summary */}
      <div className="privacy-sections">
        <section className="privacy-section">
          <h2>Plain English Summary</h2>
          <p>
            When you add an image or video to this tool, watermark removal happens directly on your own computer.
            Your media never leaves your device, and no one else can see or access your files.
          </p>
          <p>
            We do not collect names, email addresses, cookies, or any personal information.
            There are no hidden analytics or tracking scripts.
          </p>
        </section>
      </div>
    </div>
  );
}
