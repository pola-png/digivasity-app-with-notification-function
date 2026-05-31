package com.digivasity.app.push;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

@CapacitorPlugin(
    name = "DigivasityPush",
    permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
    }
)
public class DigivasityPushPlugin extends Plugin {
    private static final String NEWS_TOPIC = "news-updates";
    private BroadcastReceiver broadcastReceiver;

    @Override
    public void load() {
        super.load();
        registerBroadcastReceiver();
    }

    @Override
    public void handleOnDestroy() {
        unregisterBroadcastReceiver();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("status", "granted");
            call.resolve(result);
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("status", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = getPermissionState("notifications") == PermissionState.GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("status", granted ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                DigivasityPushStore.saveToken(getContext(), token);
                android.util.Log.d("DigivasityPush", "FCM token: " + token);
                subscribeToNewsTopic(token);

                JSObject result = new JSObject();
                result.put("token", token);
                call.resolve(result);

                notifyListeners("pushTokenReceived", result, true);
            })
            .addOnFailureListener(error -> call.reject(error != null ? error.getMessage() : "Unable to fetch FCM token"));
    }

    @PluginMethod
    public void getLaunchNotification(PluginCall call) {
        JSONObject launchNotification = DigivasityPushStore.getLaunchNotification(getContext());
        JSObject result = new JSObject();
        if (launchNotification != null) {
            result.put("notification", launchNotification);
        } else {
            result.put("notification", JSONObject.NULL);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearLaunchNotification(PluginCall call) {
        DigivasityPushStore.clearLaunchNotification(getContext());
        call.resolve();
    }

    private void registerBroadcastReceiver() {
        if (broadcastReceiver != null) {
            return;
        }

        broadcastReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || intent.getAction() == null) {
                    return;
                }

                if (DigivasityPushStore.ACTION_TOKEN_REFRESHED.equals(intent.getAction())) {
                    String token = intent.getStringExtra("token");
                    if (token == null || token.isEmpty()) {
                        return;
                    }

                    JSObject result = new JSObject();
                    result.put("token", token);
                    notifyListeners("pushTokenReceived", result, true);
                    return;
                }

                if (DigivasityPushStore.ACTION_NOTIFICATION_OPENED.equals(intent.getAction())) {
                    JSONObject launchNotification = DigivasityPushStore.getLaunchNotification(getContext());
                    if (launchNotification == null) {
                        return;
                    }

                    JSObject result = new JSObject();
                    result.put("notification", launchNotification);
                    notifyListeners("pushNotificationActionPerformed", result, true);
                    DigivasityPushStore.clearLaunchNotification(getContext());
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(DigivasityPushStore.ACTION_TOKEN_REFRESHED);
        filter.addAction(DigivasityPushStore.ACTION_NOTIFICATION_OPENED);
        ContextCompat.registerReceiver(
            getContext(),
            broadcastReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void unregisterBroadcastReceiver() {
        if (broadcastReceiver == null) {
            return;
        }

        try {
            getContext().unregisterReceiver(broadcastReceiver);
        } catch (Exception ignored) {
            // Receiver may already be unregistered during shutdown.
        }

        broadcastReceiver = null;
    }

    private void subscribeToNewsTopic(String token) {
        if (token == null || token.trim().isEmpty()) {
            return;
        }

        FirebaseMessaging.getInstance()
            .subscribeToTopic(NEWS_TOPIC)
            .addOnSuccessListener(unused -> android.util.Log.d("DigivasityPush", "Subscribed to " + NEWS_TOPIC))
            .addOnFailureListener(error -> android.util.Log.e("DigivasityPush", "Failed to subscribe to " + NEWS_TOPIC, error));
    }
}
