package com.digivasity.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.digivasity.app.push.DigivasityNotificationChannels;
import com.digivasity.app.push.DigivasityPushPlugin;
import com.digivasity.app.push.DigivasityPushStore;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DigivasityPushPlugin.class);
        super.onCreate(savedInstanceState);
        FirebaseMessaging.getInstance()
            .subscribeToTopic("news-updates")
            .addOnSuccessListener(unused -> Log.d("DigivasityPush", "Subscribed to news-updates from MainActivity"))
            .addOnFailureListener(error -> Log.e("DigivasityPush", "Failed to subscribe to news-updates from MainActivity", error));
        DigivasityNotificationChannels.ensureNewsChannel(this);
        normalizeIntentExtras(getIntent());
        DigivasityPushStore.saveLaunchIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        normalizeIntentExtras(intent);
        if (DigivasityPushStore.saveLaunchIntent(this, intent)) {
            Intent broadcast = new Intent(DigivasityPushStore.ACTION_NOTIFICATION_OPENED);
            broadcast.setPackage(getPackageName());
            sendBroadcast(broadcast);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        DigivasityNotificationChannels.ensureNewsChannel(this);
    }

    private void normalizeIntentExtras(Intent intent) {
        if (intent == null || intent.getExtras() == null) {
            return;
        }

        if (intent.hasExtra("push_data_json")) {
            return;
        }

        Bundle extras = intent.getExtras();
        boolean hasInterestingRawKeys =
            extras.containsKey("view") ||
            extras.containsKey("deepLink") ||
            extras.containsKey("newsId") ||
            extras.containsKey("slug") ||
            extras.containsKey("title") ||
            extras.containsKey("body");

        if (!hasInterestingRawKeys) {
            return;
        }

        try {
            JSONObject dataJson = new JSONObject();
            for (String key : extras.keySet()) {
                Object value = extras.get(key);
                if (value != null) {
                    dataJson.put(key, String.valueOf(value));
                }
            }

            intent.putExtra("push_data_json", dataJson.toString());

            if (intent.hasExtra("view") && !intent.hasExtra("push_view")) {
                intent.putExtra("push_view", intent.getStringExtra("view"));
            }

            if (intent.hasExtra("deepLink") && !intent.hasExtra("push_deep_link")) {
                intent.putExtra("push_deep_link", intent.getStringExtra("deepLink"));
            }

            if (intent.hasExtra("title") && !intent.hasExtra("push_title")) {
                intent.putExtra("push_title", intent.getStringExtra("title"));
            }

            if (intent.hasExtra("body") && !intent.hasExtra("push_body")) {
                intent.putExtra("push_body", intent.getStringExtra("body"));
            }

            if (intent.hasExtra("category") && !intent.hasExtra("push_category")) {
                intent.putExtra("push_category", intent.getStringExtra("category"));
            }
        } catch (Exception e) {
            android.util.Log.e("DigivasityPush", "Failed to normalize intent extras from background system push", e);
        }
    }

    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
            return;
        }

        moveTaskToBack(true);
    }
}
