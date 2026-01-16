'use client';

// MainNavigation 컴포넌트 - 메인 네비게이션 바
// Client Component - usePathname 사용을 위해

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
}

const navItems: NavItem[] = [
  { href: '/info', label: 'Info' },
  { href: '/strategy', label: '추천전략' },
  { href: '/stats', label: '통계' },
  { href: '/backtest', label: '백테스트(기본)' },
  { href: '/backtest-strategy', label: '백테스트(추천전략)' },
  { href: '/update-note', label: 'Update Note' },
];

export default function MainNavigation() {
  const pathname = usePathname();

  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary">
      <div className="container-fluid">
        {/* 로고 */}
        <Link href="/info" className="navbar-brand">
          <span role="img" aria-label="radar">&#x1F6F0;&#xFE0F;</span> 떨사오팔 Pro 레이더
        </Link>

        {/* 모바일 토글 버튼 */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNavbar"
          aria-controls="mainNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* 네비게이션 메뉴 */}
        <div className="collapse navbar-collapse" id="mainNavbar">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            {navItems.map((item) => (
              <li key={item.href} className="nav-item">
                <Link
                  href={item.href}
                  className={`nav-link ${pathname === item.href ? 'active' : ''}`}
                  aria-current={pathname === item.href ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
