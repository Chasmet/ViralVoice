package com.chasmet.viralvoice;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.util.Log;
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

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends Activity {

    private static final String TAG = "ViralVoiceDownload";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int MAX_DOWNLOAD_RETRIES = 2;
    private static final String APP_URL =
            "https://chasmet.github.io/ViralVoice/?app=363";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private String lastAutomaticDownloadUrl = "";
    private boolean downloadReceiverRegistered = false;

    private final Map<Long, PendingDownload> pendingDownloads =
            new ConcurrentHashMap<>();

    private final BroadcastReceiver downloadReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(
                            intent.getAction()
                    )) {
                        return;
                    }

                    long downloadId = intent.getLongExtra(
                            DownloadManager.EXTRA_DOWNLOAD_ID,
                            -1L
                    );
                    if (downloadId < 0) {
                        return;
                    }

                    PendingDownload pending =
                            pendingDownloads.remove(downloadId);
                    if (pending == null) {
                        return;
                    }

                    inspectCompletedDownload(downloadId, pending);
                }
            };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        configureWebView();
        configureDownloads();
        registerDownloadReceiver();

        if (savedInstanceState == null) {
            webView.clearCache(true);
            webView.loadUrl(APP_URL + "&t=" + System.currentTimeMillis());
        } else {
            webView.restoreState(savedInstanceState);
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
                settings.getUserAgentString() + " ViralVoiceAndroid/3.6.3"
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
                    startActivityForResult(
                            intent,
                            FILE_CHOOSER_REQUEST
                    );
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
                enqueueDownload(
                        url,
                        userAgent,
                        contentDisposition,
                        mimeType,
                        false,
                        0,
                        null,
                        true
                );
            }
        });
    }

    private void registerDownloadReceiver() {
        IntentFilter filter = new IntentFilter(
                DownloadManager.ACTION_DOWNLOAD_COMPLETE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(
                    downloadReceiver,
                    filter,
                    Context.RECEIVER_NOT_EXPORTED
            );
        } else {
            registerReceiver(downloadReceiver, filter);
        }
        downloadReceiverRegistered = true;
    }

    private long enqueueDownload(
            String url,
            String userAgent,
            String contentDisposition,
            String mimeType,
            boolean automatic,
            int retryCount,
            String requestedFileName,
            boolean announceStart
    ) {
        try {
            Uri uri = Uri.parse(url);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                throw new IllegalArgumentException(
                        "URL de téléchargement non sécurisée"
                );
            }

            String safeMimeType =
                    mimeType == null || mimeType.trim().isEmpty()
                            ? "application/octet-stream"
                            : mimeType;

            String guessedName = requestedFileName;
            if (guessedName == null || guessedName.trim().isEmpty()) {
                guessedName = URLUtil.guessFileName(
                        url,
                        contentDisposition,
                        safeMimeType
                );
            }

            String fileName = ensureMediaExtension(
                    sanitizeFileName(guessedName),
                    safeMimeType
            );

            DownloadManager.Request request =
                    new DownloadManager.Request(uri);

            String cookies =
                    CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            request.addRequestHeader(
                    "Accept",
                    safeMimeType + ",application/octet-stream;q=0.9,*/*;q=0.8"
            );
            request.addRequestHeader("Referer", APP_URL);

            request.setMimeType(safeMimeType);
            request.setTitle(fileName);
            request.setDescription(
                    automatic
                            ? "Vidéo ViralVoice terminée"
                            : "Téléchargement ViralVoice"
            );
            request.setAllowedNetworkTypes(
                    DownloadManager.Request.NETWORK_WIFI
                            | DownloadManager.Request.NETWORK_MOBILE
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setNotificationVisibility(
                    DownloadManager.Request
                            .VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    fileName
            );
            request.allowScanningByMediaScanner();

            DownloadManager manager =
                    (DownloadManager) getSystemService(
                            Context.DOWNLOAD_SERVICE
                    );
            if (manager == null) {
                throw new IllegalStateException(
                        "Gestionnaire de téléchargement indisponible"
                );
            }

            long downloadId = manager.enqueue(request);
            pendingDownloads.put(
                    downloadId,
                    new PendingDownload(
                            url,
                            userAgent,
                            contentDisposition,
                            safeMimeType,
                            automatic,
                            retryCount,
                            fileName
                    )
            );

            if (announceStart) {
                showToast(
                        automatic
                                ? R.string.auto_download_started
                                : R.string.download_started
                );
            }

            return downloadId;
        } catch (Exception error) {
            Log.e(TAG, "Impossible de lancer le téléchargement", error);
            if (announceStart) {
                showToast(R.string.download_failed);
            }
            return -1L;
        }
    }

    private void inspectCompletedDownload(
            long downloadId,
            PendingDownload pending
    ) {
        DownloadManager manager =
                (DownloadManager) getSystemService(
                        Context.DOWNLOAD_SERVICE
                );
        if (manager == null) {
            handleFinalDownloadFailure(pending);
            return;
        }

        DownloadManager.Query query =
                new DownloadManager.Query().setFilterById(downloadId);

        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                retryOrFallback(pending, -1);
                return;
            }

            int statusIndex = cursor.getColumnIndex(
                    DownloadManager.COLUMN_STATUS
            );
            int reasonIndex = cursor.getColumnIndex(
                    DownloadManager.COLUMN_REASON
            );
            int status = statusIndex >= 0
                    ? cursor.getInt(statusIndex)
                    : DownloadManager.STATUS_FAILED;
            int reason = reasonIndex >= 0 ? cursor.getInt(reasonIndex) : -1;

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                showToast(R.string.download_complete);
                return;
            }

            retryOrFallback(pending, reason);
        } catch (Exception error) {
            Log.e(TAG, "Lecture du statut du téléchargement impossible", error);
            retryOrFallback(pending, -1);
        }
    }

    private void retryOrFallback(
            PendingDownload pending,
            int reason
    ) {
        Log.w(
                TAG,
                "Téléchargement échoué, raison=" + reason
                        + ", tentative=" + pending.retryCount
        );

        if (pending.retryCount < MAX_DOWNLOAD_RETRIES) {
            showToast(R.string.download_retry);
            long retryId = enqueueDownload(
                    pending.url,
                    pending.userAgent,
                    pending.contentDisposition,
                    pending.mimeType,
                    pending.automatic,
                    pending.retryCount + 1,
                    pending.fileName,
                    false
            );
            if (retryId >= 0) {
                return;
            }
        }

        handleFinalDownloadFailure(pending);
    }

    private void handleFinalDownloadFailure(PendingDownload pending) {
        showToast(R.string.download_browser_fallback);
        openExternal(Uri.parse(pending.url));
    }

    private String ensureMediaExtension(
            String fileName,
            String mimeType
    ) {
        String lower = fileName.toLowerCase();
        if ("video/mp4".equalsIgnoreCase(mimeType)
                && !lower.endsWith(".mp4")) {
            return fileName + ".mp4";
        }
        if ("audio/mpeg".equalsIgnoreCase(mimeType)
                && !lower.endsWith(".mp3")) {
            return fileName + ".mp3";
        }
        return fileName;
    }

    private String sanitizeFileName(String fileName) {
        String sanitized =
                fileName == null
                        ? "ViralVoice-video.mp4"
                        : fileName;

        sanitized = sanitized
                .replaceAll("[\\\\/:*?\"<>|\\r\\n]", "-")
                .trim();

        if (sanitized.isEmpty()) {
            return "ViralVoice-video.mp4";
        }

        return sanitized.length() > 120
                ? sanitized.substring(0, 120)
                : sanitized;
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
        public boolean download(
                String url,
                String fileName,
                String mimeType
        ) {
            if (url == null || url.trim().isEmpty()) {
                return false;
            }

            if (url.equals(lastAutomaticDownloadUrl)) {
                return true;
            }

            String cleanName = sanitizeFileName(fileName);
            String contentDisposition =
                    "attachment; filename=\"" + cleanName + "\"";

            long downloadId = enqueueDownload(
                    url,
                    webView.getSettings().getUserAgentString(),
                    contentDisposition,
                    mimeType,
                    true,
                    0,
                    cleanName,
                    true
            );

            if (downloadId >= 0) {
                lastAutomaticDownloadUrl = url;
                return true;
            }

            return false;
        }
    }

    private static final class PendingDownload {
        final String url;
        final String userAgent;
        final String contentDisposition;
        final String mimeType;
        final boolean automatic;
        final int retryCount;
        final String fileName;

        PendingDownload(
                String url,
                String userAgent,
                String contentDisposition,
                String mimeType,
                boolean automatic,
                int retryCount,
                String fileName
        ) {
            this.url = url;
            this.userAgent = userAgent;
            this.contentDisposition = contentDisposition;
            this.mimeType = mimeType;
            this.automatic = automatic;
            this.retryCount = retryCount;
            this.fileName = fileName;
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        super.onActivityResult(requestCode, resultCode, data);

        if (
                requestCode != FILE_CHOOSER_REQUEST
                        || filePathCallback == null
        ) {
            return;
        }

        Uri[] results = null;
        if (
                resultCode == RESULT_OK
                        && data != null
                        && data.getData() != null
        ) {
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
        if (downloadReceiverRegistered) {
            try {
                unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException ignored) {
                // Récepteur déjà retiré.
            }
            downloadReceiverRegistered = false;
        }

        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }

        if (webView != null) {
            webView.removeJavascriptInterface(
                    "ViralVoiceAndroid"
            );
            webView.stopLoading();
            webView.setDownloadListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }

        super.onDestroy();
    }
}
