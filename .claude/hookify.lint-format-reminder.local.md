---
name: lint-format-reminder
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.ts$
---

## TypeScript 파일 수정됨

PostToolUse 훅이 자동으로 ESLint와 Prettier를 실행합니다.

**자동 수정 범위:**
- ESLint: 코드 스타일 및 잠재적 오류 수정
- Prettier: 코드 포매팅 정리

만약 자동 수정이 실패하면 수동으로 확인하세요:
```bash
npm run lint      # 린팅 검사
npm run format    # 포매팅 적용
```
