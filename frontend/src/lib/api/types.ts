export type Profile = {
  id: string;
  displayName: string;
  bio: string;
  calling: string;
  city: string;
  interests: string[];
  avatar: string;
};

export type MatchResult = {
  profileId: string;
  score: number;
  reasonShort: string;
};

export type MatchJobStatus = "pending" | "running" | "completed" | "failed";

export type MatchJob = {
  id: string;
  status: MatchJobStatus;
  prompt: string;
  result: MatchResult[];
  errorCode?: string;
};

export type EchoPayload = {
  profileId: string;
  score: number;
  frequencyMatch: string;
  sharedSilence: string;
  essence: string[];
};
