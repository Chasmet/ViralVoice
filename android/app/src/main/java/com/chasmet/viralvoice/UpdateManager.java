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
import android.provider.Settings;
import android.text.TextUtils;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
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

    private final Activity activity;
    private final DownloadManager downloadManager;
    private final SharedPreferences preferences;
    private final AtomicBoolean checking = new AtomicBoolean(false);
    private boolean receiverRegistered = false;

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                return;
            }
            long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            long expectedId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
            if (completedId == expectedId && completedId != -1L) {
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

                // On mémorise uniquement une vérification réellement réussie.
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
        if (downloadId != -1L) {
            promptInstallIfReady(downloadId);
        }
    }

    public void destroy() {
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
                toast("La mise à jour est déjà en cours de téléchargement.");
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

            toast("ViralVoice " + info.versionName
                    + " se télécharge en arrière-plan. Tu peux continuer à utiliser l’application.");
        } catch (Exception error) {
            toast("Impossible de démarrer la mise à jour.");
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
                return;
            }
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                return;
            }
        }

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
            return;
        }

        String versionName = preferences.getString(KEY_DOWNLOAD_VERSION, "mise à jour");
        new AlertDialog.Builder(activity)
                .setTitle("Mise à jour prête")
                .setMessage("ViralVoice " + versionName
                        + " est téléchargé. Appuie sur Installer pour terminer. "
                        + "Tes données resteront conservées.")
                .setPositiveButton("Installer", (dialog, which) -> installApk(apkUri))
                .setNegativeButton("Plus tard", null)
                .show();
    }

    private void installApk(Uri apkUri) {
        try {
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(install);
        } catch (Exception error) {
            toast("Android n’a pas pu ouvrir l’installateur de mise à jour.");
        }
    }

    private void clearDownloadState() {
        preferences.edit().remove(KEY_DOWNLOAD_ID).remove(KEY_DOWNLOAD_VERSION).apply();
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
