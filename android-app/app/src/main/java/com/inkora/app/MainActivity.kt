package com.inkora.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var updateBanner: LinearLayout
    private var pendingUpdate: UpdateManager.UpdateInfo? = null

    private val overlayPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (Settings.canDrawOverlays(this)) {
            startFloatingBubble()
        }
    }

    private val installPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        pendingUpdate?.let { if (UpdateManager.canInstallPackages(this)) UpdateManager.downloadAndInstall(this, it) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val density = resources.displayMetrics.density
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL

        updateBanner = buildUpdateBanner(density)
        updateBanner.visibility = View.GONE

        webView = WebView(this)
        val webViewParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        )

        root.addView(updateBanner)
        root.addView(webView, webViewParams)
        setContentView(root)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        // Google bloquea "Iniciar sesion con Google" dentro de un WebView
        // embebido (error 403: disallowed_useragent) detectando el token
        // "; wv" que Android agrega al user-agent por defecto. Se lo saca
        // para que el login de Google funcione normalmente.
        webView.settings.userAgentString = webView.settings.userAgentString.replace("; wv", "")
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        val pendingUrl = intent?.getStringExtra(EXTRA_OPEN_URL)

        if (savedInstanceState == null) {
            webView.loadUrl(pendingUrl ?: START_URL)
        }
    }

    override fun onResume() {
        super.onResume()
        UpdateManager.checkForUpdate(this) { update ->
            pendingUpdate = update
            updateBanner.visibility = if (update != null) View.VISIBLE else View.GONE
        }
    }

    private fun buildUpdateBanner(density: Float): LinearLayout {
        val paddingPx = (10 * density).toInt()
        val banner = LinearLayout(this)
        banner.orientation = LinearLayout.HORIZONTAL
        banner.gravity = Gravity.CENTER_VERTICAL
        banner.setBackgroundColor(Color.parseColor("#1B2F5E"))
        banner.setPadding(paddingPx, paddingPx, paddingPx, paddingPx)

        val label = TextView(this)
        label.text = "Hay una actualización disponible"
        label.setTextColor(Color.WHITE)
        val labelParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        banner.addView(label, labelParams)

        val button = Button(this)
        button.text = "Actualizar ahora"
        button.setOnClickListener { onUpdateNowClicked() }
        banner.addView(button)

        return banner
    }

    private fun onUpdateNowClicked() {
        val update = pendingUpdate ?: return
        if (UpdateManager.canInstallPackages(this)) {
            UpdateManager.downloadAndInstall(this, update)
        } else {
            installPermissionLauncher.launch(UpdateManager.requestInstallPermissionIntent(this))
        }
        updateBanner.visibility = View.GONE
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val url = intent.getStringExtra(EXTRA_OPEN_URL)
        if (!url.isNullOrEmpty()) {
            webView.loadUrl(url)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun requestFloatingBubble() {
        if (Settings.canDrawOverlays(this)) {
            startFloatingBubble()
        } else {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            overlayPermissionLauncher.launch(intent)
        }
    }

    private fun startFloatingBubble() {
        val currentUrl = webView.url ?: START_URL
        val serviceIntent = Intent(this, FloatingBubbleService::class.java)
        serviceIntent.putExtra(FloatingBubbleService.EXTRA_URL, currentUrl)
        startService(serviceIntent)
        moveTaskToBack(true)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun activateFloating() {
            runOnUiThread { requestFloatingBubble() }
        }

        @JavascriptInterface
        fun isNativeApp(): Boolean = true
    }

    companion object {
        const val START_URL = "https://www.inkora.com.ar/admin"
        const val EXTRA_OPEN_URL = "extra_open_url"
    }
}
