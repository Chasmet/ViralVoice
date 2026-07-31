package com.chasmet.viralvoice;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
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

public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String APP_URL =
            "https://chasmet.github.io/ViralVoice/?app=360";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private String lastAutomaticDownloadUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        configureWebView();
        configureDownloads();

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
                settings.getUserAgentString() + " ViralVoiceAndroid/3.6"
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
                    Toast.makeText(
                            MainActivity.this,
                            R.string.no_application,
                            Toast.LENGTH_LONG
                    ).show();
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
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(
                    this,
                    R.string.no_application,
                    Toast.LENGTH_LONG
            ).show();
        }
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
                        false
                );
            }
        });
    }

    private boolean enqueueDownload(
            String url,
            String userAgent,
            String contentDisposition,
            String mimeType,
            boolean automatic
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

            String fileName = sanitizeFileName(
                    URLUtil.guessFileName(
                            url,
                            contentDisposition,
                            safeMimeType
                    )
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

            request.setMimeType(safeMimeType);
            request.setTitle(fileName);
            request.setDescription(
                    automatic
                            ? "Vidéo ViralVoice terminée"
                            : "Téléchargement ViralVoice"
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

            DownloadManager manager =
                    (DownloadManager) getSystemService(
                            Context.DOWNLOAD_SERVICE
                    );
            if (manager == null) {
                throw new IllegalStateException(
                        "Gestionnaire de téléchargement indisponible"
                );
            }

            manager.enqueue(request);
            Toast.makeText(
                    MainActivity.this,
                    automatic
                            ? R.string.auto_download_started
                            : R.string.download_started,
                    Toast.LENGTH_LONG
            ).show();
            return true;
        } catch (Exception error) {
            Toast.makeText(
                    MainActivity.this,
                    R.string.download_failed,
                    Toast.LENGTH_LONG
            ).show();
            return false;
        }
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

    private final class ViralVoiceBridge {
        @JavascriptInterface
        public void download(
                String url,
                String fileName,
                String mimeType
        ) {
            runOnUiThread(() -> {
                if (
                        url == null
                                || url.trim().isEmpty()
                                || url.equals(lastAutomaticDownloadUrl)
                ) {
                    return;
                }

                String cleanName = sanitizeFileName(fileName);
                String contentDisposition =
                        "attachment; filename=\"" + cleanName + "\"";

                boolean started = enqueueDownload(
                        url,
                        webView.getSettings().getUserAgentString(),
                        contentDisposition,
                        mimeType,
                        true
                );

                if (started) {
                    lastAutomaticDownloadUrl = url;
                }
            });
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
