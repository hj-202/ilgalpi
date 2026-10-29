import { EFFORT_LABEL, IMPORTANCE_LABEL } from "@/lib/constants";
import { RankCircle, TypeBadge } from "../RecommendSection";
import { CheckCircle } from "../TaskItem";
import { Chip, ProgressBar, Stamp } from "../ui";

/*
 * 온보딩 1~4의 시각화 영역. 실제 홈·추천 결과·내 기록 화면의 컴포넌트와 스타일을 그대로 쓰는 정적 미리보기다.
 * - 아래 샘플 데이터는 이 파일 안에서만 쓰며 스토어·localStorage·Supabase·Gemini와 연결되지 않는다.
 * - 버튼·입력창은 상호작용이 없는 div/span으로만 그린다(aria-hidden + pointer-events-none).
 */

const card = "w-full rounded-[20px] border border-[#f3e9ea] bg-white p-4 text-left shadow-[0_10px_30px_rgba(24,24,27,0.06)]";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="pointer-events-none w-full max-w-[345px] select-none">
      <div className={card}>{children}</div>
    </div>
  );
}

function SampleTask({ title, chips, done = false }: { title: string; chips: string[]; done?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <CheckCircle checked={done} />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-bold leading-[1.45] ${done ? "text-[#9a9ba1] line-through" : ""}`}>{title}</p>
        <div className="mt-1.5 flex flex-wrap gap-[5px]">
          {chips.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 1. 홈의 할 일 추가 + 할 일 목록 */
export function TasksPreview() {
  return (
    <Frame>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-[#e8e8e9] bg-white px-3 py-3 text-[15px] text-[#242424]">
          포트폴리오 수정하기
        </div>
        <span className="flex shrink-0 items-center rounded-[13px] bg-primary px-4 font-bold text-white">추가</span>
      </div>
      <div className="mt-1.5 divide-y divide-[#f0f0f1]">
        <SampleTask title="포트폴리오 수정하기" chips={[IMPORTANCE_LABEL.high, EFFORT_LABEL.long, "내일 18:00"]} />
        <SampleTask title="장보기" chips={[IMPORTANCE_LABEL.medium, EFFORT_LABEL.short]} />
      </div>
    </Frame>
  );
}

/** 2. 추천 결과의 우선순위 카드 */
export function RankingPreview() {
  const items = [
    { n: 1, title: "지원서 제출", chips: [IMPORTANCE_LABEL.high, EFFORT_LABEL.short, "오늘 18:00"], reason: "마감이 가까워 먼저 해요." },
    { n: 2, title: "포트폴리오 수정", chips: [IMPORTANCE_LABEL.medium, EFFORT_LABEL.long], reason: "핵심 수정부터 시작해 보세요." },
  ];
  return (
    <Frame>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-lg font-extrabold tracking-tight">오늘의 우선순위</span>
        <TypeBadge type="ai" />
      </div>
      <div className="rounded-[14px] border border-rec-line bg-rec-bg px-3 pb-1 pt-0.5">
        {items.map((it) => (
          <div key={it.n} className="flex items-start gap-2.5 border-b border-[#f2e2e4] py-2.5 last:border-b-0">
            <RankCircle n={it.n} done={false} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-[1.45]">{it.title}</p>
              <div className="mt-1.5 flex flex-wrap gap-[5px]">
                {it.chips.map((c) => (
                  <Chip key={c} tone="outline">
                    {c}
                  </Chip>
                ))}
              </div>
              <p className="mt-1 flex items-start gap-1.5 text-[12.5px] leading-normal text-[#6a6264]">
                <span className="text-base leading-[1.2] text-primary">✧</span>
                <span>{it.reason}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const WEEK = ["월", "화", "수", "목", "금", "토", "일"];

/** 3. 날짜별 실행 기록(캘린더 주간 줄 + 오늘의 실행 기록) */
export function RecordPreview() {
  // 날짜별 완료 현황. null = 할 일 없음, [done, total]
  const days: ([number, number] | null)[] = [[3, 3], [2, 4], [3, 3], [1, 2], [4, 4], null, null];
  return (
    <Frame>
      <div className="grid grid-cols-7 text-center">
        {days.map((d, i) => (
          <div key={WEEK[i]} className="flex flex-col items-center gap-1">
            <span className="text-xs text-[#85878d]">{WEEK[i]}</span>
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[14px] ${i === 4 ? "bg-primary font-bold text-white" : "text-ink"}`}>{21 + i}</span>
            <span className="grid h-[18px] place-items-center">
              {d && d[0] === d[1] ? <Stamp size={18} label={null} /> : d ? <span className="text-xs leading-[18px] text-subtle">{d[0]}/{d[1]}</span> : null}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-[#f0f0f1] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight">오늘의 실행 기록</span>
          <span className="text-[13px] text-subtle">4/4 완료</span>
        </div>
        <div className="mt-2.5">
          <ProgressBar done={4} total={4} />
        </div>
        <p className="mt-2.5 text-sm font-semibold text-primary-dark">오늘 할 일을 모두 마쳤어요. 수고했어요!</p>
      </div>
    </Frame>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <strong className="block text-[22px] font-extrabold tracking-tight">{value}</strong>
      <span className="mt-0.5 block text-xs text-[#76777c]">{label}</span>
    </div>
  );
}

/** 4. 내 기록의 핵심 통계 + 완료율 막대그래프 */
export function StatsPreview() {
  const bars = [60, 100, 75, 50, 100, 80, 0];
  return (
    <Frame>
      <div className="grid grid-cols-3 gap-2">
        <Metric value="78%" label="평균 완료율" />
        <Metric value="18개" label="완료한 일" />
        <Metric value="3일" label="모두 완료한 날" />
      </div>
      <div className="mt-3 flex h-[84px] items-end gap-2.5 border-b border-[#e9e9eb]">
        {bars.map((pct, i) => (
          <span key={WEEK[i]} className="flex h-full min-w-0 flex-1 items-end justify-center">
            <span
              className={`block w-full max-w-[32px] ${pct === 0 ? "bg-[#ececee]" : i === 4 ? "rounded-t-[8px] bg-primary" : "rounded-t-[8px] bg-bar"}`}
              style={{ height: pct === 0 ? "2px" : `${pct}%` }}
            />
          </span>
        ))}
      </div>
      <div className="mt-[7px] flex gap-2.5">
        {WEEK.map((w, i) => (
          <span key={w} className={`flex-1 text-center text-xs ${i === 4 ? "font-extrabold text-primary" : "text-[#7b7c82]"}`}>
            {w}
          </span>
        ))}
      </div>
    </Frame>
  );
}

export const PREVIEWS = [TasksPreview, RankingPreview, RecordPreview, StatsPreview];
