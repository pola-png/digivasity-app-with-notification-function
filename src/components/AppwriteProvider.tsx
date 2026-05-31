import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentSessionUser } from '../lib/appwriteAuth';
import { ensureCurrentUserProfile } from '../lib/appwriteClient';
import type { AppwriteAuthUser } from '../lib/appwriteAuth';
import type { UserProfile } from '../lib/appwriteModels';

interface AuthContextType {
  user: AppwriteAuthUser | null;
  userData: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAuthReady: false,
  refreshAuth: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);

function getDisplayName(user: AppwriteAuthUser) {
  return (user.name || user.email || '').trim();
}

function getWhatsAppNumber(user: AppwriteAuthUser) {
  const prefs = user.prefs as Record<string, unknown> | undefined;
  const whatsapp = prefs?.whatsapp;
  return typeof whatsapp === 'string' && whatsapp.trim() ? whatsapp.trim() : undefined;
}

export const AppwriteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppwriteAuthUser | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const syncSession = async () => {
    setLoading(true);

    try {
      const currentUser = await getCurrentSessionUser();
      const displayName = getDisplayName(currentUser);
      const synced = await ensureCurrentUserProfile({
        uid: currentUser.$id,
        email: currentUser.email || null,
        fullName: displayName,
        displayName,
        whatsapp: getWhatsAppNumber(currentUser),
      });

      setUser(currentUser);
      setUserData(synced.user);
    } catch (error) {
      console.warn('Appwrite auth bootstrap failed:', error);
      setUser(null);
      setUserData(null);
    } finally {
      setLoading(false);
      setIsAuthReady(true);
    }
  };

  useEffect(() => {
    void syncSession();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) {
      return;
    }

    let cancelled = false;

    const refreshProfile = async () => {
      try {
        const displayName = getDisplayName(user);
        const synced = await ensureCurrentUserProfile({
          uid: user.$id,
          email: user.email || null,
          fullName: displayName,
          displayName,
          whatsapp: getWhatsAppNumber(user),
        });

        if (!cancelled) {
          setUserData(synced.user);
        }
      } catch (error) {
        console.warn('Failed to refresh Appwrite user profile:', error);
      }
    };

    void refreshProfile();
    const interval = window.setInterval(() => {
      void syncSession();
    }, 10 * 60 * 1000);

    const handleFocus = () => {
      void syncSession();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, isAuthReady]);

  return (
    <AuthContext.Provider value={{ user, userData, loading, isAuthReady, refreshAuth: syncSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = 'Something went wrong.';
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `Backend Error: ${parsedError.error} (${parsedError.operationType} on ${parsedError.path})`;
        }
      } catch {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#2D1B14] text-white text-center">
          <div className="max-w-md w-full glass-card p-10">
            <h2 className="text-2xl font-black mb-4">Application Error</h2>
            <p className="text-white/60 mb-8">{errorMessage}</p>
            <button onClick={() => window.location.reload()} className="orange-pill">
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
