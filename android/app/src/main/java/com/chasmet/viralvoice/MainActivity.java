package com.chasmet.viralvoice;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
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

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.EditedMediaItemSequence;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.Transformer;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@UnstableApi
public class MainActivity extends Activity {

    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String APP_URL = "https://chasmet.github.io/ViralVoice/?app=330";
    private static final String LEGACY_LIPSYNC_CLEANUP_JS =
            "(() => {" +
            "document.querySelectorAll('.lip-sync-card,[data-lipsync-card]').forEach(e=>e.remove());" +
            "document.querySelectorAll('.notice,.status,[role=alert]').forEach(e=>{" +
            "const t=(e.textContent||'').toLowerCase();" +
            "if(t.includes('lipsync_service_url')||t.includes('lip-sync indisponible')||" +
            "t.includes('musetalk')||t.includes('gpu à configurer')){" +
            "e.textContent='';e.classList.add('hidden');}});" +
            "const m=document.getElementById('mixTitle');" +
            "if(m){m.textContent='4. Mixage audio';" +
            "const n=m.closest('section')?.querySelector('.step-number');if(n)n.textContent='4';}" +
            "})();";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private String lastAutomaticDownloadUrl = "";

    private final ExecutorService localMediaExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean localSyncRunning = new AtomicBoolean(false);
    private Transformer currentTransformer;
    private File currentDownloadedVideo;
    private File currentLocalOutput;

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
            webView.clearHistory();
            webView.loadUrl(APP_URL + "&t=" + System.currentTimeMillis());
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView() {
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
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUserAgentString(settings.getUserAgentString() + " ViralVoiceAndroid/3.3");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new ViralVoiceBridge(), "ViralVoiceAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                view.evaluateJavascript(LEGACY_LIPSYNC_CLEANUP_JS, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
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
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, R.string.no_application, Toast.LENGTH_LONG).show();
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
                    public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                        openExternal(Uri.parse(url));
                        popupView.destroy();
                        return true;
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private boolean handleUrl(Uri uri) {
        String host = uri.getHost();

        if (host != null &&
                (host.equals("chasmet.github.io") || host.equals("viralvoice.onrender.com"))) {
            return false;
        }

        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_application, Toast.LENGTH_LONG).show();
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
                enqueueDownload(url, userAgent, contentDisposition, mimeType, false);
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
                throw new IllegalArgumentException("URL de téléchargement non sécurisée");
            }

            String safeMimeType = mimeType == null || mimeType.trim().isEmpty()
                    ? "application/octet-stream"
                    : mimeType;
            String fileName = sanitizeFileName(
                    URLUtil.guessFileName(url, contentDisposition, safeMimeType)
            );
            String cookies = CookieManager.getInstance().getCookie(url);

            DownloadManager.Request request = new DownloadManager.Request(uri);
            if (cookies != null && !cookies.isEmpty()) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }

            request.setMimeType(safeMimeType);
            request.setTitle(fileName);
            request.setDescription(automatic
                    ? "Téléchargement automatique ViralVoice"
                    : "Téléchargement ViralVoice");
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager manager =
                    (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                throw new IllegalStateException("Gestionnaire de téléchargement indisponible");
            }

            manager.enqueue(request);
            Toast.makeText(
                    MainActivity.this,
                    automatic ? R.string.auto_download_started : R.string.download_started,
                    Toast.LENGTH_LONG
            ).show();
            return true;
        } catch (Exception error) {
            Toast.makeText(MainActivity.this, R.string.download_failed, Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private void startLocalSynchronization(String remoteVideoUrl, String requestedFileName) {
        notifyLocalSync("onStart", "");
        Toast.makeText(this, R.string.local_sync_started, Toast.LENGTH_LONG).show();

        localMediaExecutor.execute(() -> {
            try {
                currentDownloadedVideo = new File(
                        getCacheDir(),
                        "viralvoice-source-" + System.nanoTime() + ".mp4"
                );
                downloadSecureFile(remoteVideoUrl, currentDownloadedVideo);

                runOnUiThread(() -> startTransformerExport(
                        currentDownloadedVideo,
                        ensureMp4Extension(sanitizeFileName(requestedFileName))
                ));
            } catch (Exception error) {
                failLocalSync(error.getMessage());
            }
        });
    }

    private void downloadSecureFile(String remoteUrl, File destination) throws Exception {
        URL url = new URL(remoteUrl);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IllegalArgumentException("Adresse vidéo non sécurisée");
        }

        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(180_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", webView.getSettings().getUserAgentString());

        String cookies = CookieManager.getInstance().getCookie(remoteUrl);
        if (cookies != null && !cookies.isEmpty()) {
            connection.setRequestProperty("Cookie", cookies);
        }

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("Téléchargement refusé (HTTP " + status + ")");
            }

            try (
                    InputStream input = new BufferedInputStream(connection.getInputStream());
                    OutputStream output = new BufferedOutputStream(new FileOutputStream(destination))
            ) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
            }

            if (!destination.isFile() || destination.length() < 1024) {
                throw new IllegalStateException("Vidéo temporaire invalide");
            }
        } finally {
            connection.disconnect();
        }
    }

    private void startTransformerExport(File downloadedVideo, String outputFileName) {
        try {
            currentLocalOutput = new File(
                    getCacheDir(),
                    "viralvoice-local-" + System.nanoTime() + ".mp4"
            );
            if (currentLocalOutput.exists() && !currentLocalOutput.delete()) {
                throw new IllegalStateException("Impossible de préparer le fichier local");
            }

            MediaItem source = MediaItem.fromUri(Uri.fromFile(downloadedVideo));
            EditedMediaItem videoTrack = new EditedMediaItem.Builder(source)
                    .setRemoveAudio(true)
                    .build();
            EditedMediaItem audioTrack = new EditedMediaItem.Builder(source)
                    .setRemoveVideo(true)
                    .build();

            EditedMediaItemSequence videoSequence =
                    new EditedMediaItemSequence(videoTrack);
            EditedMediaItemSequence audioSequence =
                    new EditedMediaItemSequence(audioTrack);

            Composition composition = new Composition.Builder(videoSequence, audioSequence)
                    .setTransmuxVideo(true)
                    .build();

            currentTransformer = new Transformer.Builder(this)
                    .setAudioMimeType(MimeTypes.AUDIO_AAC)
                    .addListener(new Transformer.Listener() {
                        @Override
                        public void onCompleted(
                                Composition completedComposition,
                                ExportResult exportResult
                        ) {
                            finishLocalSync(outputFileName);
                        }

                        @Override
                        public void onError(
                                Composition failedComposition,
                                ExportResult exportResult,
                                ExportException exportException
                        ) {
                            failLocalSync(exportException.getMessage());
                        }
                    })
                    .build();

            currentTransformer.start(composition, currentLocalOutput.getAbsolutePath());
        } catch (Exception error) {
            failLocalSync(error.getMessage());
        }
    }

    private void finishLocalSync(String outputFileName) {
        final File exportedFile = currentLocalOutput;

        localMediaExecutor.execute(() -> {
            try {
                saveVideoToDownloads(exportedFile, outputFileName);
                runOnUiThread(() -> {
                    Toast.makeText(
                            MainActivity.this,
                            R.string.local_sync_complete,
                            Toast.LENGTH_LONG
                    ).show();
                    notifyLocalSync("onComplete", outputFileName);
                    resetLocalSyncState();
                });
            } catch (Exception error) {
                failLocalSync(error.getMessage());
            }
        });
    }

    private void saveVideoToDownloads(File source, String fileName) throws Exception {
        if (source == null || !source.isFile() || source.length() < 1024) {
            throw new IllegalStateException("Fichier Android final invalide");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4");
            values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/ViralVoice"
            );
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) {
                throw new IllegalStateException("Impossible de créer le fichier dans Téléchargements");
            }

            try (OutputStream output = resolver.openOutputStream(target, "w")) {
                if (output == null) {
                    resolver.delete(target, null, null);
                    throw new IllegalStateException("Stockage Android indisponible");
                }
                copyFile(source, output);
            } catch (Exception error) {
                resolver.delete(target, null, null);
                throw error;
            }

            ContentValues completed = new ContentValues();
            completed.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(target, completed, null, null);
            return;
        }

        File moviesRoot = getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        if (moviesRoot == null) {
            throw new IllegalStateException("Stockage externe indisponible");
        }

        File viralVoiceFolder = new File(moviesRoot, "ViralVoice");
        if (!viralVoiceFolder.exists() && !viralVoiceFolder.mkdirs()) {
            throw new IllegalStateException("Impossible de créer le dossier ViralVoice");
        }

        File target = new File(viralVoiceFolder, fileName);
        try (OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
            copyFile(source, output);
        }
    }

    private void copyFile(File source, OutputStream output) throws Exception {
        try (InputStream input = new BufferedInputStream(new FileInputStream(source))) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
        }
    }

    private void failLocalSync(String detail) {
        final String message = detail == null || detail.trim().isEmpty()
                ? "traitement local indisponible"
                : detail.trim();

        runOnUiThread(() -> {
            Toast.makeText(MainActivity.this, R.string.local_sync_failed, Toast.LENGTH_LONG).show();
            notifyLocalSync("onError", message);
            resetLocalSyncState();
        });
    }

    private void resetLocalSyncState() {
        currentTransformer = null;
        deleteQuietly(currentDownloadedVideo);
        deleteQuietly(currentLocalOutput);
        currentDownloadedVideo = null;
        currentLocalOutput = null;
        localSyncRunning.set(false);
    }

    private void notifyLocalSync(String method, String value) {
        if (webView == null) return;
        String safeMethod = method == null ? "onError" : method.replaceAll("[^A-Za-z]", "");
        String script = "window.ViralVoiceLocalSync&&window.ViralVoiceLocalSync." +
                safeMethod + "(" + JSONObject.quote(value == null ? "" : value) + ");";
        webView.evaluateJavascript(script, null);
    }

    private String sanitizeFileName(String fileName) {
        String sanitized = fileName == null ? "ViralVoice-video.mp4" : fileName;
        sanitized = sanitized.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "-").trim();
        if (sanitized.isEmpty()) {
            return "ViralVoice-video.mp4";
        }
        return sanitized.length() > 120 ? sanitized.substring(0, 120) : sanitized;
    }

    private String ensureMp4Extension(String fileName) {
        return fileName.toLowerCase().endsWith(".mp4") ? fileName : fileName + ".mp4";
    }

    private void deleteQuietly(File file) {
        if (file != null && file.exists()) {
            // Le cache sera aussi nettoyé automatiquement par Android en cas d’échec de suppression.
            file.delete();
        }
    }

    private final class ViralVoiceBridge {
        @JavascriptInterface
        public void download(String url, String fileName, String mimeType) {
            runOnUiThread(() -> {
                if (url == null || url.trim().isEmpty() || url.equals(lastAutomaticDownloadUrl)) {
                    return;
                }

                String cleanName = sanitizeFileName(fileName);
                String contentDisposition = "attachment; filename=\"" + cleanName + "\"";
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

        @JavascriptInterface
        public boolean optimizeDub(String videoUrl, String fileName) {
            if (videoUrl == null || !videoUrl.startsWith("https://")) {
                return false;
            }

            if (!localSyncRunning.compareAndSet(false, true)) {
                return false;
            }

            runOnUiThread(() -> startLocalSynchronization(videoUrl, fileName));
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) {
            return;
        }

        Uri[] results = null;

        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            results = new Uri[]{data.getData()};
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (currentTransformer != null) {
            currentTransformer.cancel();
            currentTransformer = null;
        }
        localMediaExecutor.shutdownNow();
        resetLocalSyncState();

        if (webView != null) {
            webView.removeJavascriptInterface("ViralVoiceAndroid");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
