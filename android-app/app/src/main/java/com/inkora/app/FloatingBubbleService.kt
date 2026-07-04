package com.inkora.app

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.core.app.NotificationCompat
import kotlin.math.abs

class FloatingBubbleService : Service() {

    private lateinit var windowManager: WindowManager

    private var bubbleView: View? = null
    private var expandedView: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var expandedParams: WindowManager.LayoutParams? = null

    private var startUrl: String = MainActivity.START_URL
    private var expanded = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        intent?.getStringExtra(EXTRA_URL)?.let { startUrl = it }
        startForeground(NOTIFICATION_ID, buildNotification())
        if (bubbleView == null) {
            addBubble()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        removeExpandedView()
        bubbleView?.let { runCatching { windowManager.removeView(it) } }
        bubbleView = null
    }

    private fun buildNotification(): android.app.Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Burbuja flotante",
                    NotificationManager.IMPORTANCE_MIN
                )
                manager.createNotificationChannel(channel)
            }
        }

        val stopIntent = Intent(this, FloatingBubbleService::class.java).setAction(ACTION_STOP)
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("INKORA activo en segundo plano")
            .setContentText("Tocá el ícono flotante para volver a abrir la app")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cerrar burbuja", stopPendingIntent)
            .build()
    }

    @SuppressLint("ClickableViewAccessibility", "InflateParams")
    private fun addBubble() {
        val overlayType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

        val icon = ImageView(this).apply {
            setImageResource(R.mipmap.ic_launcher)
            val paddingPx = (10 * resources.displayMetrics.density).toInt()
            setPadding(paddingPx, paddingPx, paddingPx, paddingPx)
        }
        bubbleView = icon

        val size = (56 * resources.displayMetrics.density).toInt()
        val params = WindowManager.LayoutParams(
            size, size,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.START
        params.x = 0
        params.y = 200
        bubbleParams = params

        var touchDownX = 0f
        var touchDownY = 0f
        var startX = 0
        var startY = 0
        var moved = false

        icon.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    touchDownX = event.rawX
                    touchDownY = event.rawY
                    startX = params.x
                    startY = params.y
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchDownX).toInt()
                    val dy = (event.rawY - touchDownY).toInt()
                    if (abs(dx) > 12 || abs(dy) > 12) moved = true
                    params.x = startX + dx
                    params.y = startY + dy
                    runCatching { windowManager.updateViewLayout(view, params) }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        toggleExpanded()
                    }
                    true
                }
                else -> false
            }
        }

        windowManager.addView(icon, params)
    }

    private fun toggleExpanded() {
        if (expanded) {
            removeExpandedView()
        } else {
            addExpandedView()
        }
    }

    @SuppressLint("InflateParams")
    private fun addExpandedView() {
        val overlayType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

        val container = LayoutInflater.from(this).inflate(R.layout.floating_expanded, null) as FrameLayout
        val webView = container.findViewById<WebView>(R.id.floating_webview)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.loadUrl(startUrl)

        container.findViewById<View>(R.id.floating_close).setOnClickListener {
            removeExpandedView()
        }
        container.findViewById<View>(R.id.floating_open_app).setOnClickListener {
            val openIntent = Intent(this, MainActivity::class.java)
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            openIntent.putExtra(MainActivity.EXTRA_OPEN_URL, webView.url ?: startUrl)
            startActivity(openIntent)
            removeExpandedView()
        }

        val density = resources.displayMetrics.density
        val width = (320 * density).toInt()
        val height = (520 * density).toInt()

        val params = WindowManager.LayoutParams(
            width, height,
            overlayType,
            0,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.START
        params.x = bubbleParams?.x ?: 0
        params.y = bubbleParams?.y ?: 200
        expandedParams = params

        windowManager.addView(container, params)
        expandedView = container
        expanded = true

        bubbleView?.visibility = View.GONE
    }

    private fun removeExpandedView() {
        expandedView?.let { runCatching { windowManager.removeView(it) } }
        expandedView = null
        expanded = false
        bubbleView?.visibility = View.VISIBLE
    }

    companion object {
        const val EXTRA_URL = "extra_url"
        const val ACTION_STOP = "com.inkora.app.action.STOP_BUBBLE"
        private const val CHANNEL_ID = "floating_bubble_channel"
        private const val NOTIFICATION_ID = 4201
    }
}
