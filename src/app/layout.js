import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata = {
  title: 'Gemini Watermark Remover — Vercel Design Studio',
  description: 'Precision client-side and pipeline watermark remover for Google Gemini & Veo videos and images.',
  keywords: 'gemini watermark remover, veo video remover, remove gemini watermark, google ai watermark',
  icons: {
    icon: [
      { url: `${basePath}/favicon.png`, sizes: '32x32', type: 'image/png' },
      { url: `${basePath}/favicon.ico` },
    ],
    apple: [
      { url: `${basePath}/apple-touch-icon.png` },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" sizes="32x32" href={`${basePath}/favicon.png`} />
        <link rel="icon" type="image/x-icon" href={`${basePath}/favicon.ico`} />
        <link rel="apple-touch-icon" href={`${basePath}/apple-touch-icon.png`} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
