// 资料名片嵌入组件：竖版紧凑名片（v1 粉墨视觉），按容器宽度自适应缩放，多图可翻页。
// admin 资料卡片弹窗和 /me「本周的同桌」共用。
import { useEffect, useRef, useState } from "react";
import { cardHtml, MATCH_CARD_CSS, type CardPerson } from "@/lib/matchCard";

export const CARD_NATURAL_WIDTH = 470;

export default function MatchCardEmbed({ person, photoIdx: controlledIdx, onPhotoIdx }: { person: CardPerson; photoIdx?: number; onPhotoIdx?: (i: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [innerIdx, setInnerIdx] = useState(0);
  const [scale, setScale] = useState(1);
  const photoIdx = controlledIdx ?? innerIdx;
  const setPhotoIdx = (updater: (i: number) => number) => {
    const next = updater(photoIdx);
    if (onPhotoIdx) onPhotoIdx(next);
    else setInnerIdx(next);
  };

  useEffect(() => {
    if (!document.getElementById("mc-style")) {
      const el = document.createElement("style");
      el.id = "mc-style";
      el.textContent = MATCH_CARD_CSS;
      document.head.appendChild(el);
    }
  }, []);
  useEffect(() => {
    const measure = () => {
      if (boxRef.current) setScale(Math.min(1, boxRef.current.offsetWidth / CARD_NATURAL_WIDTH));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    if (!hostRef.current) return;
    hostRef.current.innerHTML = cardHtml(person, { photoIdx });
    const card = hostRef.current.firstElementChild as HTMLElement | null;
    const box = boxRef.current;
    if (card && box) {
      // 图片加载后高度会变，等一帧再量
      requestAnimationFrame(() => {
        box.style.height = `${Math.ceil(card.offsetHeight * scale) + 2}px`;
      });
    }
  }, [person, photoIdx, scale]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const total = person.photos.length;
      if (total <= 1) return;
      if (t.closest("[data-mc-prev]")) setPhotoIdx((i) => (i - 1 + total) % total);
      if (t.closest("[data-mc-next]")) setPhotoIdx((i) => (i + 1) % total);
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  });

  return (
    <div ref={boxRef} className="overflow-hidden">
      <div style={{ width: CARD_NATURAL_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <div ref={hostRef} />
      </div>
    </div>
  );
}
