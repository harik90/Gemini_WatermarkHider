import './globals.css';

export const metadata = {
  title: 'Hide Gemini Watermark — Free Online Gemini Watermark Cleaner',
  description: 'Free online Gemini watermark cleaner for images, logos, and star overlays. No upload, no sign-up — 100% local, private processing.',
  keywords: 'gemini watermark remover, gemini video remover, remove gemini watermark, google ai watermark, reverse alpha blending, watermark cleaner',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z' fill='%23F59E0B'/></svg>" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..800;1,9..40,400..800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('clearmark-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}else{document.documentElement.setAttribute('data-theme','light')}}catch(e){}})();`
        }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
