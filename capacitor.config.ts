import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.digivasity.app',
  appName: 'Digivasity',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
      serverClientId: '984329853365-k7gomcelu31lu046qjcfgs4skb8n20ga.apps.googleusercontent.com',
    } as any,
  },
};

export default config;
