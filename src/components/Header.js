'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';

export default function Header({ onSelectMode }) {
  const { theme, toggle } = useTheme();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [stars, setStars] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('gh_stars_harik90');
        if (cached != null) {
          const num = parseInt(cached, 10);
          if (!isNaN(num)) return num;
        }
      } catch {}
    }
    return 1;
  });
  const toolsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch real-time GitHub stars with fallback and polling
  useEffect(() => {
    let isMounted = true;

    async function fetchStars() {
      try {
        // 1. Try official GitHub API with cache-buster
        const res = await fetch(`https://api.github.com/repos/harik90/Gemini_WatermarkHider?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.stargazers_count === 'number') {
            setStars(data.stargazers_count);
            try { localStorage.setItem('gh_stars_harik90', String(data.stargazers_count)); } catch {}
            return;
          }
        }
      } catch {
        // Fallback below
      }

      try {
        // 2. Fallback to shields.io JSON (unmetered, no rate limits)
        const shieldRes = await fetch(`https://img.shields.io/github/stars/harik90/Gemini_WatermarkHider.json?_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (shieldRes.ok) {
          const shieldData = await shieldRes.json();
          const parsed = parseInt(shieldData.value || shieldData.message, 10);
          if (isMounted && !isNaN(parsed)) {
            setStars(parsed);
            try { localStorage.setItem('gh_stars_harik90', String(parsed)); } catch {}
          }
        }
      } catch {
        // Keep current stars state
      }
    }

    // Initial fetch
    fetchStars();

    // Realtime polling every 20 seconds
    const interval = setInterval(fetchStars, 20000);

    // Refresh immediately when user returns to this tab from GitHub
    const handleFocus = () => fetchStars();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchStars();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const formatStars = (count) => {
    if (count == null) return '1 Star';
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k Stars`;
    }
    return `${count} ${count === 1 ? 'Star' : 'Stars'}`;
  };

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  return (
    <header className="header">
      <div className="header-inner">
        {/* Left branding & navigation */}
        <div className="header-left">
          <a href={basePath || '/'} className="header-logo" aria-label="Hide Gemini Watermark Homepage">
            <svg className="gemini-star-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" />
            </svg>
            <span className="logo-text">Hide Gemini Watermark</span>
          </a>

          <nav className="header-main-nav">
            <div className="tools-dropdown-container" ref={toolsRef}>
              <button
                type="button"
                className={`nav-link tools-btn ${toolsOpen ? 'active' : ''}`}
                onClick={() => setToolsOpen((prev) => !prev)}
                aria-expanded={toolsOpen}
              >
                Tools
                <svg className={`chevron ${toolsOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {toolsOpen && (
                <div className="tools-dropdown-menu">
                  <button
                    type="button"
                    className="tools-dropdown-item"
                    onClick={() => {
                      onSelectMode?.('images');
                      setToolsOpen(false);
                    }}
                  >
                    <span className="item-icon">🖼</span>
                    <div>
                      <div className="item-title">Gemini Image Remover</div>
                      <div className="item-desc">Remove star overlays & alpha watermark</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="tools-dropdown-item"
                    onClick={() => {
                      onSelectMode?.('videos');
                      setToolsOpen(false);
                    }}
                  >
                    <span className="item-icon">🎬</span>
                    <div>
                      <div className="item-title">Gemini Video Remover</div>
                      <div className="item-desc">Process video frames client-side</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="tools-dropdown-item"
                    onClick={() => {
                      onSelectMode?.('images');
                      setToolsOpen(false);
                    }}
                  >
                    <span className="item-icon">⚡</span>
                    <div>
                      <div className="item-title">Batch Folder & .ZIP Mode</div>
                      <div className="item-desc">Drag entire archives for multi-file processing</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="nav-link video-remover-link"
              onClick={() => onSelectMode?.('videos')}
            >
              Gemini Video Remover
            </button>
          </nav>
        </div>

        {/* Right CTA actions */}
        <div className="header-right">
          <a
            href="https://github.com/harik90/Gemini_WatermarkHider"
            target="_blank"
            rel="noopener noreferrer"
            className="github-stars-btn"
            aria-label="Star harik90/Gemini_WatermarkHider on GitHub"
            title="Star harik90/Gemini_WatermarkHider on GitHub"
          >
            <svg className="github-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span className="star-icon">★</span>
            <span className="stars-count">{formatStars(stars)}</span>
          </a>

          <button
            className="theme-toggle"
            onClick={toggle}
            data-active={theme === 'light' ? 'sun' : 'moon'}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
            </svg>
            <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
