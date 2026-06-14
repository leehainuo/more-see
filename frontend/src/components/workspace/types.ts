export type DisplayMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  streaming?: boolean;
  pending?: "user-transcribing" | "assistant-thinking";
};
