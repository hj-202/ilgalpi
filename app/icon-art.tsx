/** 파비콘·앱 아이콘 공통 도형: 브랜드 레드 배경 + 흰색 단순 `일`(폰트 없이 도형으로 그림). 임시 아이콘이다. */
export default function IconArt({ size, radius }: { size: number; radius: number }) {
  return (
    <div style={{ width: size, height: size, display: "flex", background: "#F44D52", borderRadius: radius }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="25" cy="21" r="8.5" />
        <path d="M45 10V33" />
        <path d="M18 40H44V47.5H18V55H44" />
      </svg>
    </div>
  );
}
