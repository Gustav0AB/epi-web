export type AuthResult<User> = {
  token: string;
  currentUser: User | null;
  mustChangePassword?: boolean;
};

export type AuthState<User> = {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isUserLoading: boolean;
  error: string | null;
  currentUser: User | null;
  mustChangePassword: boolean;
};

export type AuthStore<User, Credentials> = AuthState<User> & {
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  initCurrentUser: () => Promise<void>;
};
