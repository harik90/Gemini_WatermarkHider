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
          100% Client-Side Privacy Guarantee
        </div>
        <h1 className="privacy-title">Privacy Policy</h1>
        <p className="privacy-subtitle">
          Last Updated: September 2026 · Effective Date: Immediate
        </p>
      </div>

      {/* Highlights Grid */}
      <div className="privacy-highlights-grid">
        <div className="privacy-highlight-card">
          <div className="highlight-icon">🛡️</div>
          <div className="highlight-title">Zero Server Uploads</div>
          <div className="highlight-desc">
            Your images and videos are processed purely in your browser&apos;s local memory. No files are ever uploaded to any cloud or remote server.
          </div>
        </div>

        <div className="privacy-highlight-card">
          <div className="highlight-icon">👤</div>
          <div className="highlight-title">No Accounts or Tracking</div>
          <div className="highlight-desc">
            No registration, no cookies, no tracking pixels, and no personal data collection. You use the service completely anonymously.
          </div>
        </div>

        <div className="privacy-highlight-card">
          <div className="highlight-icon">🔍</div>
          <div className="highlight-title">Verifiable & Open Source</div>
          <div className="highlight-desc">
            Inspect our network traffic in your browser DevTools (F12) or audit the complete source code on GitHub.
          </div>
        </div>
      </div>

      {/* Detailed Articles */}
      <div className="privacy-sections">
        <section className="privacy-section">
          <h2>1. Overview & Architectural Commitment</h2>
          <p>
            <strong>Hide Gemini Watermark</strong> (&quot;Gemini Watermark Hider&quot;) is developed with a strict <em>Privacy-First, Zero-Knowledge</em> architectural philosophy. Unlike conventional online converters and AI cleanup tools, our tool runs entirely on client-side web technologies: HTML5 Canvas, Web Audio API, and modern browser hardware acceleration.
          </p>
          <p>
            When you select or drop a file into Hide Gemini Watermark, the file is read directly from your local filesystem into browser memory via HTML5 File APIs. The watermark detection, reverse alpha-blending math, and frame-by-frame video processing take place locally on your machine&apos;s processor and GPU.
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. Information We Never Collect</h2>
          <p>We explicitly do <strong>NOT</strong> collect, transmit, store, or sell:</p>
          <ul>
            <li><strong>Your media files:</strong> Images, videos, photos, screenshots, and audio tracks remain strictly on your device.</li>
            <li><strong>Personal Identity:</strong> We do not ask for your name, email address, phone number, physical address, or credentials.</li>
            <li><strong>Biometric Data:</strong> No facial recognition or biometric scanning is executed on any uploaded imagery.</li>
            <li><strong>Server Request Logs:</strong> Because media processing is not handled by a backend server, there are no remote server access logs of your processed files.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>3. Data Stored Locally On Your Device</h2>
          <p>The application uses standard web browser storage mechanisms strictly to enhance your local user experience:</p>
          <ul>
            <li>
              <strong>Theme Preference (<code>localStorage</code>):</strong> A single item named <code>clearmark-theme</code> stores your display choice (<code>&quot;light&quot;</code> or <code>&quot;dark&quot;</code>).
            </li>
            <li>
              <strong>Temporary Session Cache (<code>IndexedDB</code>):</strong> When you add files to the workspace queue, a temporary reference is cached in your browser&apos;s local IndexedDB storage so your work is not lost if the page is accidentally reloaded. You can clear this at any time by clicking <em>&quot;Clear Queue&quot;</em>.
            </li>
          </ul>
          <p>Neither localStorage nor IndexedDB data is ever transmitted across the network.</p>
        </section>

        <section className="privacy-section">
          <h2>4. Third-Party Network Connections</h2>
          <p>The website only connects to the following essential external resources:</p>
          <ul>
            <li>
              <strong>Google Fonts CDN (<code>fonts.googleapis.com</code> &amp; <code>fonts.gstatic.com</code>):</strong> Provides the typography (DM Sans and Inter) used across the application.
            </li>
            <li>
              <strong>GitHub REST API (<code>api.github.com</code>):</strong> Makes a single, anonymous, read-only query to fetch the public repository star count from <a href="https://github.com/harik90/Gemini_WatermarkHider" target="_blank" rel="noopener noreferrer">harik90/Gemini_WatermarkHider</a>. No user data, cookies, or authorization tokens are included in this request.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>5. Regulatory Compliance (GDPR, CCPA &amp; CPRA)</h2>
          <p>
            Because Hide Gemini Watermark does not collect, process, or store personal data on remote infrastructure, the service is compliant by design with global data protection regulations:
          </p>
          <ul>
            <li>
              <strong>GDPR (General Data Protection Regulation):</strong> We adhere to Article 25 (&quot;Data protection by design and by default&quot;). No data controller or processor agreements are required because no personally identifiable information (PII) is transferred.
            </li>
            <li>
              <strong>CCPA &amp; CPRA:</strong> We do not sell, rent, or disclose consumer personal data to any third party for commercial or advertising purposes.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>6. How to Independently Verify Your Privacy</h2>
          <p>We encourage technical verification of our privacy claims:</p>
          <ol>
            <li>Open Developer Tools in Google Chrome, Firefox, Safari, or Microsoft Edge (press <code>F12</code> or <code>Ctrl+Shift+I</code>).</li>
            <li>Navigate to the <strong>Network</strong> tab and click the red record button.</li>
            <li>Drag any image or video into Hide Gemini Watermark and process it.</li>
            <li>Inspect the network log — you will observe <strong>0 outbound data transfer requests</strong> containing your media.</li>
          </ol>
        </section>

        <section className="privacy-section">
          <h2>7. Open Source &amp; Code Transparency</h2>
          <p>
            The entire frontend codebase is open source and available for public security audit at:{' '}
            <a href="https://github.com/harik90/Gemini_WatermarkHider" target="_blank" rel="noopener noreferrer">
              https://github.com/harik90/Gemini_WatermarkHider
            </a>.
          </p>
        </section>

        <section className="privacy-section">
          <h2>8. Contact &amp; Questions</h2>
          <p>
            If you have questions, feedback, or security suggestions regarding this privacy policy, please open an issue on our official repository tracker:{' '}
            <a href="https://github.com/harik90/Gemini_WatermarkHider/issues" target="_blank" rel="noopener noreferrer">
              GitHub Issues — Gemini_WatermarkHider
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
