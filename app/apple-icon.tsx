import { ImageResponse } from "next/og";
import IconArt from "./icon-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS가 모서리를 직접 둥글게 처리하므로 정사각형으로 그린다
export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} radius={0} />, size);
}
