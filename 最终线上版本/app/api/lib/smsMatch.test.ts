import { describe, expect, it } from "vitest";
import {
  SMS_TEXT,
  applyInboundSms,
  bothAcceptedSms,
  classifySms,
  forwardSms,
  fridayConfirmSms,
  wednesdayAirdropSms,
  type SmsPair,
} from "./smsMatch";

const day = "2026-09-23";

function pair(extra?: Partial<SmsPair>): SmsPair {
  return {
    manReply: null,
    womanReply: null,
    manNoteDays: [],
    womanNoteDays: [],
    manPhone: "13800000001",
    womanPhone: "13800000002",
    manWechat: "man_wx",
    womanWechat: "woman_wx",
    ...extra,
  };
}

describe("sms match", () => {
  it("classifies confirmation keywords without treating them as notes", () => {
    expect(classifySms("【匹配】")).toBe("yes");
    expect(classifySms("匹配")).toBe("yes");
    expect(classifySms("【不匹配】")).toBe("no");
    expect(classifySms("不匹配")).toBe("no");
    expect(classifySms("今晚见吗")).toBe("note");
    expect(classifySms("今天匹配吗")).toBe("note");
  });

  it("wednesday sms introduces the partner and the three daily notes", () => {
    const text = wednesdayAirdropSms("1998 年生，北京");
    expect(text).toContain("1998");
    expect(text).not.toMatch(/林夏|张三|编号|U\d+/);
    expect(text).toContain("周三、周四、周五各有一条");
    expect(text).toContain("直接回复此号码");
    expect(text).toContain("每天一次机会");
  });

  it("forwards one Wednesday note and blocks a second the same day", () => {
    const first = applyInboundSms(pair(), "13800000001", "今晚有空吗", day, true);
    expect(first.outbound.map((item) => item.text)).toEqual([
      SMS_TEXT.noteOk,
      forwardSms("今晚有空吗"),
    ]);
    expect(first.pair.manNoteDays).toEqual([day]);
    expect(first.pair.womanNoteDays).toEqual([]);

    const second = applyInboundSms(first.pair, "13800000001", "再补一句", day, true);
    expect(second.outbound).toEqual([{ to: "13800000001", text: SMS_TEXT.noteUsed }]);
    expect(second.pair.manNoteDays).toEqual([day]);
  });

  it("a Friday note still uses the daily quota, while 匹配 does not", () => {
    const noted = applyInboundSms(pair(), "13800000002", "周五也想说一句", "2026-09-25", true);
    expect(noted.outbound[0].text).toBe(SMS_TEXT.noteOk);
    const confirm = applyInboundSms(noted.pair, "13800000002", "【匹配】", "2026-09-25", true);
    expect(confirm.outbound.map((item) => item.text)).toEqual([SMS_TEXT.matchYes]);
    expect(confirm.pair.womanNoteDays).toEqual(["2026-09-25"]);
    expect(confirm.pair.womanReply).toBe("yes");
    expect(confirm.outbound.some((item) => item.text.includes("woman_wx") || item.text.includes("man_wx"))).toBe(false);
  });

  it("reveals WeChat only after both reply 匹配", () => {
    const man = applyInboundSms(pair(), "13800000001", "匹配", day, true);
    expect(man.outbound.map((item) => item.text)).toEqual([SMS_TEXT.matchYes]);
    const both = applyInboundSms(man.pair, "13800000002", "【匹配】", day, true);
    expect(both.outbound.map((item) => item.text)).toEqual([
      SMS_TEXT.matchYes,
      bothAcceptedSms("man_wx"),
      bothAcceptedSms("woman_wx"),
    ]);
    expect(both.outbound[1].to).toBe("13800000002");
    expect(both.outbound[2].to).toBe("13800000001");
  });

  it("does not reveal WeChat when one person declines", () => {
    const yes = applyInboundSms(pair(), "13800000001", "【匹配】", day, true);
    const no = applyInboundSms(yes.pair, "13800000002", "【不匹配】", day, true);
    expect(no.outbound.map((item) => item.text)).toEqual([SMS_TEXT.matchNo, SMS_TEXT.partnerDeclined]);
    expect(no.outbound.every((item) => !item.text.includes("man_wx") && !item.text.includes("woman_wx"))).toBe(true);
    expect(no.pair.manReply).toBe("yes");
    expect(no.pair.womanReply).toBe("no");
  });

  it("friday prompt asks for the two keywords", () => {
    const text = fridayConfirmSms();
    expect(text).toContain("【匹配】");
    expect(text).toContain("【不匹配】");
  });
});
