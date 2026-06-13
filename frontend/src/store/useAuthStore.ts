import { create } from "zustand";

import { fetchMe, loginOrRegister, logout } from "@/lib/api";

type AuthStatus = "unknown" | "authenticated" | "anonymous";

type AuthState = {
  status: AuthStatus;
  userId: number | null;
  username: string | null;
  error: string | null;
  loadMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  userId: null,
  username: null,
  error: null,

  loadMe: async () => {
    try {
      const me = await fetchMe();
      set({
        status: "authenticated",
        userId: me.userId,
        error: null,
      });
    } catch {
      set({
        status: "anonymous",
        userId: null,
        username: null,
        error: null,
      });
    }
  },

  login: async (username, password) => {
    const result = await loginOrRegister(username, password);
    set({
      status: "authenticated",
      userId: result.userId,
      username: result.username,
      error: null,
    });
  },

  logout: async () => {
    await logout();
    set({
      status: "anonymous",
      userId: null,
      username: null,
      error: null,
    });
  },
}));

