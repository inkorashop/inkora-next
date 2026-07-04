package com.inkora.app

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

// Chequea si hay una version nueva del "cascaron" nativo (no de la web, esa
// se actualiza sola) y, si el usuario acepta, la descarga e instala. Android
// siempre exige un toque de "Instalar" en la pantalla del sistema: ningun
// codigo de la app puede saltear eso sin MDM.
object UpdateManager {

    private const val VERSION_ENDPOINT = "https://www.inkora.com.ar/api/app-version"

    data class UpdateInfo(val versionCode: Int, val versionName: String, val apkUrl: String)

    fun checkForUpdate(context: Context, onResult: (UpdateInfo?) -> Unit) {
        Thread {
            val info = runCatching {
                val connection = URL(VERSION_ENDPOINT).openConnection() as HttpURLConnection
                connection.connectTimeout = 8000
                connection.readTimeout = 8000
                connection.requestMethod = "GET"

                val body = BufferedReader(InputStreamReader(connection.inputStream)).use { it.readText() }
                val json = JSONObject(body)
                val remoteVersionCode = json.optInt("versionCode", 0)
                val apkUrl = json.optString("apkUrl", "")
                val versionName = json.optString("versionName", "")

                val currentVersionCode = currentVersionCode(context)

                if (remoteVersionCode > currentVersionCode && apkUrl.isNotBlank()) {
                    UpdateInfo(remoteVersionCode, versionName, apkUrl)
                } else {
                    null
                }
            }.getOrNull()

            Handler(Looper.getMainLooper()).post { onResult(info) }
        }.start()
    }

    private fun currentVersionCode(context: Context): Int {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode
        }
    }

    fun canInstallPackages(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun requestInstallPermissionIntent(context: Context): Intent {
        return Intent(
            android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}")
        )
    }

    fun downloadAndInstall(context: Context, update: UpdateInfo) {
        val fileName = "inkora-update-${update.versionCode}.apk"
        val request = DownloadManager.Request(Uri.parse(update.apkUrl))
            .setTitle("Actualizando INKORA")
            .setDescription("Descargando version ${update.versionName}")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadId = downloadManager.enqueue(request)

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context, intent: Intent) {
                val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (completedId != downloadId) return
                runCatching { context.applicationContext.unregisterReceiver(this) }

                val file = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let {
                    File(it, fileName)
                }
                if (file == null || !file.exists()) return

                val apkUri = FileProvider.getUriForFile(
                    context, "${context.packageName}.fileprovider", file
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(installIntent)
            }
        }

        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.applicationContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.applicationContext.registerReceiver(receiver, filter)
        }
    }
}
