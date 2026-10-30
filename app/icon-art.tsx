/** 5각 별 꼭짓점. 앱 UI의 완료 스탬프(components/ui.tsx `Stamp`)와 같은 비율(안쪽 반지름 = 바깥 × 0.46) */
function starPoints(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.46;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// 64×64 기준. 외접원 반지름 18.9 + 선 반폭 1.62(꼭짓점 라운딩). 사방 여백이 충분하도록 이전(21 + 1.8)보다 10% 줄였다.
// 별의 가로·세로 범위가 배경 중앙에 오도록 중심을 살짝(1.7) 내려 배치한다
const STAR = starPoints(32, 33.7, 18.9);

/** 파비콘·앱 아이콘 공통 도형: 브랜드 레드 배경 + 흰색 단색 별(꼭짓점 라운딩). 폰트 없이 도형으로 그린다. */
export default function IconArt({ size, radius }: { size: number; radius: number }) {
  return (
    <div style={{ width: size, height: size, display: "flex", background: "#F44D52", borderRadius: radius }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <polygon points={STAR} fill="#fff" stroke="#fff" strokeWidth="3.24" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
