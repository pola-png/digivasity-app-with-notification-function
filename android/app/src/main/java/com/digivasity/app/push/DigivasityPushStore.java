package com.digivasity.app.push;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import org.json.JSONException;
import org.json.JSONObject;

public final class DigivasityPushStore {
    static final String PREFS_NAME = "digivasity_push_notifications";
    static final String KEY_LAUNCH_NOTIFICATION = "launch_notification";
    static final String KEY_LATEST_TOKEN = "latest_token";
    static final String ACTION_TOKEN_REFRESHED = "com.digivasity.app.PUSH_TOKEN_REFRESHED";
    public static final String ACTION_NOTIFICATION_OPENED = "com.digivasity.app.PUSH_NOTIFICATION_OPENED";

    static final String EXTRA_TITLE = "push_title";
    static final String EXTRA_BODY = "push_body";
    static final String EXTRA_CATEGORY = "push_category";
    static final String EXTRA_VIEW = "push_view";
    static final String EXTRA_DEEPLINK = "push_deep_link";
    static final String EXTRA_DATA_JSON = "push_data_json";

    private DigivasityPushStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void saveToken(Context context, String token) {
        prefs(context).edit().putString(KEY_LATEST_TOKEN, token).apply();
    }

    public static String getToken(Context context) {
        return prefs(context).getString(KEY_LATEST_TOKEN, null);
    }

    public static void clearLaunchNotification(Context context) {
        prefs(context).edit().remove(KEY_LAUNCH_NOTIFICATION).apply();
    }

    public static JSONObject getLaunchNotification(Context context) {
        String raw = prefs(context).getString(KEY_LAUNCH_NOTIFICATION, null);
        if (raw == null) {
            return null;
        }

        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    public static boolean saveLaunchIntent(Context context, Intent intent) {
        if (intent == null) {
            return false;
        }

        Bundle extras = intent.getExtras();

        String title = getExtraOrFallback(intent, EXTRA_TITLE, "title");
        String body = getExtraOrFallback(intent, EXTRA_BODY, "body");
        String category = getExtraOrFallback(intent, EXTRA_CATEGORY, "category");
        String view = getExtraOrFallback(intent, EXTRA_VIEW, "view");
        String deepLink = getExtraOrFallback(intent, EXTRA_DEEPLINK, "deepLink");
        String dataJson = intent.getStringExtra(EXTRA_DATA_JSON);
        if (dataJson == null && extras != null) {
            dataJson = buildDataJsonFromExtras(extras);
        }

        boolean hasPayload =
            title != null ||
            body != null ||
            category != null ||
            view != null ||
            deepLink != null ||
            dataJson != null ||
            (extras != null && extras.containsKey(EXTRA_TITLE));

        if (!hasPayload) {
            return false;
        }

        JSONObject notification = new JSONObject();
        try {
            if (title != null) {
                notification.put("title", title);
            }
            if (body != null) {
                notification.put("body", body);
            }
            if (category != null) {
                notification.put("category", category);
            }
            if (view != null) {
                notification.put("view", view);
            }
            if (deepLink != null) {
                notification.put("deepLink", deepLink);
            } else if (intent.getDataString() != null) {
                notification.put("deepLink", intent.getDataString());
            }

            JSONObject data = new JSONObject();
            if (dataJson != null) {
                try {
                    data = new JSONObject(dataJson);
                } catch (JSONException ignored) {
                    data = new JSONObject();
                }
            }

            if (extras != null) {
                for (String key : extras.keySet()) {
                    Object value = extras.get(key);
                    if (value != null) {
                        data.put(key, String.valueOf(value));
                    }
                }
            }

            notification.put("data", data);
            prefs(context).edit().putString(KEY_LAUNCH_NOTIFICATION, notification.toString()).apply();
            return true;
        } catch (JSONException ignored) {
            // Ignore malformed payloads. The app can still continue normally.
            return false;
        }
    }

    private static String getExtraOrFallback(Intent intent, String preferredKey, String fallbackKey) {
        String preferredValue = intent.getStringExtra(preferredKey);
        if (preferredValue != null) {
            return preferredValue;
        }

        return intent.getStringExtra(fallbackKey);
    }

    private static String buildDataJsonFromExtras(Bundle extras) {
        JSONObject data = new JSONObject();
        try {
            for (String key : extras.keySet()) {
                Object value = extras.get(key);
                if (value != null) {
                    data.put(key, String.valueOf(value));
                }
            }
            return data.toString();
        } catch (JSONException e) {
            return null;
        }
    }
}
