import { z } from "zod";
import { meProfile, profiles } from "./mockData";
import { type EchoPayload, type MatchJob, type MatchResult, type Profile } from "./types";

const jobs = new Map<string, MatchJob>();
let me: Profile = { ...meProfile };

const runBodySchema = z.object({ prompt: z.string().min(2).max(500) });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(input: string) {
  return input.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function score(profile: Profile, q: string): MatchResult {
  const haystack = `${profile.bio} ${profile.interests.join(" ")} ${profile.calling}`.toLowerCase();
  const seed = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((acc, token) => (haystack.includes(token) ? acc + 8 : acc + 2), 40);
  const capped = Math.min(98, Math.max(62, seed));

  return {
    profileId: profile.id,
    score: capped,
    reasonShort: `${profile.displayName} 在审美与节奏上与你更接近`,
  };
}

export async function upsertMyProfile(payload: Partial<Profile>) {
  await sleep(240);
  me = { ...me, ...payload };
  return me;
}

export async function getMyProfile() {
  await sleep(180);
  return me;
}

export async function getProfile(profileId: string) {
  await sleep(180);
  return profiles.find((item) => item.id === profileId) ?? null;
}

export async function runMatch(payload: { prompt: string }) {
  const input = runBodySchema.parse(payload);
  const id = crypto.randomUUID();
  jobs.set(id, { id, status: "pending", prompt: input.prompt, result: [] });

  void (async () => {
    await sleep(600);
    const running = jobs.get(id);
    if (!running) return;
    jobs.set(id, { ...running, status: "running" });
    await sleep(1800);

    const q = `${normalize(me.bio)}\n---\n${normalize(input.prompt)}`;
    const result = profiles.map((item) => score(item, q)).sort((a, b) => b.score - a.score);
    jobs.set(id, { id, status: "completed", prompt: input.prompt, result });
  })();

  return { job_id: id };
}

export async function getMatchJob(jobId: string) {
  await sleep(220);
  const data = jobs.get(jobId);
  if (!data) {
    return { id: jobId, status: "failed", prompt: "", result: [], errorCode: "JOB_NOT_FOUND" } as MatchJob;
  }
  return data;
}

export async function getEcho(profileId: string, prompt = ""): Promise<EchoPayload | null> {
  await sleep(400);
  const target = profiles.find((item) => item.id === profileId);
  if (!target) return null;

  const profileScore = score(target, `${normalize(me.bio)}\n---\n${normalize(prompt || "静而有深度的连接")}`).score;
  return {
    profileId,
    score: profileScore,
    frequencyMatch: "你们都偏好慢节奏、文本感与留白式沟通。",
    sharedSilence: "在沉默场景下依旧舒适，适合共同阅读、散步、听雨。",
    essence: ["审美倾向：宋式留白与克制", "气质类型：安静而细腻", "连接方式：偏好长文本深聊"],
  };
}
