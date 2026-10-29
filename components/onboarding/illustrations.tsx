/*
 * 온보딩 일러스트. 슬라이드마다 독립 컴포넌트이므로 최종 일러스트(이미지/SVG)로 파일 단위 교체할 수 있다.
 * 하나의 디자인 시스템: 연핑크 라운드 패널 위에 흰색 오브젝트, 딥그레이 텍스트 바, 브랜드 레드 포인트.
 * 큰 원형 배경 대신 패널을 써서 콘텐츠가 작아 보이지 않게 한다. 예시 데이터는 화면 전용이며 저장되지 않는다.
 */

const RED = "#F44D52";
const CORAL = "#F9B9BD";
const PANEL = "#FFF3F4";
const SHADOW = "#F3D9DC";
const INK = "#44454D"; // 완전한 검정 대신 딥그레이
const LINE = "#DCDDE3";
const DOT = "#F2F2F5";
const FONT = "-apple-system, 'Apple SD Gothic Neo', sans-serif";
const SIZE = { width: 280, height: 240, viewBox: "0 0 280 240", "aria-hidden": true } as const;

function Panel() {
  return <rect x="24" y="20" width="232" height="200" rx="30" fill={PANEL} />;
}

/** 흰 카드 + 살짝 내려앉은 그림자 */
function Card({ x, y, w, h, r = 18 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <>
      <rect x={x} y={y + 3} width={w} height={h} rx={r} fill={SHADOW} opacity="0.7" />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="#fff" />
    </>
  );
}

/** 01 체크리스트 + 연필 */
export function ChecklistIllustration() {
  return (
    <svg {...SIZE}>
      <Panel />
      <Card x={52} y={44} w={150} h={152} r={16} />
      {[0, 1, 2].map((i) => {
        const y = 84 + i * 38;
        const done = i === 0;
        return (
          <g key={i}>
            <circle cx="78" cy={y} r="10.5" fill={done ? RED : "#fff"} stroke={done ? RED : "#C9CAD1"} strokeWidth="2.2" />
            {done && <path d={`M73.5 ${y}l3.4 3.4 6-7`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
            <rect x="98" y={y - 8} width={[58, 70, 50][i]} height="9" rx="4.5" fill={done ? LINE : INK} opacity={done ? 1 : 0.9} />
            <rect x="98" y={y + 5} width={[30, 36, 26][i]} height="6" rx="3" fill={CORAL} opacity="0.75" />
          </g>
        );
      })}
      <g transform="translate(216 126) rotate(40)">
        <rect x="-8" y="0" width="16" height="64" rx="3" fill={RED} />
        <rect x="-8" y="0" width="16" height="11" rx="3" fill={CORAL} />
        <rect x="-8" y="11" width="16" height="4" fill="#fff" opacity="0.9" />
        <path d="M-8 64h16l-8 20z" fill="#FBE3D2" />
        <path d="M-2.8 76h5.6L0 84z" fill={INK} />
      </g>
    </svg>
  );
}

/** 02 1·2·3 순위 리스트(카드 없이 하나의 리스트, 구분선 중심) */
export function RankIllustration() {
  const rows = [
    { n: 1, fill: RED, ink: "#fff", title: 96, chips: [34, 40] },
    { n: 2, fill: "#FFC6CB", ink: "#A73B45", title: 78, chips: [30, 36] },
    { n: 3, fill: "#FFE4E7", ink: "#B85A64", title: 62, chips: [32] },
  ];
  return (
    <svg {...SIZE}>
      <Panel />
      <Card x={44} y={46} w={192} h={148} r={18} />
      {rows.map((r, i) => {
        const y = 84 + i * 38;
        return (
          <g key={r.n}>
            <circle cx="72" cy={y} r="13" fill={r.fill} />
            <text x="72" y={y + 4.6} textAnchor="middle" fontSize="13" fontWeight="800" fill={r.ink} fontFamily={FONT}>
              {r.n}
            </text>
            <rect x="98" y={y - 11} width={r.title} height="9" rx="4.5" fill={INK} opacity="0.9" />
            {r.chips.map((w, k) => (
              <rect key={k} x={98 + k * 46} y={y + 3} width={w} height="11" rx="5.5" fill="#fff" stroke={CORAL} strokeWidth="1.5" />
            ))}
            {i < 2 && <line x1="60" x2="220" y1={y + 19} y2={y + 19} stroke="#F3E6E8" strokeWidth="1.5" />}
          </g>
        );
      })}
    </svg>
  );
}

/** 03 캘린더 + 레드 원형 스타 스탬프 */
export function CalendarStampIllustration() {
  const star = (cx: number, cy: number, r: number) =>
    Array.from({ length: 10 }, (_, i) => {
      const rad = i % 2 === 0 ? r : r * 0.46;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  return (
    <svg {...SIZE}>
      <Panel />
      <Card x={50} y={46} w={180} h={150} r={18} />
      <path d="M50 64a18 18 0 0 1 18-18h144a18 18 0 0 1 18 18v16H50z" fill={RED} />
      <rect x="88" y="36" width="8" height="20" rx="4" fill={INK} />
      <rect x="184" y="36" width="8" height="20" rx="4" fill={INK} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3, 4].map((c) =>
          Math.hypot(78 + c * 31 - 172, 106 + r * 29 - 148) < 38 ? null : (
          <circle key={`${r}${c}`} cx={78 + c * 31} cy={106 + r * 29} r="9" fill={r === 0 && c < 3 ? CORAL : DOT} opacity={r === 0 && c < 3 ? 0.8 : 1} />
          ),
        ),
      )}
      <g transform="rotate(-12 172 148)">
        <circle cx="172" cy="148" r="28" fill={RED} />
        <polygon points={star(172, 149, 15)} fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** 04 완료율 막대그래프 + 통계 지표 */
export function ChartIllustration() {
  const bars = [34, 54, 44, 76, 60];
  return (
    <svg {...SIZE}>
      <Panel />
      <Card x={50} y={46} w={180} h={150} r={18} />
      <rect x="66" y="62" width="34" height="7" rx="3.5" fill={LINE} />
      <text x="66" y="92" fontSize="22" fontWeight="800" fill={INK} fontFamily={FONT}>
        82%
      </text>
      <line x1="64" x2="216" y1="180" y2="180" stroke={LINE} strokeWidth="2" strokeLinecap="round" />
      {bars.map((h, i) => (
        <rect key={i} x={70 + i * 32} y={180 - h} width="20" height={h} rx="7" fill={i === 3 ? RED : CORAL} />
      ))}
      <rect x="148" y="60" width="58" height="26" rx="9" fill="#fff" stroke="#F0D6D8" strokeWidth="1.5" />
      <text x="177" y="78" textAnchor="middle" fontSize="14" fontWeight="800" fill={RED} fontFamily={FONT}>
        88%
      </text>
      <path d="M171 86l6 6 6-6z" fill="#fff" stroke="#F0D6D8" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="170" y="85" width="14" height="3" fill="#fff" />
    </svg>
  );
}

export const ILLUSTRATIONS = [ChecklistIllustration, RankIllustration, CalendarStampIllustration, ChartIllustration];
