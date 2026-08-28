package com.chasmet.viralvoice;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class LauncherActivity extends MainActivity {

    private static final long UPDATE_CHECK_DELAY_MS = 1800L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private UpdateManager updateManager;
    private boolean firstResumeDone = false;

    private final Runnable delayedUpdateCheck = () -> {
        if (updateManager != null && !isFinishing()) {
            // Toujours forcer au lancement afin de ne jamais rester bloqué par
            // une ancienne heure de vérification enregistrée localement.
            updateManager.checkForUpdates(true, false);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        updateManager = new UpdateManager(this);

        WebView webView = findViewById(R.id.webView);
        if (webView != null) {
            webView.addJavascriptInterface(new UpdateBridge(), "ViralVoiceUpdater");
        }

        handler.postDelayed(delayedUpdateCheck, UPDATE_CHECK_DELAY_MS);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updateManager != null) {
            updateManager.onResume();
            if (firstResumeDone) {
                // Vérification passive au retour dans l'application.
                updateManager.checkForUpdates(false, false);
            }
        }
        firstResumeDone = true;
    }

    private final class UpdateBridge {
        @JavascriptInterface
        public void checkNow() {
            runOnUiThread(() -> {
                if (updateManager != null && !isFinishing()) {
                    updateManager.checkForUpdates(true, true);
                }
            });
        }

        @JavascriptInterface
        public String currentVersion() {
            return BuildConfig.VERSION_NAME;
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(delayedUpdateCheck);
        WebView webView = findViewById(R.id.webView);
        if (webView != null) {
            webView.removeJavascriptInterface("ViralVoiceUpdater");
        }
        if (updateManager != null) {
            updateManager.destroy();
            updateManager = null;
        }
        super.onDestroy();
    }
}
