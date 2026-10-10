package io.github.iamtharunj.lifeos

import java.security.GeneralSecurityException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * The format the Vault plugin writes, checked on the JVM with a throwaway AES key standing in for the Keystore key.
 * (The Keystore itself only exists on a device; see docs/ANDROID_TEST_PLAN.md for the on-device checks.)
 */
class EnvelopeTest {
    private fun newKey(): SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val key = newKey()

    // Synthetic planner: nothing here is real data.
    private val planner = """{"tasks":[{"title":"Zebra thermodynamics essay"}],"journal":[{"body":"quokka secret"}],"token":"feedfacefeedface"}"""

    @Test
    fun roundTrips() {
        assertEquals(planner, Envelope.open(key, "lifeos.db", Envelope.seal(key, "lifeos.db", planner)))
    }

    @Test
    fun nothingReadableIsStored() {
        val blob = Envelope.seal(key, "lifeos.db", planner)
        val asText = String(blob, Charsets.ISO_8859_1)
        for (word in listOf("Zebra", "quokka", "tasks", "journal", "feedface")) assertFalse(word, asText.contains(word))
        assertEquals("version byte", 1, blob[0].toInt())
    }

    @Test
    fun freshIvForEveryWrite() {
        val a = Envelope.seal(key, "lifeos.db", planner)
        val b = Envelope.seal(key, "lifeos.db", planner)
        assertFalse("IV reused", a.copyOfRange(1, 13).contentEquals(b.copyOfRange(1, 13)))
        assertFalse(a.contentEquals(b))
    }

    @Test
    fun rejectsTamperingAndDamage() {
        val blob = Envelope.seal(key, "lifeos.db", planner)
        for (i in listOf(1, 12, 13, blob.size / 2, blob.size - 1)) { // IV, ciphertext, tag
            val bad = blob.copyOf()
            bad[i] = (bad[i].toInt() xor 1).toByte()
            assertThrows(GeneralSecurityException::class.java) { Envelope.open(key, "lifeos.db", bad) }
        }
        assertThrows(GeneralSecurityException::class.java) { Envelope.open(key, "lifeos.db", blob.copyOf(blob.size - 1)) }
        assertThrows(GeneralSecurityException::class.java) { Envelope.open(key, "lifeos.db", ByteArray(0)) }
        val otherVersion = blob.copyOf()
        otherVersion[0] = 2
        assertThrows(GeneralSecurityException::class.java) { Envelope.open(key, "lifeos.db", otherVersion) }
    }

    @Test
    fun rejectsADifferentKey() {
        val blob = Envelope.seal(key, "lifeos.db", planner)
        assertThrows(GeneralSecurityException::class.java) { Envelope.open(newKey(), "lifeos.db", blob) }
    }

    @Test
    fun isBoundToItsSlot() {
        val blob = Envelope.seal(key, "lifeos.db", planner)
        assertThrows(GeneralSecurityException::class.java) { Envelope.open(key, "lifeos.cloud", blob) }
    }

    @Test
    fun handlesEmptyAndLargeValues() {
        assertEquals("", Envelope.open(key, "lifeos.db", Envelope.seal(key, "lifeos.db", "")))
        val big = "é漢字🙂 planner ".repeat(100_000)
        assertEquals(big, Envelope.open(key, "lifeos.db", Envelope.seal(key, "lifeos.db", big)))
    }
}
