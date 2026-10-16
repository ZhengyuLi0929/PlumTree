// 匹配卡片渲染：把「本周的同桌」卡片画到 canvas，导出 PNG/JPEG；也可以导出自包含 HTML。
// 全部走 Canvas 2D（可以用文档已加载的 ZCOOL KuaiLe 字体），图片同源 /api/photos/* 不会污染画布。
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

const C = {
  page: "#F3ECD2",
  card: "#FFFDF6",
  ink: "#121212",
  body: "#5a5347",
  faint: "#a3988a",
  orange: "#F97028",
  pink: "#F489A3",
  cream: "#FBF3E3",
  line: "#F3ECD2",
};

const W = 920; // 卡片宽（逻辑像素），导出 2x
const PAD = 64;
const DISPLAY = '"ZCOOL KuaiLe", "PingFang SC", sans-serif';
const TEXT = '"PingFang SC", "Hiragino Sans GB", sans-serif';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** 量出换行后的行数（不画） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function render(person: CardPerson): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  try {
    await document.fonts.load(`40px "ZCOOL KuaiLe"`);
  } catch {
    /* 字体加载失败就用后备字体 */
  }

  const type = person.typeCode && TYPES[person.typeCode] ? TYPES[person.typeCode] : null;
  const gender = person.gender ?? "女";
  const photos = person.photos.slice(0, 3);

  // 预加载图片
  const photoImgs = (await Promise.all(photos.map((p) => loadImage(p.url)))).filter((i): i is HTMLImageElement => i !== null);
  const avatarImg = type ? await loadImage(getAvatar(type, gender)) : null;

  // 量尺寸用的离屏 canvas
  const measure = document.createElement("canvas").getContext("2d")!;
  const maxText = W - PAD * 2;

  // ---- 第一遍：算高度 ----
  let y = PAD;
  y += 26 + 18; // 顶部品牌行
  y += 20; // 间距
  // 照片区
  const photoH = photos.length > 0 && photoImgs.length > 0 ? 280 : avatarImg ? 300 : 0;
  y += photoH ? photoH + 28 : 0;
  // 花名 + 四字母
  if (type) y += 64 + 12;
  // 基本信息行
  const infoLine = [
    person.birthYear ? `${person.birthYear} 年生` : "",
    person.city,
    person.job,
    person.height ? `${person.height}cm` : "",
    person.mbti,
  ]
    .filter(Boolean)
    .join(" · ");
  y += 30 + 24;

  measure.font = `26px ${TEXT}`;
  // 与下面 drawBlock 的实际占用保持一致：label 36 + 每行 40 + 块尾 20
  const blockH = (_label: string, text: string | null) => {
    if (!text?.trim()) return 0;
    const lines = wrapText(measure, text.trim(), maxText);
    return 36 + lines.length * 40 + 20;
  };
  const introH = blockH("自我介绍", person.intro);
  const expH = blockH("理想型", person.expectation);
  const valH = blockH("最看重", person.value);
  y += introH + expH + valH;
  y += 56; // footer 行
  y += 24; // 卡片底部留白

  const H = Math.ceil(y);
  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  // ---- 第二遍：正式绘制 ----
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, W, H);

  // 卡片底
  ctx.save();
  ctx.shadowColor = "rgba(18,18,18,0.10)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, 24, 24, W - 48, H - 48, 40);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.restore();

  const X = 24 + PAD - 24; // 内容左缘（卡片内边距）
  const CW = W - 48 - (PAD - 24) * 2; // 内容宽
  let cy = 24 + PAD - 8;

  // 品牌行
  ctx.font = `24px ${DISPLAY}`;
  ctx.fillStyle = C.orange;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("同桌的TA · 本周同桌", X, cy);
  // 名字放右上（管理员版需要区分是谁的卡）
  ctx.textAlign = "right";
  ctx.fillStyle = C.faint;
  ctx.font = `24px ${DISPLAY}`;
  ctx.fillText(person.name, X + CW, cy);
  ctx.textAlign = "left";
  cy += 26 + 20;

  // 照片区
  if (photoImgs.length > 0) {
    const n = photoImgs.length;
    const gap = 12;
    const th = 280;
    const tw = (CW - gap * (n - 1)) / n;
    photoImgs.forEach((img, i) => {
      const dx = X + i * (tw + gap);
      ctx.save();
      roundRect(ctx, dx, cy, tw, th, 24);
      ctx.clip();
      // cover 裁剪
      const scale = Math.max(tw / img.width, th / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, dx + (tw - dw) / 2, cy + (th - dh) / 2, dw, dh);
      ctx.restore();
    });
    cy += th + 28;
  } else if (avatarImg) {
    // 无照片：人格 avatar 居中 + 底部提示
    roundRect(ctx, X, cy, CW, 300, 24);
    ctx.fillStyle = C.cream;
    ctx.fill();
    const size = 200;
    const ax = X + (CW - size) / 2;
    const ay = cy + 28;
    ctx.save();
    roundRect(ctx, ax, ay, size, size, 28);
    ctx.clip();
    ctx.drawImage(avatarImg, ax, ay, size, size);
    ctx.restore();
    ctx.font = `20px ${TEXT}`;
    ctx.fillStyle = C.faint;
    ctx.textAlign = "center";
    ctx.fillText("很遗憾，该用户暂时没有上传照片哦～", X + CW / 2, cy + 268);
    ctx.textAlign = "left";
    cy += 300 + 28;
  }

  // 花名 + 四字母（渐变艺术字）
  if (type) {
    const meme = getMeme(type, gender);
    ctx.font = `44px ${DISPLAY}`;
    ctx.fillStyle = C.orange;
    ctx.fillText(meme, X, cy + 44);
    const memeW = ctx.measureText(meme).width;
    ctx.font = `52px ${DISPLAY}`;
    const grad = ctx.createLinearGradient(X + memeW + 20, 0, X + memeW + 20 + 240, 0);
    grad.addColorStop(0, C.orange);
    grad.addColorStop(1, C.pink);
    ctx.fillStyle = grad;
    ctx.fillText(type.code, X + memeW + 20, cy + 46);
    cy += 64 + 12;
  }

  // 基本信息行
  if (infoLine) {
    ctx.font = `24px ${TEXT}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(infoLine, X, cy + 24);
  }
  cy += 30 + 24;

  // 文本块（自我介绍 / 理想型 / 最看重）
  const drawBlock = (label: string, text: string | null) => {
    if (!text?.trim()) return;
    ctx.font = `22px ${DISPLAY}`;
    ctx.fillStyle = C.orange;
    ctx.fillText(label, X, cy + 22);
    cy += 26 + 10;
    ctx.font = `26px ${TEXT}`;
    ctx.fillStyle = C.body;
    for (const line of wrapText(ctx, text.trim(), CW)) {
      ctx.fillText(line, X, cy + 26);
      cy += 40;
    }
    cy += 20;
  };
  drawBlock("自我介绍", person.intro);
  drawBlock("理想型", person.expectation);
  drawBlock("最看重", person.value);

  // footer
  ctx.font = `20px ${TEXT}`;
  ctx.fillStyle = C.faint;
  ctx.textAlign = "center";
  ctx.fillText("同桌的TA · deskcupid.com", W / 2, H - 34);
  ctx.textAlign = "left";

  return canvas;
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/** 一键下载 PNG（默认）/ JPEG */
export async function downloadCardImage(person: CardPerson, format: "png" | "jpeg"): Promise<void> {
  const canvas = await render(person);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, format === "png" ? "image/png" : "image/jpeg", 0.92));
  if (!blob) throw new Error("导出图片失败");
  const url = URL.createObjectURL(blob);
  download(url, `匹配卡片_${person.name}.${format === "png" ? "png" : "jpg"}`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 预览用 dataURL（对话框里展示） */
export async function cardPreviewUrl(person: CardPerson): Promise<string> {
  const canvas = await render(person);
  return canvas.toDataURL("image/png");
}

/** 自包含 HTML 下载（浏览器打开后还能另存为 PDF） */
export function downloadCardHtml(person: CardPerson): void {
  const type = person.typeCode && TYPES[person.typeCode] ? TYPES[person.typeCode] : null;
  const gender = person.gender ?? "女";
  const infoLine = [
    person.birthYear ? `${person.birthYear} 年生` : "",
    person.city,
    person.job,
    person.height ? `${person.height}cm` : "",
    person.mbti,
  ]
    .filter(Boolean)
    .join(" · ");
  const abs = (u: string) => new URL(u, window.location.origin).href;
  const photoHtml =
    person.photos.length > 0
      ? `<div class="photos">${person.photos
          .slice(0, 3)
          .map((p) => `<img src="${abs(p.url)}" alt="">`)
          .join("")}</div>`
      : type
        ? `<div class="nophoto"><img src="${abs(getAvatar(type, gender))}" alt=""><p>很遗憾，该用户暂时没有上传照片哦～</p></div>`
        : "";
  const block = (label: string, text: string | null) =>
    text?.trim() ? `<div class="block"><p class="label">${label}</p><p class="text">${text.trim()}</p></div>` : "";
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>匹配卡片 · ${person.name}</title>
<style>
  body{margin:0;background:#F3ECD2;display:flex;justify-content:center;padding:40px 16px;font-family:"PingFang SC","Hiragino Sans GB",sans-serif}
  .card{width:100%;max-width:640px;background:#FFFDF6;border-radius:32px;padding:44px;box-shadow:0 8px 30px rgba(18,18,18,.08)}
  .brand{display:flex;justify-content:space-between;color:#F97028;font-size:15px;font-weight:700}
  .brand span:last-child{color:#a3988a}
  .photos{display:grid;grid-template-columns:repeat(${Math.min(3, Math.max(1, person.photos.length))},1fr);gap:10px;margin:24px 0}
  .photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:20px;background:#F3ECD2}
  .nophoto{background:#FBF3E3;border-radius:20px;text-align:center;padding:28px 0 16px;margin:24px 0}
  .nophoto img{width:150px;height:150px;border-radius:22px;object-fit:cover;background:#F3ECD2}
  .nophoto p{color:#a3988a;font-size:13px}
  .meme{color:#F97028;font-size:26px;font-weight:800}
  .code{font-size:34px;font-weight:800;background:linear-gradient(90deg,#F97028,#F489A3);-webkit-background-clip:text;background-clip:text;color:transparent;margin-left:10px}
  .info{color:#121212;font-size:15px;font-weight:600;margin:14px 0 4px}
  .block{margin-top:18px}
  .label{color:#F97028;font-size:14px;font-weight:700;margin:0 0 6px}
  .text{color:#5a5347;font-size:15px;line-height:1.8;margin:0;white-space:pre-wrap}
  .footer{text-align:center;color:#a3988a;font-size:12px;margin-top:32px}
</style></head><body>
<div class="card">
  <div class="brand"><span>同桌的TA · 本周同桌</span><span>${person.name}</span></div>
  ${photoHtml}
  ${type ? `<p style="margin:0 0 4px"><span class="meme">${getMeme(type, gender)}</span><span class="code">${type.code}</span></p>` : ""}
  <p class="info">${infoLine}</p>
  ${block("自我介绍", person.intro)}
  ${block("理想型", person.expectation)}
  ${block("最看重", person.value)}
  <p class="footer">同桌的TA · deskcupid.com</p>
</div>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  download(url, `匹配卡片_${person.name}.html`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
