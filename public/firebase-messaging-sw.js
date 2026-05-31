/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDmo51jDkFz24XcuE1p1nA0a_J4memXEIs',
  authDomain: 'intense-climber-400415.firebaseapp.com',
  projectId: 'intense-climber-400415',
  storageBucket: 'intense-climber-400415.firebasestorage.app',
  messagingSenderId: '984329853365',
  appId: '1:984329853365:web:211d876e8def60ce7fa1fc',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'Digivasity';
  const options = {
    body: payload?.notification?.body || payload?.data?.body || '',
    icon: '/icon-192.png',
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});
