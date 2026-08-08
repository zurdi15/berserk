package dev.zurdi.berserk;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin propio (cronómetros ongoing) — registrar ANTES de super,
        // que es cuando el bridge congela la lista de plugins
        registerPlugin(BkOngoingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
