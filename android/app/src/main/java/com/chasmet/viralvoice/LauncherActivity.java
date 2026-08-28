package com.chasmet.viralvoice;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

public class LauncherActivity extends MainActivity {

    private static final long UPDATE_CHECK_DELAY_MS = 2500L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private UpdateManager updateManager;
    private final Runnable delayedUpdateCheck = () -> {
        if (updateManager != null && !isFinishing()) {
            updateManager.checkForUpdates(false);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        updateManager = new UpdateManager(this);
        handler.postDelayed(delayedUpdateCheck, UPDATE_CHECK_DELAY_MS);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updateManager != null) {
            updateManager.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(delayedUpdateCheck);
        if (updateManager != null) {
            updateManager.destroy();
            updateManager = null;
        }
        super.onDestroy();
    }
}
