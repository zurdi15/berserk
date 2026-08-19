package dev.zurdi.berserk;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin propio (cronómetros ongoing) — registrar ANTES de super,
        // que es cuando el bridge congela la lista de plugins
        registerPlugin(BkOngoingPlugin.class);
        super.onCreate(savedInstanceState);

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
}
