import type { Metadata } from 'next';
import Script from 'next/script';
import '@/styles/globals.css';
import TopControlBar from '@/components/TopControlBar';
import MainNavigation from '@/components/MainNavigation';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: {
    default: '떨사오팔 Pro 레이더',
    template: '%s | 떨사오팔 Pro 레이더',
  },
  description: 'SOXL ETF 떨사오팔 Pro 투자 전략 백테스트 및 매매표 생성 시스템',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* Bootswatch Solar Theme */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/solar/bootstrap.min.css"
        />
        {/* Google Fonts - Noto Sans KR */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <TopControlBar />
        <MainNavigation />
        <div className="container-fluid mt-3">
          <div className="row">
            <div className="col main-content">
              {children}
            </div>
          </div>
        </div>
        <Sidebar />
        {/* Bootstrap JS */}
        <Script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
