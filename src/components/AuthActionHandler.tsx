import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { completeEmailVerification, completePasswordRecovery } from '../lib/appwriteAuth';
import { useAuth } from './AppwriteProvider';

type AuthActionMode = 'verifyEmail' | 'resetPassword' | null;

function readAuthAction() {
  if (typeof window === 'undefined') {
    return { mode: null as AuthActionMode, userId: '', secret: '' };
  }

  const url = new URL(window.location.href);
  const mode = url.searchParams.get('mode') as AuthActionMode;
  const userId = url.searchParams.get('userId') || '';
  const secret = url.searchParams.get('secret') || '';
  return { mode, userId, secret };
}

function readAuthActionFromUrl(urlValue: string) {
  try {
    const url = new URL(urlValue);
    const mode = url.searchParams.get('mode') as AuthActionMode;
    const userId = url.searchParams.get('userId') || '';
    const secret = url.searchParams.get('secret') || '';
    return { mode, userId, secret };
  } catch {
    return { mode: null as AuthActionMode, userId: '', secret: '' };
  }
}

function clearAuthActionParams() {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  url.searchParams.delete('userId');
  url.searchParams.delete('secret');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function openAppAfterAuth(action: 'verified' | 'password-reset') {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL('com.digivasity.app://auth');
  url.searchParams.set('status', action);
  window.location.href = url.toString();
}

function rememberVerificationSuccess(userId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem('digivasity:last-email-verification', JSON.stringify({
      userId,
      at: new Date().toISOString(),
    }));
  } catch {
    // Ignore storage failures.
  }
}

export const AuthActionHandler: React.FC = () => {
  const { refreshAuth } = useAuth();
  const [action, setAction] = useState(() => readAuthAction());
  const [loading, setLoading] = useState(action.mode === 'verifyEmail');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (action.mode === 'verifyEmail') {
      setLoading(true);
      return;
    }

    setLoading(false);
  }, [action.mode]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const appPlugin = (window as any)?.Capacitor?.Plugins?.App;
    if (!appPlugin?.addListener) {
      return;
    }

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const registerListener = async () => {
      try {
        listenerHandle = await appPlugin.addListener('appUrlOpen', ({ url }: { url?: string }) => {
          if (!url) {
            return;
          }

          setAction(readAuthActionFromUrl(url));
          setSuccess(null);
          setError(null);
        });
      } catch (listenerError) {
        console.warn('Failed to register App URL listener:', listenerError);
      }
    };

    void registerListener();

    return () => {
      if (listenerHandle) {
        void listenerHandle.remove().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (action.mode !== 'verifyEmail') {
      return;
    }

    if (!action.userId || !action.secret) {
      setLoading(false);
      setError('Invalid verification link.');
      return;
    }

    let cancelled = false;

    const runVerification = async () => {
      try {
        setLoading(true);
        await completeEmailVerification(action.userId, action.secret);
        await refreshAuth();
        if (!cancelled) {
          rememberVerificationSuccess(action.userId);
          setSuccess('Email verified successfully. You can continue using the app.');
          clearAuthActionParams();
          window.setTimeout(() => openAppAfterAuth('verified'), 1200);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Email verification failed:', err);
          setError(err instanceof Error ? err.message : 'Verification failed.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void runVerification();

    return () => {
      cancelled = true;
    };
  }, [action.mode, action.secret, action.userId, refreshAuth]);

  if (action.mode !== 'resetPassword') {
    if (loading) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2D1B14] px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full rounded-[32px] border border-white/10 bg-[#4A2C21] p-8 shadow-2xl"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-orange/20">
              <Loader2 className="h-8 w-8 animate-spin text-brand-orange" />
            </div>
            <h2 className="text-2xl font-black text-white">Verifying your email</h2>
            <p className="mt-3 text-sm text-white/60">
              We are finishing your verification link.
            </p>
          </motion.div>
        </div>
      );
    }

    if (success || error) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2D1B14] px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full rounded-[32px] border border-white/10 bg-[#4A2C21] p-8 shadow-2xl"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-orange/20">
              {success ? <CheckCircle2 className="h-8 w-8 text-brand-orange" /> : <ShieldCheck className="h-8 w-8 text-red-400" />}
            </div>
            <h2 className="text-2xl font-black text-white">
              {success ? 'Verification complete' : 'Verification failed'}
            </h2>
            <p className="mt-3 text-sm text-white/60">{success || error}</p>
          </motion.div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2D1B14] px-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full rounded-[32px] border border-white/10 bg-[#4A2C21] p-8 shadow-2xl"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-orange/20">
            <Lock className="h-8 w-8 text-brand-orange" />
          </div>
          <h2 className="text-2xl font-black text-white">Set a new password</h2>
          <p className="mt-3 text-sm text-white/60">
            Complete your password reset using the link from your email.
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!action.userId || !action.secret) {
              setError('Missing reset link details.');
              return;
            }

            setSubmitting(true);
            setError(null);
            setSuccess(null);

            try {
              await completePasswordRecovery(action.userId, action.secret, newPassword.trim());
              await refreshAuth();
              setSuccess('Password reset successfully. You can now sign in with your new password.');
              clearAuthActionParams();
              window.setTimeout(() => openAppAfterAuth('password-reset'), 1200);
            } catch (err) {
              console.error('Password recovery failed:', err);
              setError(err instanceof Error ? err.message : 'Password recovery failed.');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <label className="ml-4 text-[10px] font-bold uppercase tracking-widest text-brand-orange">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter your new password"
              className="w-full rounded-2xl border border-white/5 bg-[#2D1B14] px-5 py-4 text-white outline-none transition-all placeholder:text-white/10 focus:ring-2 focus:ring-brand-orange"
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex w-full items-center justify-center rounded-2xl bg-brand-orange py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-brand-orange/20 transition-all hover:bg-brand-orange-light disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Reset Password'}
          </button>
        </form>

        <div className="mt-6 text-center text-[10px] font-bold uppercase tracking-widest text-white/25">
          <Sparkles className="mr-1 inline-block h-3.5 w-3.5" />
          Secure verification flow
        </div>
      </motion.div>
    </div>
  );
};
