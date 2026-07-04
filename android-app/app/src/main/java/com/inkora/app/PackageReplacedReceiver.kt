package com.inkora.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Se dispara automaticamente cuando esta misma app se actualiza a si misma
// (via el instalador del sistema). Reabre la app sin que el usuario tenga
// que buscarla de nuevo.
class PackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        val launchIntent = Intent(context, MainActivity::class.java)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(launchIntent) }
    }
}
