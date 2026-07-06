import { create } from 'zustand';

interface User {
  id: string;
  email?: string;
  full_name?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  role: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  setRole: (role: string) => void;
  logout: () => void;
}

const safeParseUser = (): User | null => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  user: safeParseUser(),
  token: localStorage.getItem('token'),
  role: localStorage.getItem('role'),

  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    set({ user });
  },
  setToken: (token) => {
    localStorage.setItem('token', token);
    set({ token });
  },
  setRole: (role) => {
    localStorage.setItem('role', role);
    set({ role });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    set({ user: null, token: null, role: null });
  },
}));

interface ThemeState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDarkMode: localStorage.getItem('theme') === 'dark',
  toggleDarkMode: () => set((state) => {
    const nextDark = !state.isDarkMode;
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { isDarkMode: nextDark };
  }),
  setDarkMode: (isDark) => set(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { isDarkMode: isDark };
  }),
}));
