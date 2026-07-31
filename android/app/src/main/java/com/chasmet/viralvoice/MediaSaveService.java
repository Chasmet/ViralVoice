package com.chasmet.viralvoice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;
import android.provider.MediaStore;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MediaSaveService extends Service {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_FILE_NAME = "fileName";
    public static final String EXTRA_MIME_TYPE = "mimeType";
    public static final String EXTRA_USER_AGENT = "userAgent";
    public static final String EXTRA_COOKIES = "cookies";
    public static final String EXTRA_DESTINATION_URI = "destinationUri";

    private static final String TAG = "ViralVoiceSave";
    private static final String CHANNEL_ID = "viralvoice_native_save";
    private static final int FOREGROUND_NOTIFICATION_ID = 6400;
    private static final int MAX_ATTEMPTS = 3;

    private final ExecutorService executor =
            Executors.newSingleThreadExecutor();

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        String url = intent.getStringExtra(EXTRA_URL);
        String fileName = intent.getStringExtra(EXTRA_FILE_NAME);
        String mimeType = intent.getStringExtra(EXTRA_MIME_TYPE);
        String userAgent = intent.getStringExtra(EXTRA_USER_AGENT);
        String cookies = intent.getStringExtra(EXTRA_COOKIES);
        String destinationUriValue = intent.getStringExtra(
                EXTRA_DESTINATION_URI
        );
        Uri destinationUri = destinationUriValue == null
                || destinationUriValue.trim().isEmpty()
                ? null
                : Uri.parse(destinationUriValue);

        startForeground(
                FOREGROUND_NOTIFICATION_ID,
                buildProgressNotification(fileName)
        );

        executor.execute(() -> {
            try {
                SavedMedia saved = saveWithRetries(
                        url,
                        fileName,
                        mimeType,
                        userAgent,
                        cookies,
                        destinationUri
                );
                showSuccessNotification(saved, startId);
            } catch (Exception error) {
                Log.e(TAG, "Échec de la sauvegarde native", error);
                showFailureNotification(url, startId);
            } finally {
                stopForeground(true);
                stopSelf(startId);
            }
        });

        return START_NOT_STICKY;
    }

    private SavedMedia saveWithRetries(
            String url,
            String fileName,
            String mimeType,
            String userAgent,
            String cookies,
            Uri destinationUri
    ) throws Exception {
        Exception lastError = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return saveOnce(
                        url,
                        fileName,
                        mimeType,
                        userAgent,
                        cookies,
                        destinationUri
                );
            } catch (Exception error) {
                lastError = error;
                Log.w(TAG, "Tentative " + attempt + " échouée", error);
                if (attempt < MAX_ATTEMPTS) {
                    Thread.sleep(1200L * attempt);
                }
            }
        }

        throw lastError == null
                ? new IllegalStateException("Sauvegarde impossible")
                : lastError;
    }

    private SavedMedia saveOnce(
            String sourceUrl,
            String requestedName,
            String requestedMime,
            String userAgent,
            String cookies,
            Uri destinationUri
    ) throws Exception {
        if (sourceUrl == null || !sourceUrl.startsWith("https://")) {
            throw new IllegalArgumentException("URL de média invalide");
        }

        HttpURLConnection connection = null;
        Uri insertedUri = null;
        File legacyFile = null;

        try {
            connection = (HttpURLConnection) new URL(sourceUrl).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(180000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty(
                    "Accept",
                    "video/mp4,audio/mpeg,application/octet-stream;q=0.9,*/*;q=0.8"
            );
            connection.setRequestProperty(
                    "Referer",
                    "https://chasmet.github.io/ViralVoice/"
            );
            if (userAgent != null && !userAgent.trim().isEmpty()) {
                connection.setRequestProperty("User-Agent", userAgent);
            }
            if (cookies != null && !cookies.trim().isEmpty()) {
                connection.setRequestProperty("Cookie", cookies);
            }

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new IllegalStateException(
                        "Serveur HTTP " + responseCode
                );
            }

            String responseMime = cleanMimeType(connection.getContentType());
            String mimeType = chooseMimeType(requestedMime, responseMime);
            String fileName = ensureExtension(
                    sanitizeFileName(requestedName),
                    mimeType
            );

            try (InputStream input = new BufferedInputStream(
                    connection.getInputStream(),
                    64 * 1024
            )) {
                if (destinationUri != null) {
                    ContentResolver resolver = getContentResolver();
                    try (OutputStream output = new BufferedOutputStream(
                            resolver.openOutputStream(destinationUri, "w"),
                            64 * 1024
                    )) {
                        if (output == null) {
                            throw new IllegalStateException(
                                    "Le gestionnaire de fichiers refuse l’écriture"
                            );
                        }
                        copy(input, output);
                    }
                    return new SavedMedia(
                            destinationUri,
                            fileName,
                            mimeType
                    );
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    insertedUri = createMediaStoreEntry(fileName, mimeType);
                    if (insertedUri == null) {
                        throw new IllegalStateException(
                                "Impossible de créer le fichier multimédia"
                        );
                    }

                    ContentResolver resolver = getContentResolver();
                    try (OutputStream output = new BufferedOutputStream(
                            resolver.openOutputStream(insertedUri, "w"),
                            64 * 1024
                    )) {
                        if (output == null) {
                            throw new IllegalStateException(
                                    "Flux de stockage indisponible"
                            );
                        }
                        copy(input, output);
                    }

                    ContentValues finishedValues = new ContentValues();
                    finishedValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    resolver.update(
                            insertedUri,
                            finishedValues,
                            null,
                            null
                    );
                    return new SavedMedia(insertedUri, fileName, mimeType);
                }

                legacyFile = createLegacyFile(fileName, mimeType);
                try (OutputStream output = new BufferedOutputStream(
                        new FileOutputStream(legacyFile),
                        64 * 1024
                )) {
                    copy(input, output);
                }

                MediaScannerConnection.scanFile(
                        this,
                        new String[]{legacyFile.getAbsolutePath()},
                        new String[]{mimeType},
                        null
                );
                return new SavedMedia(
                        Uri.fromFile(legacyFile),
                        fileName,
                        mimeType
                );
            }
        } catch (Exception error) {
            if (insertedUri != null) {
                try {
                    getContentResolver().delete(insertedUri, null, null);
                } catch (Exception ignored) {
                    // Nettoyage impossible, sans bloquer la nouvelle tentative.
                }
            }
            if (legacyFile != null && legacyFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                legacyFile.delete();
            }
            throw error;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private Uri createMediaStoreEntry(
            String fileName,
            String mimeType
    ) {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri collection;
        if (mimeType.startsWith("video/")) {
            values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_MOVIES + "/ViralVoice"
            );
            collection = MediaStore.Video.Media.getContentUri(
                    MediaStore.VOLUME_EXTERNAL_PRIMARY
            );
        } else if (mimeType.startsWith("audio/")) {
            values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_MUSIC + "/ViralVoice"
            );
            collection = MediaStore.Audio.Media.getContentUri(
                    MediaStore.VOLUME_EXTERNAL_PRIMARY
            );
        } else {
            values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/ViralVoice"
            );
            collection = MediaStore.Downloads.getContentUri(
                    MediaStore.VOLUME_EXTERNAL_PRIMARY
            );
        }

        return getContentResolver().insert(collection, values);
    }

    private File createLegacyFile(
            String fileName,
            String mimeType
    ) throws Exception {
        String directoryType = mimeType.startsWith("video/")
                ? Environment.DIRECTORY_MOVIES
                : mimeType.startsWith("audio/")
                ? Environment.DIRECTORY_MUSIC
                : Environment.DIRECTORY_DOWNLOADS;

        File root = Environment.getExternalStoragePublicDirectory(directoryType);
        File directory = new File(root, "ViralVoice");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException(
                    "Impossible de créer le dossier ViralVoice"
            );
        }

        File candidate = new File(directory, fileName);
        if (!candidate.exists()) {
            return candidate;
        }

        String base = fileName;
        String extension = "";
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) {
            base = fileName.substring(0, dot);
            extension = fileName.substring(dot);
        }
        return new File(
                directory,
                base + "-" + System.currentTimeMillis() + extension
        );
    }

    private void copy(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        int count;
        long total = 0;

        while ((count = input.read(buffer)) != -1) {
            output.write(buffer, 0, count);
            total += count;
        }
        output.flush();

        if (total < 1024) {
            throw new IllegalStateException(
                    "Le fichier reçu est vide ou incomplet"
            );
        }
    }

    private String cleanMimeType(String mimeType) {
        if (mimeType == null) {
            return "";
        }
        int separator = mimeType.indexOf(';');
        return (separator >= 0 ? mimeType.substring(0, separator) : mimeType)
                .trim()
                .toLowerCase(Locale.ROOT);
    }

    private String chooseMimeType(
            String requestedMime,
            String responseMime
    ) {
        String requested = cleanMimeType(requestedMime);
        if (responseMime.startsWith("video/")
                || responseMime.startsWith("audio/")) {
            return responseMime;
        }
        if (requested.startsWith("video/")
                || requested.startsWith("audio/")) {
            return requested;
        }
        return "application/octet-stream";
    }

    private String ensureExtension(String fileName, String mimeType) {
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

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.save_channel_name),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.save_channel_description));

        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildProgressNotification(String fileName) {
        String visibleName = fileName == null || fileName.trim().isEmpty()
                ? "ViralVoice"
                : fileName;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(getString(R.string.native_save_notification_title))
                .setContentText(visibleName)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(0, 0, true)
                .build();
    }

    private void showSuccessNotification(SavedMedia saved, int startId) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        builder
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(getString(R.string.native_save_complete_title))
                .setContentText(saved.fileName)
                .setAutoCancel(true);

        if ("content".equals(saved.uri.getScheme())) {
            Intent openIntent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(saved.uri, saved.mimeType)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this,
                    startId,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT
                            | PendingIntent.FLAG_IMMUTABLE
            );
            builder.setContentIntent(pendingIntent);
        }

        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(FOREGROUND_NOTIFICATION_ID + startId, builder.build());
        }
    }

    private void showFailureNotification(String url, int startId) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        builder
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(getString(R.string.native_save_failed_title))
                .setContentText(getString(R.string.native_save_failed_message))
                .setAutoCancel(true);

        if (url != null && url.startsWith("https://")) {
            Intent browserIntent = new Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse(url)
            );
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this,
                    startId + 5000,
                    browserIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT
                            | PendingIntent.FLAG_IMMUTABLE
            );
            builder.setContentIntent(pendingIntent);
        }

        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(FOREGROUND_NOTIFICATION_ID + startId, builder.build());
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private static final class SavedMedia {
        final Uri uri;
        final String fileName;
        final String mimeType;

        SavedMedia(Uri uri, String fileName, String mimeType) {
            this.uri = uri;
            this.fileName = fileName;
            this.mimeType = mimeType;
        }
    }
}
