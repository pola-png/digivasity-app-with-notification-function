import React, { useEffect, useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Loader2,
  Globe,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOrCreateWebPushToken, syncPushTokenForUser } from '../lib/webPush';
import {
  loginWithEmailPassword,
  logoutCurrentSession,
  registerWithEmailPassword,
  sendEmailVerification,
  sendPasswordRecovery,
  signInWithGoogleOAuth,
} from '../lib/appwriteAuth';
import { ensureCurrentUserProfile } from '../lib/appwriteClient';
import { useAuth } from './AppwriteProvider';

interface AuthProps {
  onSuccess: () => void;
  onBack?: () => void;
  initialMode?: 'login' | 'register' | 'verify' | 'forgot';
}

function formatAuthError(err: unknown) {
  if (err && typeof err === 'object') {
    const typedErr = err as {
      code?: string;
      message?: string;
      type?: string;
      response?: { message?: string };
    };

    const details = [typedErr.code, typedErr.type, typedErr.message, typedErr.response?.message]
      .filter(Boolean)
      .join(' | ');

    if (details) {
      return details;
    }
  }

  if (err instanceof Error) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return 'Authentication failed';
  }
}

function readLastVerificationSuccess() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem('digivasity:last-email-verification');
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { userId?: string; at?: string };
    if (!parsed.userId || !parsed.at) {
      return null;
    }

    const verifiedAt = new Date(parsed.at);
    if (Number.isNaN(verifiedAt.getTime())) {
      return null;
    }

    if (Date.now() - verifiedAt.getTime() > 1000 * 60 * 10) {
      window.localStorage.removeItem('digivasity:last-email-verification');
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function syncPushTokenAfterSignIn() {
  const token = await getOrCreateWebPushToken();
  if (!token) {
    return;
  }

  await syncPushTokenForUser(token);
}

export const Auth: React.FC<AuthProps> = ({ onSuccess, onBack, initialMode = 'login' }) => {
  const { refreshAuth } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot'>(initialMode);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'verify') {
      return;
    }

    const lastVerification = readLastVerificationSuccess();
    if (lastVerification) {
      setMode('login');
      setNotice('Your email was verified. You can continue signing in.');
    }
  }, [mode]);

  const [formData, setFormData] = useState({
    fullName: '',
    whatsapp: '',
    email: '',
    password: '',
  });

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'forgot') {
        if (!formData.email.trim()) {
          throw new Error('Enter the email address used for your account.');
        }

        await sendPasswordRecovery(formData.email.trim());
        setNotice('Password reset email sent. Check your inbox and spam folder.');
        setMode('login');
        return;
      }

      if (mode === 'register') {
        const registeredUser = await registerWithEmailPassword({
          email: formData.email.trim(),
          password: formData.password,
          fullName: formData.fullName.trim(),
        });

        await ensureCurrentUserProfile({
          uid: registeredUser.$id,
          email: registeredUser.email || formData.email.trim(),
          fullName: formData.fullName.trim(),
          displayName: formData.fullName.trim(),
          whatsapp: formData.whatsapp.trim() || undefined,
        });

        await syncPushTokenAfterSignIn().catch((pushError) => {
          console.warn('Push token sync after registration failed:', pushError);
        });

        await sendEmailVerification();
        setMode('verify');
        return;
      }

      const signedInUser = await loginWithEmailPassword(formData.email.trim(), formData.password);
      if (!signedInUser.emailVerification) {
        const lastVerification = readLastVerificationSuccess();
        if (lastVerification?.userId === signedInUser.$id) {
          await refreshAuth();
          setMode('login');
          setNotice('Your email was verified. You can continue signing in.');
          return;
        }

        await logoutCurrentSession();
        await refreshAuth();
        setMode('verify');
        setNotice('Your account is signed in, but email verification is still pending.');
        return;
      }

      await ensureCurrentUserProfile({
        uid: signedInUser.$id,
        email: signedInUser.email || formData.email.trim(),
        fullName: signedInUser.name || formData.fullName.trim(),
        displayName: signedInUser.name || formData.fullName.trim(),
        whatsapp: formData.whatsapp.trim() || undefined,
      });

      await syncPushTokenAfterSignIn().catch((pushError) => {
        console.warn('Push token sync after email sign-in failed:', pushError);
      });

      await refreshAuth();
      onSuccess();
    } catch (err) {
      console.error(err);
      const message = formatAuthError(err);

      if (message.toLowerCase().includes('user already exists')) {
        setError('User already exists. Please sign in.');
      } else if (message.toLowerCase().includes('invalid credentials') || message.toLowerCase().includes('not found')) {
        setError('Email or password is incorrect.');
      } else {
        setError(message || 'An error occurred during authentication.');
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await signInWithGoogleOAuth();
      if (typeof result === 'string' && result) {
        window.location.href = result;
      }
    } catch (err) {
      console.error('Google Auth Error:', err);
      setError(formatAuthError(err));
      setGoogleLoading(false);
    }
  };

  if (mode === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#2D1B14]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#4A2C21] rounded-[40px] p-10 border border-white/10 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-brand-orange/20 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="text-brand-orange w-10 h-10" />
          </div>
          <h2 className="text-3xl font-black text-white mb-4">Verify Your Email</h2>
          <p className="text-white/60 mb-8 leading-relaxed">
            Check your email for the verification link, then come back and continue.
          </p>
          <button
            onClick={() => setMode('login')}
            className="w-full bg-brand-orange hover:bg-brand-orange-light text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg shadow-brand-orange/20 uppercase tracking-widest"
          >
            I&apos;ve Verified, Continue
          </button>
          <button
            onClick={async () => {
              await logoutCurrentSession();
              await refreshAuth();
              setMode('login');
            }}
            className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all border border-white/5"
          >
            Sign Out / Try another account
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#2D1B14]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 bg-brand-orange rounded-2xl flex items-center justify-center shadow-xl shadow-brand-orange/20">
              <Globe className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">
            {mode === 'login' ? 'WELCOME BACK' : mode === 'forgot' ? 'RESET PASSWORD' : 'GET STARTED'}
          </h1>
          <p className="text-white/40 text-xs font-bold uppercase tracking-[0.2em]">
            {mode === 'login'
              ? 'Login to your account'
              : mode === 'forgot'
                ? 'Recover access to your account'
                : 'Create your Digivasity account'}
          </p>
        </div>

        <div className="bg-[#4A2C21] rounded-[40px] p-8 md:p-10 border border-white/10 shadow-2xl">
          {mode === 'register' && (
            <div className="mb-6 bg-brand-orange/10 border border-brand-orange/20 rounded-2xl p-4 flex items-center gap-3 text-brand-orange text-xs font-bold uppercase tracking-wider">
              <Sparkles size={16} className="shrink-0" />
              Register to get personalized assistance
            </div>
          )}
          {notice && (
            <div className="mb-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm font-medium text-green-300">
              {notice}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-500 text-sm font-medium"
                >
                  <AlertCircle size={18} className="shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-orange uppercase tracking-widest ml-4">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5" />
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="John Doe"
                      className="w-full bg-[#2D1B14] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-white focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all placeholder:text-white/10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-orange uppercase tracking-widest ml-4">WhatsApp Number</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5" />
                    <input
                      type="tel"
                      required
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="+234..."
                      className="w-full bg-[#2D1B14] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-white focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all placeholder:text-white/10"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-brand-orange uppercase tracking-widest ml-4">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@example.com"
                  className="w-full bg-[#2D1B14] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-white focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all placeholder:text-white/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-brand-orange uppercase tracking-widest ml-4">Password</label>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5" />
                <input
                  disabled={mode === 'forgot'}
                  type="password"
                  required={mode !== 'forgot'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-[#2D1B14] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-white focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all placeholder:text-white/10"
                />
              </div>
            </div>

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setNotice(null);
                }}
                className="block ml-auto text-xs font-bold uppercase tracking-widest text-white/40 hover:text-brand-orange transition-colors"
              >
                Forgot password?
              </button>
            )}

            <button
              type="submit"
              disabled={emailLoading || googleLoading}
              className="w-full bg-brand-orange hover:bg-brand-orange-light text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center disabled:opacity-50 transition-all shadow-lg shadow-brand-orange/20 uppercase tracking-widest mt-4"
            >
              {emailLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Login to Dashboard' : mode === 'forgot' ? 'Send Reset Email' : 'Create Account'}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {mode !== 'forgot' && (
            <>
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                  <span className="bg-[#4A2C21] px-4 text-white/20">Or continue with</span>
                </div>
              </div>

              <button
                onClick={handleGoogleAuth}
                disabled={emailLoading || googleLoading}
                className="w-full bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center transition-all border border-white/5"
              >
                {googleLoading ? (
                  <Loader2 className="animate-spin w-5 h-5 mr-3" />
                ) : (
                  <span className="mr-3 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#4285F4]">
                    G
                  </span>
                )}
                Google Account
              </button>
            </>
          )}

          <div className="mt-8 text-center space-y-4">
            <button
              onClick={() => {
                setNotice(null);
                if (mode === 'forgot') {
                  setMode('login');
                } else {
                  setMode(mode === 'login' ? 'register' : 'login');
                }
              }}
              className="text-white/40 hover:text-brand-orange text-xs font-bold uppercase tracking-widest transition-all block w-full"
            >
              {mode === 'login'
                ? "Don't have an account? Sign Up"
                : mode === 'forgot'
                  ? 'Back to Login'
                  : 'Already have an account? Login'}
            </button>

            {onBack && (
              <button
                onClick={onBack}
                className="text-white/40 hover:text-white text-xs font-bold uppercase tracking-widest transition-all block w-full py-2 border border-white/5 rounded-xl hover:bg-white/5"
              >
                Back to Home
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
