"use client";

import { useRef, useState } from "react";
import { finishOnboarding } from "@/hooks/useAppStore";
import { PREVIEWS } from "./onboarding/Previews";
import { introSub, introTitle, PrimaryButton } from "./ui";

/*
 * 최초 방문 시 4장. 예시 그래픽은 화면 전용이며 저장소에 저장되지 않는다.
 * 온보딩 완료 여부(ilgalpi:onboarded)는 로그인 여부와 별개로 관리한다.
 * 시각화는 components/onboarding/Previews.tsx의 정적 미리보기(샘플 데이터)이다.
 */
const SLIDES = [
  { title: "할 일을 자유롭게 정리해요", sub: ["생각나는 일을 적고", "필요한 조건만 간편하게 설정해요"] },
  { title: "무엇부터 할지 순서를 찾아요", sub: ["마감과 중요도, 소요시간을 고려해", "실행 순서와 이유를 알려드려요"] },
  { title: "실행한 만큼 기록해요", sub: ["하루의 실행 현황을 확인하고", "다 마친 날에는 도장이 찍혀요"] },
  { title: "나의 실행 패턴을 확인해요", sub: ["쌓인 기록을 통해 완료율과", "실행 흐름을 한눈에 살펴보세요"] },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const last = index === SLIDES.length - 1;

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" && index < SLIDES.length - 1) goTo(index + 1);
    if (e.key === "ArrowLeft" && index > 0) goTo(index - 1);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="일갈피 소개" onKeyDown={onKey} className="fixed inset-0 z-50 flex justify-center bg-[#eceef1]">
      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-[linear-gradient(180deg,#fff_0%,color-mix(in_srgb,var(--color-primary)_6%,white)_42%,#fff_100%)]">
        <div className="flex h-14 shrink-0 items-center justify-end px-4">
          <button type="button" onClick={finishOnboarding} className="min-h-[44px] px-3 text-sm text-[#767780]">
            건너뛰기
          </button>
        </div>

        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
        >
          {SLIDES.map((s, i) => {
            const Preview = PREVIEWS[i];
            return (
              <section key={s.title} aria-label={`${i + 1}/${SLIDES.length}`} className="flex min-h-0 w-full shrink-0 snap-center flex-col items-center justify-center px-6 pb-2 text-center">
                <div className="flex h-[min(42dvh,312px)] w-full shrink-0 items-center justify-center pb-2">
                  <Preview />
                </div>
                <h1 className={`mt-5 min-[700px]:mt-8 ${introTitle}`}>{s.title}</h1>
                <p className={`mt-3 ${introSub}`}>
                  {s.sub.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </p>
              </section>
            );
          })}
        </div>

        <div className="shrink-0 px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3">
          <div className="mb-6 flex items-center justify-center gap-2" role="tablist" aria-label="소개 페이지">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}번째 소개`}
                onClick={() => goTo(i)}
                className={`relative h-2 rounded-full transition-all after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] ${i === index ? "w-5 bg-primary" : "w-2 bg-[#dcdde1]"}`}
              />
            ))}
          </div>
          <PrimaryButton type="button" onClick={() => (last ? finishOnboarding() : goTo(index + 1))} className="min-h-14 w-full rounded-2xl !text-[18px]">
            {last ? "시작하기" : "다음"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
