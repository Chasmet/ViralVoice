package com.chasmet.viralvoice;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

public final class UpdateManager {

    private static final String[] UPDATE_MANIFEST_URLS = new String[]{
            "https://chasmet.github.io/ViralVoice/update.json",
            "https://raw.githubusercontent.com/Chasmet/ViralVoice/main/update.json"
    };
    private static final String PREFS = "viralvoice-native-updater";
    private static final String KEY_LAST_CHECK = "last-check";
    private static final String KEY_DOWNLOAD_ID = "download-id";
    private static final String KEY_DOWNLOAD_VERSION = "download-version";
    private static final long PASSIVE_CHECK_INTERVAL_MS = 15L * 60L * 1000L;
    private static final long PROGRESS_POLL_MS = 500L;

    private final Activity activity;
    private final DownloadManager downloadManager;
    private final SharedPreferences preferences;
    private final AtomicBoolean checking = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private boolean receiverRegistered = false;
    private boolean installPromptShowing = false;
    private AlertDialog progressDialog;
    private ProgressBar progressBar;
    private TextView progressText;
    private TextView progressDetail;
    private long progressDownloadId = -1L;
    private String progressVersion = "";

    private final Runnable progressPoll = new Runnable() {
        @Override
        public void run() {
            if (progressDownloadId == -1L || activity.isFinishing() || activity.isDestroyed()) {
                return;
            }
            updateDownloadProgress(progressDownloadId);
        }
    };

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                return;
            }
            long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            long expectedId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
            if (completedId == expectedId && completedId != -1L) {
                updateDownloadProgress(completedId);
                promptInstallIfReady(completedId);
            }
        }
    };

    public UpdateManager(Activity activity) {
        this.activity = activity;
        this.downloadManager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        this.preferences = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        registerReceiver();
    }

    public void checkForUpdates(boolean force) {
        checkForUpdates(force, false);
    }

    public void checkForUpdates(boolean force, boolean showUpToDate) {
        long now = System.currentTimeMillis();
        long lastCheck = preferences.getLong(KEY_LAST_CHECK, 0L);
        if (!force && now - lastCheck < PASSIVE_CHECK_INTERVAL_MS) {
            return;
        }
        if (!checking.compareAndSet(false, true)) {
            if (showUpToDate) {
                toast("Vérification de mise à jour déjà en cours…");
            }
            return;
        }

        if (showUpToDate) {
            toast("Recherche de mise à jour…");
        }

        new Thread(() -> {
            try {
                UpdateInfo info = fetchUpdateInfo();
                if (info == null) {
                    if (showUpToDate) {
                        toast("Impossible de vérifier la mise à jour pour le moment.");
                    }
                    return;
                }

                preferences.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply();

                if (info.versionCode > BuildConfig.VERSION_CODE) {
                    activity.runOnUiThread(() -> showUpdateDialog(info));
                } else if (showUpToDate) {
                    toast("ViralVoice " + BuildConfig.VERSION_NAME + " est déjà à jour.");
                }
            } catch (Exception error) {
                if (showUpToDate) {
                    toast("Vérification impossible. Réessaie dans quelques instants.");
                }
            } finally {
                checking.set(false);
            }
        }, "ViralVoice-update-check").start();
    }

    public void onResume() {
        long downloadId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
        if (downloadId == -1L) {
            return;
        }

        String downloadedVersion = preferences.getString(KEY_DOWNLOAD_VERSION, "");
        if (!TextUtils.isEmpty(downloadedVersion)
                && compareVersions(BuildConfig.VERSION_NAME, downloadedVersion) >= 0) {
            clearDownloadState();
            dismissProgressDialog();
            return;
        }

        if (isDownloadActive(downloadId)) {
            showDownloadProgress(downloadId, downloadedVersion);
        } else {
            promptInstallIfReady(downloadId);
        }
    }

    public void destroy() {
        mainHandler.removeCallbacks(progressPoll);
        dismissProgressDialog();
        if (!receiverRegistered) {
            return;
        }
        try {
            activity.unregisterReceiver(downloadReceiver);
        } catch (IllegalArgumentException ignored) {
            // Receiver déjà retiré.
        }
        receiverRegistered = false;
    }

    private void registerReceiver() {
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            activity.registerReceiver(downloadReceiver, filter);
        }
        receiverRegistered = true;
    }

    private UpdateInfo fetchUpdateInfo() {
        for (String manifestUrl : UPDATE_MANIFEST_URLS) {
            try {
                UpdateInfo info = fetchUpdateInfoFrom(manifestUrl);
                if (info != null) {
                    return info;
                }
            } catch (Exception ignored) {
                // Essaie la source suivante.
            }
        }
        return null;
    }

    private UpdateInfo fetchUpdateInfoFrom(String manifestUrl) throws Exception {
        HttpURLConnection connection = null;
        try {
            String separator = manifestUrl.contains("?") ? "&" : "?";
            URL url = new URL(manifestUrl + separator + "t=" + System.currentTimeMillis());
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(7000);
            connection.setReadTimeout(7000);
            connection.setUseCaches(false);
            connection.setDefaultUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, max-age=0");
            connection.setRequestProperty("Pragma", "no-cache");
            connection.setRequestProperty("User-Agent", "ViralVoiceAndroid/" + BuildConfig.VERSION_NAME);

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                return null;
            }

            String json = readAll(connection.getInputStream());
            JSONObject root = new JSONObject(json);
            int versionCode = root.optInt("versionCode", 0);
            String versionName = root.optString("versionName", "").trim();
            String apkUrl = root.optString("apkUrl", "").trim();
            String title = root.optString("title", "Nouvelle mise à jour").trim();
            String notes = root.optString("notes", "Améliorations et corrections.").trim();
            boolean required = root.optBoolean("required", false);

            if (versionCode <= 0 || TextUtils.isEmpty(versionName) || !isTrustedApkUrl(apkUrl)) {
                return null;
            }
            return new UpdateInfo(versionCode, versionName, apkUrl, title, notes, required);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String readAll(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
        }
        return builder.toString();
    }

    private boolean isTrustedApkUrl(String value) {
        if (TextUtils.isEmpty(value)) {
            return false;
        }
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        String host = uri.getHost();
        return "github.com".equalsIgnoreCase(host)
                || "objects.githubusercontent.com".equalsIgnoreCase(host)
                || "githubusercontent.com".equalsIgnoreCase(host)
                || "raw.githubusercontent.com".equalsIgnoreCase(host);
    }

    private void showUpdateDialog(UpdateInfo info) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            return;
        }

        long existingId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
        String existingVersion = preferences.getString(KEY_DOWNLOAD_VERSION, info.versionName);
        if (existingId != -1L && isDownloadActive(existingId)) {
            showDownloadProgress(existingId, existingVersion);
            return;
        }

        String message = info.notes
                + "\n\nVersion installée : " + BuildConfig.VERSION_NAME
                + "\nNouvelle version : " + info.versionName
                + "\n\nTes données, ton compteur, tes réglages et ton localStorage "
                + "restent conservés pendant la mise à jour.";

        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle(info.title)
                .setMessage(message)
                .setPositiveButton("Télécharger maintenant", (dialog, which) -> startDownload(info));

        if (!info.required) {
            builder.setNegativeButton("Plus tard", null);
        }

        AlertDialog dialog = builder.create();
        dialog.setCanceledOnTouchOutside(!info.required);
        dialog.setCancelable(!info.required);
        dialog.show();
    }

    private void startDownload(UpdateInfo info) {
        try {
            long existingId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
            if (existingId != -1L && isDownloadActive(existingId)) {
                showDownloadProgress(existingId,
                        preferences.getString(KEY_DOWNLOAD_VERSION, info.versionName));
                return;
            }

            String fileName = "ViralVoice-" + info.versionName + ".apk";
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(info.apkUrl));
            request.setTitle("ViralVoice " + info.versionName);
            request.setDescription("Téléchargement de la mise à jour");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, fileName);

            long downloadId = downloadManager.enqueue(request);
            preferences.edit()
                    .putLong(KEY_DOWNLOAD_ID, downloadId)
                    .putString(KEY_DOWNLOAD_VERSION, info.versionName)
                    .apply();

            showDownloadProgress(downloadId, info.versionName);
        } catch (Exception error) {
            toast("Impossible de démarrer la mise à jour.");
        }
    }

    private void showDownloadProgress(long downloadId, String versionName) {
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) {
                return;
            }

            progressDownloadId = downloadId;
            progressVersion = TextUtils.isEmpty(versionName) ? "mise à jour" : versionName;
            mainHandler.removeCallbacks(progressPoll);

            if (progressDialog == null || !progressDialog.isShowing()) {
                LinearLayout container = new LinearLayout(activity);
                container.setOrientation(LinearLayout.VERTICAL);
                container.setGravity(Gravity.CENTER_HORIZONTAL);
                int padding = dp(24);
                container.setPadding(padding, dp(8), padding, dp(8));

                progressText = new TextView(activity);
                progressText.setTextSize(18f);
                progressText.setText("Téléchargement 0 %");
                progressText.setGravity(Gravity.CENTER_HORIZONTAL);

                progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
                progressBar.setIndeterminate(false);
                progressBar.setMax(100);
                progressBar.setProgress(0);
                LinearLayout.LayoutParams barParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(14));
                barParams.setMargins(0, dp(18), 0, dp(12));
                progressBar.setLayoutParams(barParams);

                progressDetail = new TextView(activity);
                progressDetail.setTextSize(14f);
                progressDetail.setGravity(Gravity.CENTER_HORIZONTAL);
                progressDetail.setText("Préparation du téléchargement…");

                container.addView(progressText);
                container.addView(progressBar);
                container.addView(progressDetail);

                progressDialog = new AlertDialog.Builder(activity)
                        .setTitle("Mise à jour ViralVoice " + progressVersion)
                        .setView(container)
                        .create();
                progressDialog.setCancelable(false);
                progressDialog.setCanceledOnTouchOutside(false);
                progressDialog.show();
            }

            mainHandler.post(progressPoll);
        });
    }

    private void updateDownloadProgress(long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                failProgress("Téléchargement introuvable.");
                return;
            }

            int status = getInt(cursor, DownloadManager.COLUMN_STATUS, DownloadManager.STATUS_FAILED);
            long downloaded = getLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0L);
            long total = getLong(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES, -1L);

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                activity.runOnUiThread(() -> {
                    if (progressBar != null) progressBar.setProgress(100);
                    if (progressText != null) progressText.setText("Téléchargement 100 %");
                    if (progressDetail != null) {
                        progressDetail.setText("Téléchargement terminé — préparation de l’installation…");
                    }
                });
                mainHandler.removeCallbacks(progressPoll);
                mainHandler.postDelayed(() -> promptInstallIfReady(downloadId), 350L);
                return;
            }

            if (status == DownloadManager.STATUS_FAILED) {
                int reason = getInt(cursor, DownloadManager.COLUMN_REASON, -1);
                clearDownloadState();
                failProgress("Échec du téléchargement (code " + reason + ").");
                return;
            }

            int percent = total > 0 ? (int) Math.min(99L, (downloaded * 100L) / total) : -1;
            String detail;
            if (status == DownloadManager.STATUS_PAUSED) {
                detail = "Téléchargement en pause — reprise automatique…";
            } else if (status == DownloadManager.STATUS_PENDING) {
                detail = "Connexion au téléchargement…";
            } else {
                detail = formatBytes(downloaded) + (total > 0 ? " / " + formatBytes(total) : " téléchargés");
            }

            activity.runOnUiThread(() -> {
                if (progressBar != null) {
                    progressBar.setIndeterminate(percent < 0);
                    if (percent >= 0) progressBar.setProgress(percent);
                }
                if (progressText != null) {
                    progressText.setText(percent >= 0
                            ? "Téléchargement " + percent + " %"
                            : "Téléchargement en cours…");
                }
                if (progressDetail != null) progressDetail.setText(detail);
            });

            mainHandler.removeCallbacks(progressPoll);
            mainHandler.postDelayed(progressPoll, PROGRESS_POLL_MS);
        } catch (Exception error) {
            mainHandler.removeCallbacks(progressPoll);
            mainHandler.postDelayed(progressPoll, 1200L);
        }
    }

    private boolean isDownloadActive(long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return false;
            }
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0) {
                return false;
            }
            int status = cursor.getInt(statusIndex);
            return status == DownloadManager.STATUS_PENDING
                    || status == DownloadManager.STATUS_RUNNING
                    || status == DownloadManager.STATUS_PAUSED;
        }
    }

    private void promptInstallIfReady(long downloadId) {
        if (installPromptShowing || activity.isFinishing() || activity.isDestroyed()) {
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return;
            }
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0) {
                return;
            }
            int status = cursor.getInt(statusIndex);
            if (status == DownloadManager.STATUS_FAILED) {
                clearDownloadState();
                failProgress("Le téléchargement de la mise à jour a échoué.");
                return;
            }
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                if (isDownloadActive(downloadId)) {
                    showDownloadProgress(downloadId,
                            preferences.getString(KEY_DOWNLOAD_VERSION, progressVersion));
                }
                return;
            }
        }

        dismissProgressDialog();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            toast("Autorise ViralVoice à installer sa mise à jour, puis reviens dans l’application.");
            Intent permissionIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(permissionIntent);
            return;
        }

        Uri apkUri = downloadManager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            clearDownloadState();
            toast("Le fichier de mise à jour est introuvable.");
            return;
        }

        String versionName = preferences.getString(KEY_DOWNLOAD_VERSION, "mise à jour");
        installPromptShowing = true;
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Mise à jour prête")
                .setMessage("ViralVoice " + versionName
                        + " est téléchargé à 100 %. Appuie sur Installer pour terminer. "
                        + "Tes données resteront conservées.")
                .setPositiveButton("Installer", (d, which) -> {
                    installPromptShowing = false;
                    installApk(apkUri, versionName);
                })
                .setNegativeButton("Plus tard", (d, which) -> installPromptShowing = false)
                .create();
        dialog.setOnCancelListener(d -> installPromptShowing = false);
        dialog.setOnDismissListener(d -> installPromptShowing = false);
        dialog.show();
    }

    private void installApk(Uri apkUri, String versionName) {
        try {
            Toast.makeText(activity,
                    "Installation ViralVoice " + versionName + " — valide Installer sur l’écran Android.",
                    Toast.LENGTH_LONG).show();
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(install);
        } catch (Exception error) {
            toast("Android n’a pas pu ouvrir l’installateur de mise à jour.");
        }
    }

    private void failProgress(String message) {
        activity.runOnUiThread(() -> {
            mainHandler.removeCallbacks(progressPoll);
            if (progressText != null) progressText.setText("Mise à jour interrompue");
            if (progressDetail != null) progressDetail.setText(message);
            if (progressBar != null) {
                progressBar.setIndeterminate(false);
                progressBar.setProgress(0);
            }
            mainHandler.postDelayed(this::dismissProgressDialog, 1800L);
        });
    }

    private void dismissProgressDialog() {
        mainHandler.removeCallbacks(progressPoll);
        progressDownloadId = -1L;
        progressVersion = "";
        if (progressDialog != null) {
            try {
                if (progressDialog.isShowing()) progressDialog.dismiss();
            } catch (Exception ignored) {
                // L'activité peut déjà être en fermeture.
            }
        }
        progressDialog = null;
        progressBar = null;
        progressText = null;
        progressDetail = null;
    }

    private void clearDownloadState() {
        preferences.edit().remove(KEY_DOWNLOAD_ID).remove(KEY_DOWNLOAD_VERSION).apply();
    }

    private int getInt(Cursor cursor, String column, int fallback) {
        int index = cursor.getColumnIndex(column);
        return index >= 0 ? cursor.getInt(index) : fallback;
    }

    private long getLong(Cursor cursor, String column, long fallback) {
        int index = cursor.getColumnIndex(column);
        return index >= 0 ? cursor.getLong(index) : fallback;
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024L) return bytes + " o";
        if (bytes < 1024L * 1024L) return String.format(Locale.FRANCE, "%.1f Ko", bytes / 1024d);
        return String.format(Locale.FRANCE, "%.1f Mo", bytes / (1024d * 1024d));
    }

    private int compareVersions(String left, String right) {
        String[] a = String.valueOf(left).split("\\.");
        String[] b = String.valueOf(right).split("\\.");
        int length = Math.max(a.length, b.length);
        for (int i = 0; i < length; i++) {
            int av = parseVersionPart(a, i);
            int bv = parseVersionPart(b, i);
            if (av != bv) return av > bv ? 1 : -1;
        }
        return 0;
    }

    private int parseVersionPart(String[] parts, int index) {
        if (index >= parts.length) return 0;
        try {
            return Integer.parseInt(parts[index].replaceAll("[^0-9].*$", ""));
        } catch (Exception ignored) {
            return 0;
        }
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_LONG).show());
    }

    private static final class UpdateInfo {
        final int versionCode;
        final String versionName;
        final String apkUrl;
        final String title;
        final String notes;
        final boolean required;

        UpdateInfo(int versionCode, String versionName, String apkUrl,
                   String title, String notes, boolean required) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.title = title;
            this.notes = notes;
            this.required = required;
        }
    }
}
