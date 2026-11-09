/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다 (#93 예수금 감소의 화면 표시).
 * 인증·DB 없이 고정된 가상 계좌로 계좌 상세 화면을 그린다.
 */
import type React from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import PrototypeClient from "./_client";

export default function PrototypeCashReductionPage(): React.ReactElement {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <PrototypeClient />
    </Suspense>
  );
}
