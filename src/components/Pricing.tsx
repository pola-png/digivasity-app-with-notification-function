import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Check, 
  Zap, 
  Clock, 
  Calendar, 
  CreditCard, 
  Loader2,
  X,
  Sparkles
} from 'lucide-react';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { useAuth } from './AppwriteProvider';
import { syncCurrentUserProfile } from '../lib/appwriteClient';

interface PricingProps {
  onClose: () => void;
  userEmail: string;
  userName: string;
}

const PLANS = [
  {
    id: 'basic',
    name: 'Basic Pack',
    price: 1000,
    features: ['5 Search Credits', 'Valid for 24 Hours', 'Standard Support'],
    icon: Zap,
    color: 'bg-blue-500',
    credits: 5,
    type: 'credits'
  },
  {
    id: 'unlimited_3',
    name: 'Standard Pack',
    price: 5000,
    features: ['Unlimited Searches', '3 Full Days Validity', 'Priority Support', 'Access to all tools'],
    icon: Clock,
    color: 'bg-brand-orange',
    type: 'subscription',
    duration: 3
  },
  {
    id: 'unlimited_7',
    name: 'Exclusive Pack',
    price: 10000,
    features: ['Unlimited Searches', '7 Full Days Validity', 'Premium Support', 'Full AI Advisor Access'],
    icon: Calendar,
    color: 'bg-purple-500',
    type: 'subscription',
    duration: 7
  }
];

export const Pricing: React.FC<PricingProps> = ({ onClose, userEmail, userName }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<any>(null);
  const { user, userData, refreshAuth } = useAuth();

  const config = {
    public_key: import.meta.env.VITE_FLW_PUBLIC_KEY || '',
    tx_ref: Date.now().toString(),
    amount: activePlan?.price || 0,
    currency: 'NGN',
    payment_options: 'card,mobilemoney,ussd',
    customer: {
      email: userEmail,
      phone_number: '',
      name: userName,
    },
    customizations: {
      title: 'Digivasity Credits',
      description: `Payment for ${activePlan?.name}`,
    },
  };

  const handleFlutterPayment = useFlutterwave(config);

  const handlePayment = (plan: typeof PLANS[0]) => {
    setLoading(plan.id);
    setActivePlan(plan);
    
    // We need to wait for state update or just pass the plan specific info to handleFlutterPayment if possible
    // But useFlutterwave hook in flutterwave-react-v3 usually takes the config once.
    // Actually, the handleFlutterPayment function can take an override config.
    
    handleFlutterPayment({
      callback: async (response) => {
        console.log("Payment response:", response);
        if (response.status === "successful") {
          try {
            if (!user) {
              throw new Error('You must be signed in to activate a payment plan.');
            }

            const now = new Date();
            const currentCredits = userData?.credits ?? 0;
            const currentSubscription = userData?.subscription ?? { type: 'none', expiresAt: null };
            const nextCredits = plan.type === 'credits' ? currentCredits + (plan.credits || 0) : currentCredits;
            const nextSubscription =
              plan.type === 'subscription'
                ? {
                    type: plan.id,
                    expiresAt: new Date(now.getTime() + (plan.duration || 0) * 24 * 60 * 60 * 1000).toISOString(),
                  }
                : currentSubscription;

            await syncCurrentUserProfile({
              uid: user.$id,
              email: user.email || null,
              fullName: user.name || user.email || 'User',
              displayName: user.name || user.email || 'User',
              credits: nextCredits,
              subscription: nextSubscription,
              lastCreditRefresh: now.toISOString().split('T')[0],
            });

            await refreshAuth();
            window.location.reload();
          } catch (error) {
            console.error("Payment activation error:", error);
          }
        }
        closePaymentModal();
        setLoading(null);
      },
      onClose: () => {
        setLoading(null);
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-5xl w-full bg-[#4A2C21] rounded-[40px] p-8 md:p-12 border border-white/10 shadow-2xl relative my-8"
      >
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-brand-orange/10 text-brand-orange px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
            <Sparkles size={14} />
            Upgrade Your Experience
          </div>
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight">Choose Your Access Plan</h2>
          <p className="text-white/40 max-w-xl mx-auto">
            Get instant access to our AI-powered immigration tools and personalized advisor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <motion.div 
              key={plan.id}
              whileHover={{ y: -10 }}
              className="bg-[#2D1B14] rounded-3xl p-8 border border-white/5 flex flex-col relative group"
            >
              {plan.id === 'unlimited_3' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-orange text-white text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-lg">
                  Most Popular
                </div>
              )}
              
              <div className={`w-14 h-14 ${plan.color}/20 rounded-2xl flex items-center justify-center mb-6`}>
                <plan.icon className={`${plan.color.replace('bg-', 'text-')} w-7 h-7`} />
              </div>

              <h3 className="text-xl font-black text-white mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-black text-white">₦{plan.price.toLocaleString()}</span>
                <span className="text-white/40 text-sm font-bold">/ {plan.type === 'credits' ? 'pack' : 'access'}</span>
              </div>

              <div className="space-y-4 mb-8 flex-grow">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-white/60">
                    <div className="w-5 h-5 bg-white/5 rounded-full flex items-center justify-center shrink-0">
                      <Check size={12} className="text-brand-orange" />
                    </div>
                    {feature}
                  </div>
                ))}
              </div>

              <button 
                onClick={() => handlePayment(plan)}
                disabled={!!loading}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  plan.id === 'unlimited_3' 
                    ? 'bg-brand-orange text-white shadow-lg shadow-brand-orange/20 hover:bg-brand-orange-light' 
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                {loading === plan.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <>
                    <CreditCard size={18} />
                    Buy Now
                  </>
                )}
              </button>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <button 
            onClick={onClose}
            className="text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <X size={16} />
            No thanks, take me back to homepage
          </button>
        </div>

        <p className="text-center text-white/20 text-[10px] font-bold uppercase tracking-widest mt-12">
          Secure payment powered by Flutterwave. Instant activation.
        </p>
      </motion.div>
    </div>
  );
};
