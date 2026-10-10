package io.github.iamtharunj.lifeos

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * The only native code Life OS adds. JavaScript side: src/lib/vault.ts.
 *  - encrypted storage for the planner and the sync keys (Android Keystore key, [Envelope] format)
 *  - the system biometric / screen-lock prompt for the app lock
 *  - the screenshot / recent-apps privacy flag
 *  - a "save as" picker for backups
 *  - a rule that the WebView never navigates away from the bundled app
 * Nothing here logs, and no error message carries stored data.
 */
@CapacitorPlugin(name = "Vault")
class VaultPlugin : Plugin() {

    // ---------------------------------------------------------------- encrypted storage
    /** The device key: AES-256, generated inside the Android Keystore and not exportable from it. */
    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** Only short, simple names are accepted, so a caller can never reach outside the vault folder. */
    private fun slot(call: PluginCall): File? {
        val name = call.getString("key")
        if (name == null || !SLOT_NAME.matches(name)) {
            call.reject("Bad key")
            return null
        }
        return File(File(context.filesDir, "vault").apply { mkdirs() }, name)
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val file = slot(call) ?: return
        val blob = try {
            AtomicFile(file).readFully()
        } catch (e: FileNotFoundException) {
            call.resolve(JSObject()) // nothing stored yet
            return
        }
        try {
            call.resolve(JSObject().put("value", Envelope.open(key(), file.name, blob)))
        } catch (e: Exception) {
            // Lost or different key, or a damaged file. The file is left exactly as it is; the app decides what to do.
            call.reject("Stored data cannot be decrypted", "UNREADABLE")
        }
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val file = slot(call) ?: return
        val value = call.getString("value")
        if (value == null) {
            call.reject("Missing value")
            return
        }
        val atomic = AtomicFile(file)
        var stream: FileOutputStream? = null
        try {
            val blob = Envelope.seal(key(), file.name, value)
            stream = atomic.startWrite()
            stream.write(blob)
            atomic.finishWrite(stream) // synced to disk, then swapped in: a crash mid-write keeps the previous copy
            call.resolve()
        } catch (e: Exception) {
            if (stream != null) atomic.failWrite(stream)
            call.reject("Could not save on this device", "WRITE_FAILED")
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val file = slot(call) ?: return
        AtomicFile(file).delete()
        call.resolve()
    }

    /** Keep a file that cannot be opened under another name, instead of overwriting it. */
    @PluginMethod
    fun setAside(call: PluginCall) {
        val file = slot(call) ?: return
        if (file.exists()) file.renameTo(File(file.path + "-unreadable"))
        call.resolve()
    }

    // ---------------------------------------------------------------- app lock
    @PluginMethod
    fun canAuthenticate(call: PluginCall) {
        val ok = BiometricManager.from(context).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS
        call.resolve(JSObject().put("available", ok))
    }

    /** The system's own prompt: fingerprint, face, or the phone's PIN / pattern. The app never sees biometric data. */
    @PluginMethod
    fun authenticate(call: PluginCall) {
        if (BiometricManager.from(context).canAuthenticate(AUTHENTICATORS) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("No screen lock is set up on this phone", "UNAVAILABLE")
            return
        }
        activity.runOnUiThread {
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.reject("Not unlocked", "CANCELLED")
                }
            }
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title") ?: "Unlock Life OS")
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build()
            BiometricPrompt(activity, ContextCompat.getMainExecutor(context), callback).authenticate(info)
        }
    }

    // ---------------------------------------------------------------- privacy screen
    /** FLAG_SECURE: no screenshots or screen recording, and a blank card in the recent-apps list. */
    @PluginMethod
    fun setSecure(call: PluginCall) {
        val on = call.getBoolean("on", true) ?: true
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            call.resolve()
        }
    }

    // ---------------------------------------------------------------- export
    /** The system "save as" picker: the user decides where a backup goes, and no storage permission is needed. */
    @PluginMethod
    fun saveFile(call: PluginCall) {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, call.getString("name") ?: "lifeos-backup.json")
        try {
            startActivityForResult(call, intent, "fileChosen")
        } catch (e: ActivityNotFoundException) {
            call.reject("This phone has no file picker")
        }
    }

    @ActivityCallback
    private fun fileChosen(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }
        try {
            val out = context.contentResolver.openOutputStream(uri, "wt") ?: throw FileNotFoundException()
            out.use { it.write((call.getString("text") ?: "").toByteArray(Charsets.UTF_8)) }
            call.resolve(JSObject().put("saved", true))
        } catch (e: Exception) {
            call.reject("Could not write the file")
        }
    }

    // ---------------------------------------------------------------- navigation
    /**
     * The WebView only ever shows the bundled app. Web and mail links open in the phone's own apps;
     * every other scheme (intent:, file:, content:, data:, blob:, javascript:, tel:, ...) is dropped.
     */
    override fun shouldOverrideLoad(url: Uri): Boolean? {
        val scheme = url.scheme?.lowercase()
        if (scheme == bridge.scheme && url.host == bridge.host) return null // the app itself: Capacitor serves it
        if (scheme == "https" || scheme == "http" || scheme == "mailto") {
            try {
                val view = Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(view)
            } catch (e: ActivityNotFoundException) {
                // no browser or mail app installed: nothing to open it with
            }
        }
        return true
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "lifeos.vault.v1"
        const val AUTHENTICATORS = BIOMETRIC_WEAK or DEVICE_CREDENTIAL
        val SLOT_NAME = Regex("^[a-z][a-z0-9.]{0,39}$")
    }
}
