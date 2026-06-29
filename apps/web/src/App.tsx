import { useAuthStore } from "./store/auth.store";
import { UserList } from "./features/users/UserList";
import { LoginPage } from "./features/auth/LoginPage";

export default function App() {
  const { isAuthenticated, logout } = useAuthStore();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-gray-900">Epi Web</span>
          <button
            onClick={logout}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <UserList />
      </main>
    </div>
  );
}
