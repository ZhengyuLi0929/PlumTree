// 匹配名片：v1 的粉墨视觉 + v2 的多图/智能长宽比，数据用我们自己的字段，装饰用丘比特小猫。
// 同一份 HTML 模板三处复用：admin 弹窗预览（DOM）、PNG/JPEG 导出（SVG foreignObject）、自包含 HTML 下载。
import { TYPES, getAvatar, getMeme } from "@/data/types";

export type CardPerson = {
  name: string;
  gender: string | null;
  birthYear: number | null;
  city: string | null;
  job: string | null;
  height: number | null;
  mbti: string | null;
  intro: string | null;
  expectation: string | null;
  value: string | null;
  typeCode: string | null;
  photos: { id: number; url: string }[];
};

const CUPID = "/cupid/preview-b09934.png";

/* 名片样式（v1 审美 + 竖版紧凑布局；照片永远完整 contain + 模糊背景垫，不裁切任何部分） */
export const MATCH_CARD_CSS = `
.mc-card{font-family:ui-rounded,"Arial Rounded MT Bold","PingFang SC","Microsoft Yahei",sans-serif;color:#402d37;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:320px auto;background:#fffcf7;border:2px solid #402d37;border-radius:22px;box-shadow:7px 8px 0 #f4b4bc;overflow:hidden;text-align:left;width:100%;max-width:410px;margin:0 auto}
.mc-photo-side{position:relative;height:320px;min-height:0;min-width:0;background:#f8c5c8;padding:10px;border-bottom:2px solid #402d37}
.mc-photo-wrap{height:100%;min-height:0;border-radius:14px;overflow:hidden;position:relative;background:linear-gradient(140deg,#fce6dc,#e4abbd 75%);display:flex;align-items:center;justify-content:center}
.mc-photo-wrap img.mc-photo{display:block;width:100%;height:100%;position:absolute;inset:0;z-index:2;object-position:center center;object-fit:contain}
.mc-photo-wrap img.mc-backdrop{z-index:1;object-fit:cover;width:100%;height:100%;position:absolute;inset:0;filter:blur(25px) brightness(.9);transform:scale(1.1);opacity:.75}
.mc-nophoto{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;color:#965b6e;padding:20px}
.mc-nophoto img{width:130px;height:130px;border-radius:20px;object-fit:cover;border:2px solid #402d37;background:#fff9f0;box-shadow:3px 3px 0 #402d37}
.mc-nophoto span{font-size:12px;font-weight:700;line-height:1.8}
.mc-photo-label{position:absolute;left:19px;bottom:20px;background:#ffe6a2;padding:7px 12px;border:2px solid #402d37;border-radius:99px;transform:rotate(-5deg);font-size:11px;font-weight:900;box-shadow:3px 3px 0 #402d37;z-index:4}
.mc-spark{position:absolute;right:17px;top:16px;color:#fff6be;font-size:35px;text-shadow:2px 2px 0 #bd7185;pointer-events:none;z-index:4}
.mc-nav{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;z-index:5;background:#fffcf2df;padding:5px 8px;border:1.5px solid #402d37;border-radius:30px;box-shadow:2px 2px 0 #402d37}
.mc-nav button{cursor:pointer;border:0;background:transparent;font-size:19px;min-width:25px;color:#402d37;font-weight:900;padding:2px 7px}
.mc-nav .mc-count{white-space:nowrap;font-size:11px;font-weight:850;min-width:34px;text-align:center}
.mc-content{padding:18px 22px;display:flex;flex-direction:column;min-width:0}
.mc-micro{display:flex;align-items:center;gap:8px;font-weight:900;font-size:10px;letter-spacing:1.4px;color:#e98290}
.mc-micro:before{content:"";width:23px;height:2px;background:currentColor}
.mc-name{font-family:Georgia,"Songti SC",serif;font-size:27px;margin:7px 0 4px;line-height:1.12;letter-spacing:-1px}
.mc-name .mc-code{background:linear-gradient(90deg,#F97028,#F489A3);-webkit-background-clip:text;background-clip:text;color:transparent;margin-left:8px}
.mc-sub{font-size:12px;color:#806b75;margin:0 0 10px;line-height:1.5}
.mc-rule{height:1.5px;background:repeating-linear-gradient(90deg,#ecc1c7 0 6px, transparent 6px 12px);margin-bottom:12px}
.mc-section{margin:0 0 11px}
.mc-section + .mc-section{padding-top:10px;border-top:1px dashed #e6cbd0}
.mc-label{font-size:11px;font-weight:950;letter-spacing:1px;color:#c56c7f;margin-bottom:5px}
.mc-bio{font-size:13px;line-height:1.65;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#402d37}
.mc-footer{margin-top:5px;border-top:1px solid #ead6d7;padding-top:10px;display:flex;justify-content:space-between;gap:12px;align-items:center}
.mc-quote{font-family:Georgia,"Songti SC",serif;font-style:italic;font-size:11px;line-height:1.5;color:#8b6674}
.mc-cupid{background:#fffcf7;border:1.5px solid #402d37;border-radius:50%;width:38px;height:38px;box-shadow:3px 3px 0 #402d37;flex:none;overflow:hidden}
.mc-cupid img{width:100%;height:100%;object-fit:cover}
`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function infoLine(p: CardPerson): string {
  return [
    p.city ? `📍 ${p.city}` : "",
    p.birthYear ? `${p.birthYear} 年生` : "",
    p.height ? `${p.height}cm` : "",
    p.mbti,
    p.job,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 无照片时的占位块：人格 avatar + 提示 */
function noPhotoInner(p: CardPerson): string {
  const type = p.typeCode && TYPES[p.typeCode] ? TYPES[p.typeCode] : null;
  const gender = p.gender ?? "女";
  return `<div class="mc-nophoto">${type ? `<img src="${esc(getAvatar(type, gender))}" alt=""/>` : ""}<span>很遗憾，该用户暂时没有上传照片哦～<br/>先看看 TA 的人格名片吧</span></div>`;
}

/** 名片内层 HTML。photoIdx=当前展示的照片；forExport 时隐藏翻页器。照片一律 contain 完整展示 + 模糊背景垫，不裁切 */
export function cardHtml(p: CardPerson, opts: { photoIdx?: number; forExport?: boolean; photoSrcs?: string[] } = {}): string {
  const type = p.typeCode && TYPES[p.typeCode] ? TYPES[p.typeCode] : null;
  const gender = p.gender ?? "女";
  const srcs = opts.photoSrcs ?? p.photos.map((ph) => ph.url);
  const idx = Math.min(opts.photoIdx ?? 0, Math.max(0, srcs.length - 1));
  const hasPhoto = srcs.length > 0;

  const photoInner = hasPhoto
    ? `<img class="mc-backdrop" src="${esc(srcs[idx])}" alt=""/><img class="mc-photo" src="${esc(srcs[idx])}" alt="个人照片"/>`
    : noPhotoInner(p);

  const nav =
    !opts.forExport && srcs.length > 1
      ? `<div class="mc-nav"><button type="button" data-mc-prev aria-label="上一张">‹</button><span class="mc-count">${idx + 1} / ${srcs.length}</span><button type="button" data-mc-next aria-label="下一张">›</button></div>`
      : "";

  const nameHtml = type
    ? `${esc(getMeme(type, gender))}<span class="mc-code">${esc(type.code)}</span>`
    : esc(p.name);

  const section = (label: string, text: string | null) =>
    text?.trim() ? `<section class="mc-section"><div class="mc-label">${label}</div><p class="mc-bio">${esc(text.trim())}</p></section>` : "";

  return `<main class="mc-card">
  <div class="mc-photo-side"><div class="mc-photo-wrap">${photoInner}</div><div class="mc-spark">✳</div><div class="mc-photo-label">✿ ${esc(p.name)}</div>${nav}</div>
  <div class="mc-content"><div class="mc-micro">本周同桌的TA</div><h2 class="mc-name">${nameHtml}</h2><p class="mc-sub">${esc(infoLine(p))}</p><div class="mc-rule"></div>
    ${section("自我介绍 · ABOUT ME", p.intro)}
    ${section("理想型 · MY TYPE", p.expectation)}
    ${section("恋爱中最看重 · WHAT MATTERS MOST", p.value)}
    <div class="mc-footer"><div class="mc-quote">“Life is better when we connect.”<br/>deskcupid.com</div><div class="mc-cupid"><img src="${esc(CUPID)}" alt="丘比特"/></div></div>
  </div>
</main>`;
}

/* ---------- 工具 ---------- */

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- PNG / JPEG 导出（SVG foreignObject，图片全部内联成 dataURL） ---------- */

export async function renderCardCanvas(p: CardPerson, photoIdx = 0): Promise<HTMLCanvasElement> {
  // 离屏渲染真实 DOM，拿到准确布局后再序列化
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:470px;pointer-events:none";
  const styleEl = document.createElement("style");
  styleEl.textContent = MATCH_CARD_CSS;
  host.appendChild(styleEl);
  const cardWrap = document.createElement("div");
  cardWrap.innerHTML = cardHtml(p, { photoIdx, forExport: true });
  host.appendChild(cardWrap);
  document.body.appendChild(host);
  try {
    const card = cardWrap.firstElementChild as HTMLElement;
    // 等图片加载：img.decode() 在部分 headless 环境下永不 settle，用 onload/onerror + 超时兜底
    await Promise.all(
      [...card.querySelectorAll("img")].map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            const t = setTimeout(resolve, 8000);
            img.onload = () => { clearTimeout(t); resolve(); };
            img.onerror = () => { clearTimeout(t); resolve(); };
          }),
      ),
    );
    const w = card.offsetWidth;
    const h = card.offsetHeight;

    // 克隆并把图片全部换成 dataURL（SVG 里的外部图片会导致画布污染/不渲染）
    const clone = card.cloneNode(true) as HTMLElement;
    const srcImgs = [...card.querySelectorAll("img")];
    const cloneImgs = [...clone.querySelectorAll("img")];
    await Promise.all(
      cloneImgs.map(async (cimg, i) => {
        try {
          cimg.setAttribute("src", await toDataUrl(srcImgs[i].currentSrc || srcImgs[i].src));
        } catch {
          cimg.remove();
        }
      }),
    );
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const xhtml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><style>${MATCH_CARD_CSS}</style>${xhtml}</foreignObject></svg>`;
    // 必须 data: URL：blob: URL 加载含 foreignObject 的 SVG 在 Chrome 会污染画布导致无法导出
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("卡片渲染失败"));
      i.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff9f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    host.remove();
  }
}

export async function downloadCardImage(p: CardPerson, format: "png" | "jpeg", photoIdx = 0): Promise<void> {
  const canvas = await renderCardCanvas(p, photoIdx);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, format === "png" ? "image/png" : "image/jpeg", 0.92));
  if (!blob) throw new Error("导出图片失败");
  download(URL.createObjectURL(blob), `匹配卡片_${p.name}.${format === "png" ? "png" : "jpg"}`);
}

/* ---------- 自包含 HTML 导出（照片内嵌，多图可翻页，浏览器可另存 PDF） ---------- */

export async function downloadCardHtml(p: CardPerson): Promise<void> {
  // 照片内嵌为 dataURL，离线也能打开
  const srcs: string[] = [];
  for (const ph of p.photos.slice(0, 9)) {
    try {
      srcs.push(await toDataUrl(ph.url));
    } catch {
      /* 拉不到的照片跳过 */
    }
  }
  let cupidSrc = CUPID;
  try {
    cupidSrc = await toDataUrl(CUPID);
  } catch {
    /* 保留相对路径 */
  }
  const navScript =
    srcs.length > 1
      ? `<script>(function(){var srcs=${JSON.stringify(srcs).replace(/</g, "\\u003c")},cur=0;
var photo=document.getElementById('mcPhoto'),backdrop=document.getElementById('mcBackdrop'),count=document.getElementById('mcCount');
function render(){photo.src=srcs[cur];if(backdrop)backdrop.src=srcs[cur];count.textContent=(cur+1)+' / '+srcs.length;}
document.querySelector('[data-mc-prev]').onclick=function(){cur=(cur-1+srcs.length)%srcs.length;render()};
document.querySelector('[data-mc-next]').onclick=function(){cur=(cur+1)%srcs.length;render();}})();</script>`
      : "";

  const photoInner = srcs.length
    ? `<img id="mcBackdrop" class="mc-backdrop" src="${srcs[0]}" alt=""/><img id="mcPhoto" class="mc-photo" src="${srcs[0]}" alt="个人照片"/>`
    : noPhotoInner(p);
  const nav =
    srcs.length > 1
      ? `<div class="mc-nav"><button type="button" data-mc-prev>‹</button><span class="mc-count" id="mcCount">1 / ${srcs.length}</span><button type="button" data-mc-next>›</button></div>`
      : "";

  const type = p.typeCode && TYPES[p.typeCode] ? TYPES[p.typeCode] : null;
  const gender = p.gender ?? "女";
  const nameHtml = type ? `${esc(getMeme(type, gender))}<span class="mc-code">${esc(type.code)}</span>` : esc(p.name);
  const section = (label: string, text: string | null) =>
    text?.trim() ? `<section class="mc-section"><div class="mc-label">${label}</div><p class="mc-bio">${esc(text.trim())}</p></section>` : "";

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>匹配卡片 · ${esc(p.name)}</title>
<style>
body{margin:0;min-height:100vh;background:#fff9f0;background-image:radial-gradient(#eec8cf 1px, transparent 1px);background-size:24px 24px;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px}
@media print{body{background:#fff}.mc-card{box-shadow:none;border:1px solid #888}}
${MATCH_CARD_CSS}
</style></head><body>
<main class="mc-card">
  <div class="mc-photo-side"><div class="mc-photo-wrap">${photoInner}</div><div class="mc-spark">✳</div><div class="mc-photo-label">✿ ${esc(p.name)}</div>${nav}</div>
  <div class="mc-content"><div class="mc-micro">本周同桌的TA</div><h2 class="mc-name">${nameHtml}</h2><p class="mc-sub">${esc(infoLine(p))}</p><div class="mc-rule"></div>
    ${section("自我介绍 · ABOUT ME", p.intro)}
    ${section("理想型 · MY TYPE", p.expectation)}
    ${section("恋爱中最看重 · WHAT MATTERS MOST", p.value)}
    <div class="mc-footer"><div class="mc-quote">“Life is better when we connect.”<br/>deskcupid.com</div><div class="mc-cupid"><img src="${esc(cupidSrc)}" alt="丘比特"/></div></div>
  </div>
</main>
${navScript}
</body></html>`;
  download(URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })), `匹配卡片_${p.name}.html`);
}
