"use client";

/**
 * PROTOTYPE - 버려질 코드. main에 합치지 않는다 (#106 사이클 중 시드 변경 화면).
 *
 * 질문: 사이클 중 시드 변경을 계좌 화면에서 어떻게 보이고 입력받는가?
 * 시안 세 개를 ?variant= 로, 시점 네 개를 ?scenario= 로 바꿔 본다.
 * ?seed= 는 저장한 새 시드, ?loss=1 은 손절 손실, ?fill=0 은 바꾼 날 매수 미체결.
 */

import type React from "react";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PrototypeSwitcher from "@/components/PrototypeSwitcher";
import { PHASES, buildModel } from "./_model";
import type { Phase } from "./_model";
import { FixturePanel, Header } from "./_shared";
import type { Controls } from "./_shared";
import { VariantA, VariantB, VariantC } from "./_variants";

const VARIANTS = [
  { key: "A", name: "설정 카드 안에서" },
  { key: "B", name: "입출금 대화상자" },
  { key: "C", name: "시드 이력 카드" },
];

const DEFAULT_SEED = 6000;

export default function PrototypeClient(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";
  const phaseParam = searchParams.get("scenario");
  const phase: Phase = PHASES.some((p) => p.key === phaseParam) ? (phaseParam as Phase) : "before";
  const seedParam = searchParams.get("seed");
  const newSeed = seedParam ? Number(seedParam) : phase === "before" ? null : DEFAULT_SEED;

  const m = buildModel({
    phase,
    newSeed,
    withLoss: searchParams.get("loss") === "1",
    buyFilled: searchParams.get("fill") !== "0",
  });

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const controls: Controls = {
    setSeed: (seed, nextPhase) =>
      update({
        seed: seed === null ? null : String(seed),
        ...(nextPhase ? { scenario: nextPhase } : {}),
      }),
    setFlag: (name, on) =>
      update({ [name]: name === "loss" ? (on ? "1" : null) : on ? null : "0" }),
  };

  // 시안·시점·입력값이 바뀌면 시안 안의 입력 상태를 처음부터 다시 잡는다
  const key = `${variant}-${searchParams.toString()}`;

  return (
    <div className="container py-4" style={{ paddingBottom: 96 }}>
      <Header />
      <FixturePanel m={m} controls={controls} />
      {variant === "A" && <VariantA key={key} m={m} controls={controls} />}
      {variant === "B" && <VariantB key={key} m={m} controls={controls} />}
      {variant === "C" && <VariantC key={key} m={m} controls={controls} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        scenarios={PHASES}
        currentScenario={phase}
      />
    </div>
  );
}
