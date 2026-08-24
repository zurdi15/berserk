package dev.zurdi.berserk.wear.sync

import com.google.android.gms.wearable.DataMap
import dev.zurdi.berserk.wear.core.TimerFields

/** Adaptador DataMap → TimerFields (el decodificador no conoce Play services). */
class DataMapFields(private val map: DataMap) : TimerFields {
    override fun string(key: String): String? = if (map.containsKey(key)) map.getString(key) else null
    override fun long(key: String, default: Long): Long = if (map.containsKey(key)) map.getLong(key, default) else default
    override fun int(key: String, default: Int): Int = if (map.containsKey(key)) map.getInt(key, default) else default
    override fun boolean(key: String, default: Boolean): Boolean = if (map.containsKey(key)) map.getBoolean(key, default) else default
}
