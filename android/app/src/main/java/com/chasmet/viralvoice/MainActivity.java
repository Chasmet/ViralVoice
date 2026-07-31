package com.chasmet.viralvoice;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.util.Locale;

public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int STORAGE_PERMISSION_REQUEST = 1002;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1003;
    private static final int SAVE_AS_REQUEST = 1004;
    private static final String APP_URL =
            "https://chasmet.github.io/ViralVoice/?app=365";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private String lastAutomaticSaveUrl = "";

    private String pendingSaveUrl;
    private String pendingSaveFileName;
    private String pendingSaveMimeType;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        configureWebView();
        configureDownloads();
        requestUsefulPermissions();

        if (savedInstanceState == null) {
            webView.clearCache(true);
            webView.loadUrl(APP_URL + "&t=" + System.currentTimeMillis());
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void requestUsefulPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
            );
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    STORAGE_PERMISSION_REQUEST
            );
        }
    }

    private void configureWebView() {
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(Color.rgb(7, 10, 20));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setUserAgentString(
                settings.getUserAgentString() + " ViralVoiceAndroid/3.6.5"
        );

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(
                new ViralVoiceBridge(),
                "ViralVoiceAndroid"
        );

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(
                    WebView view,
                    String url,
                    Bitmap favicon
            ) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                view.evaluateJavascript(
                        "window.VIRALVOICE_NATIVE_SAVE_AVAILABLE=true;"
                                + "window.VIRALVOICE_NATIVE_SAVE_AS_AVAILABLE=true;",
                        null
                );
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view,
                    WebResourceRequest request
            ) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view,
                    String url
            ) {
                return handleUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(
                    WebView view,
                    int newProgress
            ) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(
                        newProgress >= 100 ? View.GONE : View.VISIBLE
                );
            }

            @Override
            public boolean onShowFileChooser(
                    WebView currentWebView,
                    ValueCallback<Uri[]> newFilePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }

                filePathCallback = newFilePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        new String[]{"video/*", "audio/*"}
                );
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    filePathCallback = null;
                    showToast(R.string.no_application);
                    return false;
                }
            }

            @Override
            public boolean onCreateWindow(
                    WebView view,
                    boolean isDialog,
                    boolean isUserGesture,
                    Message resultMsg
            ) {
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(
                            WebView popupView,
                            WebResourceRequest request
                    ) {
                        openExternal(request.getUrl());
                        popupView.destroy();
                        return true;
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(
                            WebView popupView,
                            String url
                    ) {
                        openExternal(Uri.parse(url));
                        popupView.destroy();
                        return true;
                    }
                });

                WebView.WebViewTransport transport =
                        (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private boolean handleUrl(Uri uri) {
        String host = uri.getHost();
        if (host != null && (
                host.equals("chasmet.github.io")
                        || host.equals("viralvoice.onrender.com")
        )) {
            return false;
        }

        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        runOnUiThread(() -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException error) {
                showToast(R.string.no_application);
            }
        });
    }

    private void configureDownloads() {
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                    String url,
                    String userAgent,
                    String contentDisposition,
                    String mimeType,
                    long contentLength
            ) {
                String fileName = URLUtil.guessFileName(
                        url,
                        contentDisposition,
                        mimeType
                );
                openSaveAsPicker(url, fileName, mimeType);
            }
        });
    }

    private boolean openSaveAsPicker(
            String url,
            String fileName,
            String mimeType
    ) {
        if (!isValidHttpsUrl(url)) {
            return false;
        }

        String safeMimeType = normalizeMimeType(mimeType);
        String safeFileName = ensureMediaExtension(
                sanitizeFileName(fileName),
                safeMimeType
        );

        pendingSaveUrl = url;
        pendingSaveFileName = safeFileName;
        pendingSaveMimeType = safeMimeType;

        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(safeMimeType);
            intent.putExtra(Intent.EXTRA_TITLE, safeFileName);
            intent.addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            );

            try {
                startActivityForResult(intent, SAVE_AS_REQUEST);
            } catch (ActivityNotFoundException error) {
                clearPendingSave();
                showToast(R.string.save_as_unavailable);
            }
        });

        return true;
    }

    private boolean startNativeSave(
            String url,
            String fileName,
            String mimeType,
            boolean automatic,
            Uri destinationUri
    ) {
        if (!isValidHttpsUrl(url)) {
            return false;
        }

        if (automatic && destinationUri == null
                && url.equals(lastAutomaticSaveUrl)) {
            return true;
        }

        String safeMimeType = normalizeMimeType(mimeType);
        String safeFileName = ensureMediaExtension(
                sanitizeFileName(fileName),
                safeMimeType
        );
        String userAgent = webView.getSettings().getUserAgentString();
        String cookies = CookieManager.getInstance().getCookie(url);

        Intent saveIntent = new Intent(this, MediaSaveService.class);
        saveIntent.putExtra(MediaSaveService.EXTRA_URL, url);
        saveIntent.putExtra(MediaSaveService.EXTRA_FILE_NAME, safeFileName);
        saveIntent.putExtra(MediaSaveService.EXTRA_MIME_TYPE, safeMimeType);
        saveIntent.putExtra(MediaSaveService.EXTRA_USER_AGENT, userAgent);
        saveIntent.putExtra(MediaSaveService.EXTRA_COOKIES, cookies);
        if (destinationUri != null) {
            saveIntent.putExtra(
                    MediaSaveService.EXTRA_DESTINATION_URI,
                    destinationUri.toString()
            );
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(saveIntent);
            } else {
                startService(saveIntent);
            }

            if (automatic && destinationUri == null) {
                lastAutomaticSaveUrl = url;
            }
            showToast(
                    destinationUri == null
                            ? R.string.native_save_started
                            : R.string.save_as_started
            );
            return true;
        } catch (Exception error) {
            showToast(R.string.native_save_failed);
            return false;
        }
    }

    private boolean isValidHttpsUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return false;
        }
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme());
    }

    private String normalizeMimeType(String mimeType) {
        if (mimeType == null) {
            return "application/octet-stream";
        }
        String clean = mimeType.split(";", 2)[0]
                .trim()
                .toLowerCase(Locale.ROOT);
        if (clean.startsWith("video/") || clean.startsWith("audio/")) {
            return clean;
        }
        return "application/octet-stream";
    }

    private String ensureMediaExtension(
            String fileName,
            String mimeType
    ) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (mimeType.startsWith("video/") && !lower.endsWith(".mp4")) {
            return fileName + ".mp4";
        }
        if (mimeType.startsWith("audio/") && !lower.endsWith(".mp3")) {
            return fileName + ".mp3";
        }
        return fileName;
    }

    private String sanitizeFileName(String fileName) {
        String safe = fileName == null || fileName.trim().isEmpty()
                ? "ViralVoice-" + System.currentTimeMillis() + ".mp4"
                : fileName;
        safe = safe
                .replaceAll("[\\\\/:*?\"<>|\\r\\n]", "-")
                .trim();
        if (safe.length() > 120) {
            safe = safe.substring(0, 120);
        }
        return safe.isEmpty()
                ? "ViralVoice-" + System.currentTimeMillis() + ".mp4"
                : safe;
    }

    private void clearPendingSave() {
        pendingSaveUrl = null;
        pendingSaveFileName = null;
        pendingSaveMimeType = null;
    }

    private void showToast(int stringResource) {
        runOnUiThread(() -> Toast.makeText(
                MainActivity.this,
                stringResource,
                Toast.LENGTH_LONG
        ).show());
    }

    private final class ViralVoiceBridge {
        @JavascriptInterface
        public boolean saveMedia(
                String url,
                String fileName,
                String mimeType
        ) {
            return startNativeSave(
                    url,
                    fileName,
                    mimeType,
                    true,
                    null
            );
        }

        @JavascriptInterface
        public boolean download(
                String url,
                String fileName,
                String mimeType
        ) {
            return saveMedia(url, fileName, mimeType);
        }

        @JavascriptInterface
        public boolean saveMediaAs(
                String url,
                String fileName,
                String mimeType
        ) {
            return openSaveAsPicker(url, fileName, mimeType);
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == SAVE_AS_REQUEST) {
            if (resultCode == RESULT_OK
                    && data != null
                    && data.getData() != null
                    && pendingSaveUrl != null) {
                Uri destinationUri = data.getData();
                int permissionFlags = data.getFlags()
                        & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try {
                    getContentResolver().takePersistableUriPermission(
                            destinationUri,
                            permissionFlags
                    );
                } catch (SecurityException ignored) {
                    // Certains gestionnaires de fichiers ne proposent pas
                    // de permission persistante. La permission immédiate suffit.
                }

                startNativeSave(
                        pendingSaveUrl,
                        pendingSaveFileName,
                        pendingSaveMimeType,
                        false,
                        destinationUri
                );
            } else {
                showToast(R.string.save_as_cancelled);
            }
            clearPendingSave();
            return;
        }

        if (requestCode != FILE_CHOOSER_REQUEST
                || filePathCallback == null) {
            return;
        }

        Uri[] results = null;
        if (resultCode == RESULT_OK
                && data != null
                && data.getData() != null) {
            results = new Uri[]{data.getData()};
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }

        if (webView != null) {
            webView.removeJavascriptInterface("ViralVoiceAndroid");
            webView.stopLoading();
            webView.setDownloadListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }

        super.onDestroy();
    }
}
