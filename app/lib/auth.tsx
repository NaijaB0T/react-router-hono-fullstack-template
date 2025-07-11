import { createContext, useContext, useEffect, useState } from "react";

const AUTH_BASE_URL = "https://openauth-template.femivideograph.workers.dev";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  register: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      // Only check localStorage in the browser
      if (typeof window !== "undefined") {
        const userData = localStorage.getItem("auth_user");
        if (userData) {
          setUser(JSON.parse(userData));
        }
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_user");
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    // Redirect to OpenAuth login
    const authUrl = new URL(`${AUTH_BASE_URL}/password/authorize`);
    authUrl.searchParams.set("client_id", "naijasender-webapp");
    authUrl.searchParams.set("redirect_uri", window.location.origin + "/auth/callback");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", "login");
    
    window.location.href = authUrl.toString();
  };

  const register = () => {
    // Redirect to OpenAuth registration
    const authUrl = new URL(`${AUTH_BASE_URL}/password/register`);
    authUrl.searchParams.set("client_id", "naijasender-webapp");
    authUrl.searchParams.set("redirect_uri", window.location.origin + "/auth/callback");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", "register");
    
    window.location.href = authUrl.toString();
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_user");
    }
    setUser(null);
  };

  // Function to set user after successful auth
  const setAuthUser = (userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem("auth_user", JSON.stringify(userData));
  };

  useEffect(() => {
    checkAuth();
    
    // Listen for storage changes (including from other tabs or manual updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_user') {
        if (e.newValue) {
          try {
            setUser(JSON.parse(e.newValue));
          } catch (error) {
            console.error('Error parsing user data from storage:', error);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}