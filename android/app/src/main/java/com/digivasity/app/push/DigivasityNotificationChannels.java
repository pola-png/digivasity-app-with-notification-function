package com.digivasity.app.push;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

public final class DigivasityNotificationChannels {
    public static final String NEWS_CHANNEL_ID = "news_channel";
    private static final String NEWS_CHANNEL_NAME = "Digivasity Notifications";

    private DigivasityNotificationChannels() {}

    public static void ensureNewsChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(NEWS_CHANNEL_ID) != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            NEWS_CHANNEL_ID,
            NEWS_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifications for Digivasity account updates, reminders, and promotions.");
        manager.createNotificationChannel(channel);
    }
}
