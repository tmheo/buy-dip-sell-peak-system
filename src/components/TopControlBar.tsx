// TopControlBar 컴포넌트 - 상단 컨트롤 바
// Server Component

export default function TopControlBar() {
  return (
    <nav className="navbar navbar-expand-lg bg-dark border-bottom border-secondary">
      <div className="container-fluid">
        {/* 왼쪽: 제품 드롭다운 */}
        <div className="navbar-nav">
          <div className="nav-item dropdown">
            <button
              className="btn btn-outline-secondary dropdown-toggle"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              disabled
            >
              떨사오팔 Pro
            </button>
            <ul className="dropdown-menu">
              <li>
                <span className="dropdown-item disabled">떨사오팔 Pro</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 오른쪽: 사용자 정보 및 버튼들 */}
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted me-2">사용자명</span>
          <button className="btn btn-outline-info" type="button" disabled>
            Trading
          </button>
          <button className="btn btn-outline-warning" type="button" disabled>
            My Custom
          </button>
          <button className="btn btn-outline-secondary" type="button" disabled>
            My Page
          </button>
        </div>
      </div>
    </nav>
  );
}
