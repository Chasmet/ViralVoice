package com.chasmet.viralvoice;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class LauncherActivity extends MainActivity {

    private static final long UPDATE_CHECK_DELAY_MS = 1800L;
    private static final long RUNTIME_INJECTION_DELAY_MS = 1800L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private UpdateManager updateManager;
    private boolean firstResumeDone = false;

    private final Runnable delayedUpdateCheck = () -> {
        if (updateManager != null && !isFinishing()) {
            updateManager.checkForUpdates(true, false);
        }
    };

    private final Runnable injectNativeRuntime = () -> {
        if (isFinishing()) return;
        WebView webView = findViewById(R.id.webView);
        if (webView == null) return;

        String cacheBust = String.valueOf(System.currentTimeMillis());
        String script = "(function(){"
                + "function load(id,src){var old=document.getElementById(id);if(old)old.remove();"
                + "var s=document.createElement('script');s.id=id;s.src=src;s.async=false;document.head.appendChild(s);}"
                + "load('nativeRecovery413','https://chasmet.github.io/ViralVoice/recovery-client.js?v=413&t=" + cacheBust + "');"
                + "load('nativeUpdater413','https://chasmet.github.io/ViralVoice/web-updater.js?v=413&t=" + cacheBust + "');"
                + "load('nativeAdminRepair413','https://chasmet.github.io/ViralVoice/admin-repair-v411.js?v=413&t=" + cacheBust + "');"
                + "var p=document.getElementById('adminPanel');"
                + "if(p&&!document.getElementById('nativeUpdateCheckBtn')){"
                + "var h=document.createElement('h3');h.className='admin-subtitle';h.textContent='Mises à jour';"
                + "var b=document.createElement('button');b.id='nativeUpdateCheckBtn';b.type='button';"
                + "b.className='secondary full';b.textContent='Vérifier les mises à jour';"
                + "b.onclick=function(){try{ViralVoiceUpdater.checkNow();}catch(e){alert('Vérification native indisponible.');}};"
                + "p.appendChild(h);p.appendChild(b);}" 
                + "})();";
        webView.evaluateJavascript(script, null);
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
        handler.postDelayed(injectNativeRuntime, RUNTIME_INJECTION_DELAY_MS);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updateManager != null) {
            updateManager.onResume();
            if (firstResumeDone) {
                updateManager.checkForUpdates(false, false);
                handler.postDelayed(injectNativeRuntime, 500L);
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
        handler.removeCallbacks(injectNativeRuntime);
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
