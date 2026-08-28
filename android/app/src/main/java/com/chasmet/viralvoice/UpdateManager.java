package com.chasmet.viralvoice;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
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

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
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
    private static final String KEY_DIRECT_FILE = "direct-file";
    private static final long PASSIVE_CHECK_INTERVAL_MS = 15L * 60L * 1000L;
    private static final long DOWNLOAD_POLL_MS = 500L;

    private final Activity activity;
    private final DownloadManager downloadManager;
    private final SharedPreferences preferences;
    private final AtomicBoolean checking = new AtomicBoolean(false);
    private final AtomicBoolean directDownloading = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private AlertDialog progressDialog;
    private ProgressBar progressBar;
    private TextView progressText;
    private TextView progressDetail;

    public UpdateManager(Activity activity) {
        this.activity = activity;
        this.downloadManager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        this.preferences = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public void checkForUpdates(boolean force) {
        checkForUpdates(force, false);
    }

    public void checkForUpdates(boolean force, boolean showUpToDate) {
        long now = System.currentTimeMillis();
        long lastCheck = preferences.getLong(KEY_LAST_CHECK, 0L);
        if (!force && now - lastCheck < PASSIVE_CHECK_INTERVAL_MS) return;

        if (!checking.compareAndSet(false, true)) {
            if (showUpToDate) toast("Vérification de mise à jour déjà en cours…");
            return;
        }

        if (showUpToDate) toast("Recherche de mise à jour…");

        new Thread(() -> {
            try {
                UpdateInfo info = fetchUpdateInfo();
                if (info == null) {
                    if (showUpToDate) toast("Impossible de vérifier la mise à jour pour le moment.");
                    return;
                }

                preferences.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply();
                if (info.versionCode > BuildConfig.VERSION_CODE) {
                    activity.runOnUiThread(() -> showUpdateDialog(info));
                } else if (showUpToDate) {
                    toast("ViralVoice " + BuildConfig.VERSION_NAME + " est déjà à jour.");
                }
            } catch (Exception error) {
                if (showUpToDate) toast("Vérification impossible. Réessaie dans quelques instants.");
            } finally {
                checking.set(false);
            }
        }, "ViralVoice-update-check").start();
    }

    public void onResume() {
        String directPath = preferences.getString(KEY_DIRECT_FILE, "");
        String version = preferences.getString(KEY_DOWNLOAD_VERSION, "");
        if (!TextUtils.isEmpty(directPath)) {
            File apk = new File(directPath);
            if (apk.isFile() && apk.length() > 0L && compareVersions(version, BuildConfig.VERSION_NAME) > 0) {
                promptInstallFile(apk, version);
                return;
            }
            clearDirectState();
        }

        long downloadId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
        if (downloadId != -1L) pollDownloadManager(downloadId, version);
    }

    public void destroy() {
        directDownloading.set(false);
        dismissProgressDialog();
        mainHandler.removeCallbacksAndMessages(null);
    }

    private UpdateInfo fetchUpdateInfo() {
        for (String manifestUrl : UPDATE_MANIFEST_URLS) {
            try {
                UpdateInfo info = fetchUpdateInfoFrom(manifestUrl);
                if (info != null) return info;
            } catch (Exception ignored) {
                // Source suivante.
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
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache, no-store, max-age=0");
            connection.setRequestProperty("Pragma", "no-cache");
            connection.setRequestProperty("User-Agent", "ViralVoiceAndroid/" + BuildConfig.VERSION_NAME);

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return null;

            JSONObject root = new JSONObject(readAll(connection.getInputStream()));
            int versionCode = root.optInt("versionCode", 0);
            String versionName = root.optString("versionName", "").trim();
            String apkUrl = root.optString("apkUrl", "").trim();
            String title = root.optString("title", "Nouvelle mise à jour").trim();
            String notes = root.optString("notes", "Améliorations et corrections.").trim();
            boolean required = root.optBoolean("required", false);

            if (versionCode <= 0 || TextUtils.isEmpty(versionName) || !isTrustedApkUrl(apkUrl)) return null;
            return new UpdateInfo(versionCode, versionName, apkUrl, title, notes, required);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readAll(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line).append('\n');
        }
        return builder.toString();
    }

    private boolean isTrustedApkUrl(String value) {
        if (TextUtils.isEmpty(value)) return false;
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return "github.com".equalsIgnoreCase(host)
                || "objects.githubusercontent.com".equalsIgnoreCase(host)
                || "githubusercontent.com".equalsIgnoreCase(host)
                || "raw.githubusercontent.com".equalsIgnoreCase(host);
    }

    private void showUpdateDialog(UpdateInfo info) {
        if (activity.isFinishing() || activity.isDestroyed()) return;

        String message = info.notes
                + "\n\nVersion installée : " + BuildConfig.VERSION_NAME
                + "\nNouvelle version : " + info.versionName
                + "\n\nTes données, ton compteur, tes réglages et ton localStorage restent conservés.";

        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle(info.title)
                .setMessage(message)
                .setPositiveButton("Télécharger maintenant", (dialog, which) -> startDirectDownload(info));
        if (!info.required) builder.setNegativeButton("Plus tard", null);

        AlertDialog dialog = builder.create();
        dialog.setCanceledOnTouchOutside(!info.required);
        dialog.setCancelable(!info.required);
        dialog.show();
    }

    private void startDirectDownload(UpdateInfo info) {
        if (!directDownloading.compareAndSet(false, true)) {
            toast("Le téléchargement est déjà en cours.");
            return;
        }

        preferences.edit().putString(KEY_DOWNLOAD_VERSION, info.versionName).apply();
        showProgress(info.versionName, "Connexion directe…", 0, true);

        new Thread(() -> {
            File target = null;
            HttpURLConnection connection = null;
            try {
                File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new IllegalStateException("Stockage indisponible");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Dossier téléchargement indisponible");

                target = new File(dir, "ViralVoice-" + info.versionName + ".apk");
                File partial = new File(dir, target.getName() + ".part");
                if (partial.exists()) partial.delete();

                URL url = new URL(info.apkUrl + (info.apkUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(20000);
                connection.setUseCaches(false);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("User-Agent", "ViralVoiceAndroid/" + BuildConfig.VERSION_NAME);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);

                long total = connection.getContentLengthLong();
                long done = 0L;
                long lastUi = 0L;

                try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream(), 32768);
                     FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[32768];
                    int count;
                    while (directDownloading.get() && (count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        done += count;
                        long now = System.currentTimeMillis();
                        if (now - lastUi >= 120L) {
                            publishDirectProgress(info.versionName, done, total);
                            lastUi = now;
                        }
                    }
                    output.flush();
                }

                if (!directDownloading.get()) throw new IllegalStateException("Téléchargement interrompu");
                if (partial.length() <= 0L) throw new IllegalStateException("APK vide");
                if (target.exists()) target.delete();
                if (!partial.renameTo(target)) throw new IllegalStateException("Finalisation du fichier impossible");

                preferences.edit()
                        .putString(KEY_DIRECT_FILE, target.getAbsolutePath())
                        .putString(KEY_DOWNLOAD_VERSION, info.versionName)
                        .remove(KEY_DOWNLOAD_ID)
                        .apply();

                File ready = target;
                activity.runOnUiThread(() -> {
                    showProgress(info.versionName, "Téléchargement terminé — ouverture de l’installation…", 100, false);
                    mainHandler.postDelayed(() -> promptInstallFile(ready, info.versionName), 300L);
                });
            } catch (Exception error) {
                if (target != null) {
                    File partial = new File(target.getParentFile(), target.getName() + ".part");
                    if (partial.exists()) partial.delete();
                }
                activity.runOnUiThread(() -> {
                    showProgress(info.versionName, "Connexion directe indisponible — secours Android…", 0, true);
                    startDownloadManagerFallback(info);
                });
            } finally {
                if (connection != null) connection.disconnect();
                directDownloading.set(false);
            }
        }, "ViralVoice-direct-update").start();
    }

    private void publishDirectProgress(String versionName, long done, long total) {
        final int percent = total > 0L ? (int) Math.min(99L, (done * 100L) / total) : -1;
        final String detail = total > 0L
                ? formatBytes(done) + " / " + formatBytes(total)
                : formatBytes(done) + " téléchargés";
        activity.runOnUiThread(() -> showProgress(versionName, detail, percent, percent < 0));
    }

    private void startDownloadManagerFallback(UpdateInfo info) {
        try {
            String fileName = "ViralVoice-" + info.versionName + ".apk";
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(info.apkUrl));
            request.setTitle("ViralVoice " + info.versionName);
            request.setDescription("Téléchargement de la mise à jour");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, fileName);

            long id = downloadManager.enqueue(request);
            preferences.edit()
                    .putLong(KEY_DOWNLOAD_ID, id)
                    .putString(KEY_DOWNLOAD_VERSION, info.versionName)
                    .remove(KEY_DIRECT_FILE)
                    .apply();
            pollDownloadManager(id, info.versionName);
        } catch (Exception error) {
            dismissProgressDialog();
            toast("Impossible de télécharger la mise à jour.");
        }
    }

    private void pollDownloadManager(long id, String versionName) {
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                try (Cursor cursor = downloadManager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) {
                        dismissProgressDialog();
                        return;
                    }
                    int status = getInt(cursor, DownloadManager.COLUMN_STATUS, DownloadManager.STATUS_FAILED);
                    long done = getLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0L);
                    long total = getLong(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES, -1L);

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        showProgress(versionName, "Téléchargement terminé — ouverture de l’installation…", 100, false);
                        Uri uri = downloadManager.getUriForDownloadedFile(id);
                        mainHandler.postDelayed(() -> promptInstallUri(uri, versionName), 300L);
                        return;
                    }
                    if (status == DownloadManager.STATUS_FAILED) {
                        clearDownloadState();
                        dismissProgressDialog();
                        toast("Le téléchargement de la mise à jour a échoué.");
                        return;
                    }

                    int percent = total > 0L ? (int) Math.min(99L, done * 100L / total) : -1;
                    String detail = status == DownloadManager.STATUS_PENDING
                            ? "Connexion au téléchargement…"
                            : (total > 0L ? formatBytes(done) + " / " + formatBytes(total) : formatBytes(done) + " téléchargés");
                    showProgress(versionName, detail, percent, percent < 0);
                    mainHandler.postDelayed(this, DOWNLOAD_POLL_MS);
                } catch (Exception error) {
                    mainHandler.postDelayed(this, 1000L);
                }
            }
        }, 200L);
    }

    private void showProgress(String versionName, String detail, int percent, boolean indeterminate) {
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) return;

            if (progressDialog == null || !progressDialog.isShowing()) {
                LinearLayout container = new LinearLayout(activity);
                container.setOrientation(LinearLayout.VERTICAL);
                container.setGravity(Gravity.CENTER_HORIZONTAL);
                container.setPadding(dp(24), dp(8), dp(24), dp(8));

                progressText = new TextView(activity);
                progressText.setTextSize(18f);
                progressText.setGravity(Gravity.CENTER_HORIZONTAL);

                progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
                progressBar.setMax(100);
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(14));
                params.setMargins(0, dp(18), 0, dp(12));
                progressBar.setLayoutParams(params);

                progressDetail = new TextView(activity);
                progressDetail.setTextSize(14f);
                progressDetail.setGravity(Gravity.CENTER_HORIZONTAL);

                container.addView(progressText);
                container.addView(progressBar);
                container.addView(progressDetail);

                progressDialog = new AlertDialog.Builder(activity)
                        .setTitle("Mise à jour ViralVoice " + versionName)
                        .setView(container)
                        .create();
                progressDialog.setCancelable(false);
                progressDialog.setCanceledOnTouchOutside(false);
                progressDialog.show();
            }

            progressBar.setIndeterminate(indeterminate);
            if (!indeterminate && percent >= 0) progressBar.setProgress(percent);
            progressText.setText(percent >= 0 ? "Téléchargement " + percent + " %" : "Téléchargement en cours…");
            progressDetail.setText(detail);
        });
    }

    private void promptInstallFile(File apkFile, String versionName) {
        if (!apkFile.isFile() || apkFile.length() <= 0L) {
            clearDirectState();
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apkFile);
        promptInstallUri(uri, versionName);
    }

    private void promptInstallUri(Uri apkUri, String versionName) {
        if (apkUri == null || activity.isFinishing() || activity.isDestroyed()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            dismissProgressDialog();
            toast("Autorise ViralVoice à installer ses mises à jour, puis reviens dans l’application.");
            Intent permissionIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(permissionIntent);
            return;
        }

        dismissProgressDialog();
        new AlertDialog.Builder(activity)
                .setTitle("Mise à jour prête")
                .setMessage("ViralVoice " + versionName + " est téléchargé. Appuie sur Installer pour terminer. Tes données restent conservées.")
                .setPositiveButton("Installer", (dialog, which) -> installApk(apkUri))
                .setNegativeButton("Plus tard", null)
                .show();
    }

    private void installApk(Uri apkUri) {
        try {
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(install);
        } catch (Exception error) {
            toast("Android n’a pas pu ouvrir l’installateur de mise à jour.");
        }
    }

    private void dismissProgressDialog() {
        activity.runOnUiThread(() -> {
            if (progressDialog != null && progressDialog.isShowing()) progressDialog.dismiss();
            progressDialog = null;
            progressBar = null;
            progressText = null;
            progressDetail = null;
        });
    }

    private void clearDirectState() {
        String path = preferences.getString(KEY_DIRECT_FILE, "");
        if (!TextUtils.isEmpty(path)) {
            File file = new File(path);
            if (file.exists()) file.delete();
        }
        preferences.edit().remove(KEY_DIRECT_FILE).remove(KEY_DOWNLOAD_VERSION).apply();
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

    private int dp(int value) {
        float density = activity.getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024L) return bytes + " o";
        if (bytes < 1024L * 1024L) return String.format(Locale.FRANCE, "%.1f Ko", bytes / 1024d);
        return String.format(Locale.FRANCE, "%.1f Mo", bytes / (1024d * 1024d));
    }

    private int compareVersions(String a, String b) {
        String[] aa = String.valueOf(a).split("\\.");
        String[] bb = String.valueOf(b).split("\\.");
        int max = Math.max(aa.length, bb.length);
        for (int i = 0; i < max; i++) {
            int left = i < aa.length ? safeInt(aa[i]) : 0;
            int right = i < bb.length ? safeInt(bb[i]) : 0;
            if (left != right) return Integer.compare(left, right);
        }
        return 0;
    }

    private int safeInt(String value) {
        try {
            return Integer.parseInt(value.replaceAll("[^0-9].*$", ""));
        } catch (Exception ignored) {
            return 0;
        }
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

        UpdateInfo(int versionCode, String versionName, String apkUrl, String title, String notes, boolean required) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.title = title;
            this.notes = notes;
            this.required = required;
        }
    }
}
