package io.github.iamtharunj.lifeos

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.GeneralSecurityException
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * One stored value: version byte ‖ 96-bit IV ‖ AES-256-GCM(gzip(text)).
 * The slot name is authenticated along with it, so a file cannot be swapped in under another name.
 * Standard JCA only. The key comes from the caller: the Android Keystore in the app, a throwaway key in tests.
 */
object Envelope {
    private const val VERSION: Byte = 1
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
    private const val CIPHER = "AES/GCM/NoPadding"

    fun seal(key: SecretKey, slot: String, text: String): ByteArray {
        val cipher = Cipher.getInstance(CIPHER)
        cipher.init(Cipher.ENCRYPT_MODE, key) // no IV passed in: the provider generates a fresh random one every call
        val iv = cipher.iv
        if (iv == null || iv.size != IV_BYTES) throw GeneralSecurityException("unexpected IV")
        cipher.updateAAD(aad(slot))
        return byteArrayOf(VERSION) + iv + cipher.doFinal(gzip(text.toByteArray(Charsets.UTF_8)))
    }

    /** Throws [GeneralSecurityException] unless the data was written by [seal] with this key and this slot. */
    fun open(key: SecretKey, slot: String, blob: ByteArray): String {
        if (blob.size < 1 + IV_BYTES + TAG_BITS / 8 || blob[0] != VERSION) throw GeneralSecurityException("unknown envelope")
        val cipher = Cipher.getInstance(CIPHER)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, blob, 1, IV_BYTES))
        cipher.updateAAD(aad(slot))
        val packed = cipher.doFinal(blob, 1 + IV_BYTES, blob.size - 1 - IV_BYTES) // fails here if anything was altered
        return GZIPInputStream(ByteArrayInputStream(packed)).use { it.readBytes() }.toString(Charsets.UTF_8)
    }

    private fun aad(slot: String) = "lifeos.vault.v1|$slot".toByteArray(Charsets.UTF_8)

    private fun gzip(bytes: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        GZIPOutputStream(out).use { it.write(bytes) }
        return out.toByteArray()
    }
}
