package dev.zurdi.berserk;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** v0.35.0: la alarma de fin abre la app con esta marca (full-screen intent) */
    static final String EXTRA_ALARM = "dev.zurdi.berserk.ALARM";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin propio (cronómetros ongoing) — registrar ANTES de super,
        // que es cuando el bridge congela la lista de plugins
        registerPlugin(BkOngoingPlugin.class);
        super.onCreate(savedInstanceState);
        applyAlarmIntent(getIntent());

        // v0.19.x (zurdi: "el gesto de atrás de Android cierra la app en vez
        // de ir a la pantalla anterior"): sin el plugin @capacitor/app nadie
        // escucha el back y la Activity hace su default (finish). Callback
        // del dispatcher (compatible con predictive back): si el WebView
        // tiene historial (la SPA empuja entradas reales con pushState), se
        // navega atrás; en la raíz, la app se manda al fondo en vez de
        // matarse — volver a abrirla conserva el estado (y el entreno vivo).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyAlarmIntent(intent);
    }

    /**
     * v0.35.0: solo cuando la abre la alarma se muestra sobre el bloqueo y
     * enciende la pantalla (como una app de alarma); el OK del overlay lo
     * revierte (BkOngoingPlugin.ackAlarm) para no dejar el entreno a la vista
     * sin desbloquear en cualquier otro arranque.
     */
    private void applyAlarmIntent(Intent intent) {
        boolean alarm = intent != null && intent.getBooleanExtra(EXTRA_ALARM, false);
        setShowWhenLocked(alarm);
        if (alarm) setTurnScreenOn(true);
    }
}
