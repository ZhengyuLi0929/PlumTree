// 「我的信箱」通知系统：系统事件 → 丘比特聊天框推送一条通知（notify=1），
// 未读数以红色徽标显示在「我的信箱」tab 上。
// 触发分两类：即时事件（小纸条/约会邀请/邀请被拒）写库即发；
// 节点提醒（周二参加提示、三四五递纸条、周五见面确认、周一二回访）在 memberNotifications 读取时懒生成，按 tag+dayKey 去重。
import { and, eq } from "drizzle-orm";
import { profiles, webMessages } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";
import { cstDayKey } from "./smsMatch";
import { participatesThisWeek } from "./botStore";

/** 文案统一尾巴：提示到对应区域操作 */
const TAIL = "请及时在网页相应区域进行操作哦～";

export const NOTIFY_TEXT = {
  note: `💌 叮咚～TA 刚给你递了一张小纸条！说了什么甜话呢？快去「小纸条」看看吧。${TAIL}`,
  noteOpen: `☀️ 早上好呀！今天可以给本周的同桌递小纸条啦，每天一张，说点有趣的事吧～${TAIL}`,
  invite: `💘 哇哦！TA 向你发出了一个约会邀请！快去看看时间和地点合不合心意～${TAIL}`,
  inviteAccepted: `🎉 好耶！TA 接受了你的约会邀请！这周的约会就这么定啦，记得准时到哦～${TAIL}`,
  inviteRejected: `TA 婉拒了这一版约会邀请。别气馁，换个时间或地方再发一版吧～${TAIL}`,
  tuePrompt: `新的一周开始啦！🎈 本周三的约会匹配马上开始，先去打开「参加本周约会」的开关，填好想去的地点、活动和有空的时间哦～${TAIL}`,
  friConfirm: `今天周五啦！🖐️ 聊了几天，快去做个决定：本周想和 TA 见面吗？${TAIL}`,
  feedback: `上周的约会怎么样呀？⭐ 来「约会回访」评个星、聊聊感受吧，你的意见对我们超重要！${TAIL}`,
} as const;

/** 发一条系统通知（进丘比特聊天框，notify=1 计入未读徽标） */
export async function notifyUser(profileId: number, text: string, tag?: string, dayKey?: string) {
  await ensureTable();
  await getDb().insert(webMessages).values({
    fromProfileId: profileId,
    toProfileId: profileId,
    kind: "bot",
    content: text,
    notify: 1,
    tag: tag ?? null,
    dayKey: dayKey ?? cstDayKey(),
  });
}

/** 未读通知数：notify=1 且晚于 notify_read_at */
export async function unreadNotificationCount(profile: { id: number; notifyReadAt: Date | null }): Promise<number> {
  await ensureTable();
  const rows = await getDb()
    .select()
    .from(webMessages)
    .where(and(eq(webMessages.fromProfileId, profile.id), eq(webMessages.notify, 1)));
  return rows.filter((r) => !profile.notifyReadAt || r.createdAt > profile.notifyReadAt).length;
}

export async function markNotificationsRead(profileId: number) {
  await ensureTable();
  await getDb().update(profiles).set({ notifyReadAt: new Date() }).where(eq(profiles.id, profileId));
}

/** 节点提醒（懒生成、幂等）：周二参加提示 / 周三四五递纸条 / 周五见面确认 / 周一二回访 */
export async function runDailyTriggers(profile: {
  id: number;
  simDate: string | null;
  datePrefs: string | null;
  notifyReadAt: Date | null;
}) {
  const { effectiveNow, myActiveMatch, simDow } = await import("./webMember");
  const now = effectiveNow(profile);
  const dow = simDow(profile) ?? new Date(Date.now() + 8 * 3600 * 1000).getUTCDay();
  const dayKey = cstDayKey(now);
  await ensureTable();
  const db = getDb();
  const sentToday = new Set(
    (
      await db
        .select({ tag: webMessages.tag })
        .from(webMessages)
        .where(and(eq(webMessages.fromProfileId, profile.id), eq(webMessages.notify, 1), eq(webMessages.dayKey, dayKey)))
    )
      .map((r) => r.tag)
      .filter((t): t is string => Boolean(t)),
  );
  const match = await myActiveMatch(profile);

  if (dow === 2 && !sentToday.has("tue-prompt") && !participatesThisWeek(profile.datePrefs)) {
    await notifyUser(profile.id, NOTIFY_TEXT.tuePrompt, "tue-prompt", dayKey);
  }
  if ([3, 4, 5].includes(dow) && match && !sentToday.has("note-open")) {
    await notifyUser(profile.id, NOTIFY_TEXT.noteOpen, "note-open", dayKey);
  }
  if (dow === 5 && match && ["sent", "chatting"].includes(match.state) && !sentToday.has("fri-confirm")) {
    const myReply = match.manProfileId === profile.id ? match.manReply : match.womanReply;
    if (!myReply) await notifyUser(profile.id, NOTIFY_TEXT.friConfirm, "fri-confirm", dayKey);
  }
  if ([1, 2].includes(dow) && match && ["dating", "confirmed"].includes(match.state) && !sentToday.has("feedback")) {
    await notifyUser(profile.id, NOTIFY_TEXT.feedback, "feedback", dayKey);
  }
}
