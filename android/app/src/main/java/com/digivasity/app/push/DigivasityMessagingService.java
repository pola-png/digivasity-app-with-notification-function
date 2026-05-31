package com.digivasity.app.push;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.digivasity.app.MainActivity;
import com.digivasity.app.R;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.util.Map;
import java.util.Random;

public class DigivasityMessagingService extends FirebaseMessagingService {
    private static final String TAG = "DigivasityPush";
    private static final String NEWS_TOPIC = "news-updates";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.d(TAG, "FCM token refreshed: " + token);
        DigivasityPushStore.saveToken(this, token);
        subscribeToNewsTopic();

        Intent intent = new Intent(DigivasityPushStore.ACTION_TOKEN_REFRESHED);
        intent.setPackage(getPackageName());
        intent.putExtra("token", token);
        sendBroadcast(intent);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
        RemoteMessage.Notification notification = message.getNotification();
        String title = data.get("title");
        String body = data.get("body");
        if ((title == null || title.trim().isEmpty()) && notification != null && notification.getTitle() != null) {
            title = notification.getTitle();
        }
        if ((body == null || body.trim().isEmpty()) && notification != null && notification.getBody() != null) {
            body = notification.getBody();
        }
        if (title == null || title.trim().isEmpty()) {
            title = getString(R.string.app_name);
        }
        if (body == null) {
            body = "";
        }

        Log.d(TAG, "FCM message received: dataKeys=" + data.keySet() + ", hasNotification=" + (notification != null));
        DigivasityNotificationChannels.ensureNewsChannel(this);
        showNotification(title, body, data);
    }

    private void showNotification(String title, String body, Map<String, String> data) {
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) {
            Log.d(TAG, "Notifications disabled at OS level; skipping display.");
            return;
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        String deepLink = data.get("deepLink");
        String view = data.get("view");
        if (deepLink != null && !deepLink.trim().isEmpty()) {
            intent.setData(Uri.parse(deepLink));
        } else if (view != null && !view.trim().isEmpty()) {
            intent.setData(Uri.parse(getString(R.string.custom_url_scheme) + "://push?view=" + Uri.encode(view)));
        }

        intent.putExtra(DigivasityPushStore.EXTRA_TITLE, title);
        intent.putExtra(DigivasityPushStore.EXTRA_BODY, body);
        intent.putExtra(DigivasityPushStore.EXTRA_CATEGORY, data.get("category"));
        intent.putExtra(DigivasityPushStore.EXTRA_VIEW, view);
        intent.putExtra(DigivasityPushStore.EXTRA_DEEPLINK, deepLink);
        intent.putExtra(DigivasityPushStore.EXTRA_DATA_JSON, new JSONObject(data).toString());

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            new Random().nextInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | pendingIntentFlags()
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, DigivasityNotificationChannels.NEWS_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(this).notify(new Random().nextInt(Integer.MAX_VALUE), builder.build());
    }

    private int pendingIntentFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_IMMUTABLE
            : 0;
    }

    private void subscribeToNewsTopic() {
        com.google.firebase.messaging.FirebaseMessaging.getInstance()
            .subscribeToTopic(NEWS_TOPIC)
            .addOnSuccessListener(unused -> Log.d(TAG, "Subscribed to " + NEWS_TOPIC))
            .addOnFailureListener(error -> Log.e(TAG, "Failed to subscribe to " + NEWS_TOPIC, error));
    }
}
