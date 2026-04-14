import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dromos',
  description: 'Personal training tracker — AI-powered coaching for your goals',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dromos',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1B2A4A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-gray-950">
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className="bg-gray-950 text-white">
        {children}
        <Analytics />
        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) { console.log('[SW] Registered'); })
                    .catch(function(err) { console.warn('[SW] Registration failed:', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
