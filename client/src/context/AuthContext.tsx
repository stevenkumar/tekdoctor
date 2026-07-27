import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORAGE_KEYS } from '../config/storage';
import { ROUTES } from '../config/routes';

// All roles supported by the backend Users.role ENUM
export type UserRole = 'customer' | 'technician' | 'admin' | 'company';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: UserRole | null;
  login: (token: string, userData: AuthUser, skipNavigation?: boolean) => void;
  logout: () => void;
  isAuthenticated: boolean;
  hasRole: (requiredRoles: UserRole | UserRole[]) => boolean;
  fetchUser: (token: string) => Promise<void>;
  updateToken: (newToken: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const savedUser = sessionStorage.getItem(STORAGE_KEYS.USER);
      return savedUser ? (JSON.parse(savedUser) as AuthUser) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem(STORAGE_KEYS.TOKEN) || null;
  });
  const [role, setRole] = useState<UserRole | null>(() => {
    try {
      const savedUser = sessionStorage.getItem(STORAGE_KEYS.USER);
      return savedUser ? ((JSON.parse(savedUser) as AuthUser).role || null) : null;
    } catch { return null; }
  });
  const navigate = useNavigate();

  // Validate session from sessionStorage on mount and clear if broken
  useEffect(() => {
    try {
      const savedToken = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const savedUser = sessionStorage.getItem(STORAGE_KEYS.USER);

      if (savedToken && savedUser) {
        JSON.parse(savedUser); // dry parse test
      }
    } catch {
      // Corrupted sessionStorage — clear and start fresh
      sessionStorage.removeItem(STORAGE_KEYS.TOKEN);
      sessionStorage.removeItem(STORAGE_KEYS.USER);
      setUser(null); setToken(null); setRole(null);
    }
  }, []);

  /**
   * Call after a successful signup or signin.
   * userData must include { id, name, email, role } from result.data.
   */
  const login = (newToken: string, userData: AuthUser, skipNavigation: boolean = false) => {
    setToken(newToken);
    setUser(userData);
    setRole(userData.role);

    sessionStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
    sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));

    if (!skipNavigation) {
      // Admins go straight to the admin dashboard; technicians to their dashboard; companies to company dashboard; everyone else to repair booking
      if (userData.role === 'admin') {
        navigate(ROUTES.ADMIN_DASHBOARD);
      } else if (userData.role === 'technician') {
        navigate(ROUTES.TECHNICIAN_DASHBOARD);
      } else if (userData.role === 'company') {
        navigate(ROUTES.COMPANY_DASHBOARD);
      } else {
        navigate(ROUTES.REPAIR);
      }
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setRole(null);
    sessionStorage.removeItem(STORAGE_KEYS.TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.USER);
    navigate(ROUTES.SIGN_IN);
  };

  const updateToken = (newToken: string) => {
    setToken(newToken);
    sessionStorage.setItem(STORAGE_KEYS.TOKEN, newToken);
  };

  const hasRole = (requiredRoles: UserRole | UserRole[]): boolean => {
    if (!role) return false;
    return Array.isArray(requiredRoles)
      ? requiredRoles.includes(role)
      : role === requiredRoles;
  };

  const fetchUser = async (tokenVal: string) => {
    try {
      const savedUser = sessionStorage.getItem(STORAGE_KEYS.USER);
      if (savedUser) {
        setUser(JSON.parse(savedUser) as AuthUser);
      }
    } catch {
      // Ignored
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role,
        login,
        logout,
        isAuthenticated: !!token,
        hasRole,
        fetchUser,
        updateToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
