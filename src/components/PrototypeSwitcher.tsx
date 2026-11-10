"use client";

/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다.
 * ?variant= / ?scenario= 를 바꾸는 하단 고정 전환 막대.
 * 운영 빌드에서는 그리지 않는다.
 */

import type React from "react";
import { useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Option {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: Option[];
  current: string;
  scenarios?: Option[];
  currentScenario?: string;
}

export default function PrototypeSwitcher({
  variants,
  current,
  scenarios,
  currentScenario,
}: PrototypeSwitcherProps): React.ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const step = useCallback(
    (delta: number) => {
      const index = variants.findIndex((v) => v.key === current);
      const next = variants[(index + delta + variants.length) % variants.length];
      setParam("variant", next.key);
    },
    [variants, current, setParam]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (process.env.NODE_ENV === "production") return null;

  const currentVariant = variants.find((v) => v.key === current);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: 0,
        right: 0,
        margin: "0 auto",
        width: "fit-content",
        zIndex: 2000,
        background: "#fff",
        color: "#111",
        boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 14,
        fontFamily: "system-ui, sans-serif",
        whiteSpace: "nowrap",
        flexWrap: "wrap",
        justifyContent: "center",
        maxWidth: "calc(100vw - 16px)",
        borderRadius: 24,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "#c00" }}>PROTOTYPE</span>
      <button type="button" onClick={() => step(-1)} style={buttonStyle} aria-label="이전 시안">
        ←
      </button>
      <strong style={{ minWidth: 150, textAlign: "center" }}>
        {current} ({currentVariant?.name ?? "?"})
      </strong>
      <button type="button" onClick={() => step(1)} style={buttonStyle} aria-label="다음 시안">
        →
      </button>
      {scenarios && (
        <>
          <span style={{ width: 1, height: 20, background: "#ccc" }} />
          {scenarios.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setParam("scenario", s.key)}
              style={{
                ...buttonStyle,
                background: s.key === currentScenario ? "#111" : "#eee",
                color: s.key === currentScenario ? "#fff" : "#111",
                padding: "4px 10px",
              }}
            >
              {s.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "none",
  background: "#eee",
  color: "#111",
  borderRadius: 999,
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: 14,
};
