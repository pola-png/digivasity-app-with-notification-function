import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isAllowlistedAdminEmail, isAdminUserLike } from '../../lib/admin';
import { useAuth } from '../AppwriteProvider';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const [status, setStatus] = useState<'loading' | 'authorized' | 'unauthorized'>('loading');
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      setStatus('loading');
      return;
    }

    if (!user) {
      setStatus('unauthorized');
      return;
    }

    const adminCandidate = {
      role: userData?.role,
      admin: userData?.admin,
      email: user.email,
      emailVerified: user.emailVerification,
    };
    const isFallbackAdmin = isAllowlistedAdminEmail(user.email) && user.emailVerification;
    if (isAdminUserLike(adminCandidate) || isFallbackAdmin) {
      setStatus('authorized');
    } else {
      setStatus('unauthorized');
    }
  }, [loading, user, userData]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#2D1B14]">
        <Loader2 className="animate-spin text-brand-orange w-10 h-10" />
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#2D1B14]">
        <div className="text-center">
          <h1 className="text-3xl font-black text-white mb-4">Access Denied</h1>
          <p className="text-white/40 text-sm">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
