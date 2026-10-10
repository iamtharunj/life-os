package io.github.iamtharunj.lifeos

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(VaultPlugin::class.java)
        super.onCreate(savedInstanceState)
        // Private before anything is drawn: no screenshots, no screen recording, a blank recent-apps card.
        // Settings → App security can allow screenshots again; where Android can hide the recent-apps card
        // on its own (13+), that stays hidden either way.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(false)
    }
}
