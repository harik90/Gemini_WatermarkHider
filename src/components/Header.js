'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';

export default function Header({ onSelectMode, currentMode = 'images' }) {
  const { theme, toggle } = useTheme();
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

  // Fetch real-time GitHub stars with fallback and polling
  useEffect(() => {
    let isMounted = true;

    async function fetchStars() {
      try {
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
      } catch {}

      try {
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
      } catch {}
    }

    fetchStars();
    const interval = setInterval(fetchStars, 20000);
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
    if (count == null) return <><span>1</span> <span className="stars-label">Star</span></>;
    if (count >= 1000) {
      return <><span>{(count / 1000).toFixed(1).replace(/\.0$/, '')}k</span> <span className="stars-label">Stars</span></>;
    }
    return <><span>{count}</span> <span className="stars-label">{count === 1 ? 'Star' : 'Stars'}</span></>;
  };

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  return (
    <header className="header">
      <div className="header-inner">
        {/* Left: Brand Logo & Title */}
        <div className="header-left">
          <a href={basePath || '/'} className="header-logo" aria-label="Gemini Watermark Cleaner">
            <div className="vercel-logo-icon">
              <img
                src={`${basePath}/app-icon.png`}
                alt="Logo"
                width={22}
                height={22}
                className="brand-logo-img"
              />
            </div>
            <div className="brand-group">
              <span className="brand-title">Gemini Cleaner</span>
              <span className="brand-title-sub">· Veo Studio</span>
              <span className="brand-slash">/</span>
              <span className="brand-mode-badge">{currentMode === 'images' ? 'Images' : 'Video Studio'}</span>
            </div>
          </a>

          {/* Section Anchors */}
          <nav className="header-main-nav">
            <button
              type="button"
              className={`nav-link ${currentMode === 'images' ? 'active' : ''}`}
              onClick={() => onSelectMode?.('images')}
            >
              <span>Images</span>
            </button>

            <button
              type="button"
              className={`nav-link ${currentMode === 'videos' ? 'active' : ''}`}
              onClick={() => onSelectMode?.('videos')}
            >
              <span>Video Studio</span>
              <span className="nav-tag-badge">1080p</span>
            </button>
          </nav>
        </div>

        {/* Right: GitHub Star, Theme Toggle */}
        <div className="header-right">
          {/* GitHub Star Button */}
          <a
            href="https://github.com/harik90/Gemini_WatermarkHider"
            target="_blank"
            rel="noopener noreferrer"
            className="github-stars-btn"
            aria-label="Star harik90/Gemini_WatermarkHider on GitHub"
            title="Star harik90/Gemini_WatermarkHider on GitHub"
          >
            <svg className="github-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="stars-count" suppressHydrationWarning>{formatStars(stars)}</span>
            <span className="stars-arrow">↗</span>
          </a>

          {/* Theme Toggle (Dark / Light) */}
          <button
            className="theme-toggle"
            onClick={toggle}
            data-active={theme === 'light' ? 'sun' : 'moon'}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'}`}
          >
            <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
            <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
