"use client";

import { pastRecords } from "@/lib/stats";
import type { Task } from "@/lib/types";
import { RecordRow } from "./MyPage";
import { ChevronIcon, EmptyState } from "./ui";

/** 지난 실행 기록 전체보기(모달이 아닌 독립 화면): 오늘까지·최신순·고정 총량 제한 없음 */
export default function HistoryView({
  tasks,
  today,
  onBack,
  onOpenDate,
}: {
  tasks: Task[];
  today: string;
  onBack: () => void;
  onOpenDate: (d: string) => void;
}) {
  const records = pastRecords(tasks, today);
  return (
    <div className="min-h-[70vh] bg-white">
      <header className="mb-[23px] flex items-center gap-[7px] border-b border-[#eee] pb-[18px]">
        <button type="button" onClick={onBack} aria-label="내 기록으로 돌아가기" className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-[#33363a] hover:bg-[#f5f5f6]">
          <ChevronIcon dir="left" size={22} />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight">지난 실행 기록</h1>
      </header>
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <strong className="text-[15px]">날짜별 완료 현황</strong>
        <span className="whitespace-nowrap text-[13px] text-[#76777c]">{records.length}일의 기록</span>
      </div>
      {records.length > 0 ? (
        <div className="border-t border-[#f0f0f1]">
          {records.map((r) => (
            <RecordRow key={r.date} {...r} large onOpen={onOpenDate} />
          ))}
        </div>
      ) : (
        <EmptyState icon="chart" title="아직 쌓인 기록이 없어요" description="할 일을 완료하면 이곳에서 지난 기록을 볼 수 있어요." />
      )}
    </div>
  );
}
