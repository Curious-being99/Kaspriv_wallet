package com.kaspriv.wallet

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NativeUIRouter")
class NativeUIRouterPlugin : Plugin() {

    companion object {
        var activeCall: PluginCall? = null
    }

    @PluginMethod
    fun launchNativeWallet(call: PluginCall) {
        activeCall = call
        try {
            val intent = Intent(context, NativeWalletActivity::class.java)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            
            val ret = JSObject()
            ret.put("status", "launched")
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to launch native Kotlin UI: ${e.message}", e)
        }
    }

    @PluginMethod
    fun checkNativeStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("supported", true)
        call.resolve(ret)
    }
}
