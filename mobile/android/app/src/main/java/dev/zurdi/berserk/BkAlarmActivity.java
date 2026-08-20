package dev.zurdi.berserk;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * v0.34.0 — la pantalla de "¡Tiempo!" del móvil (gemela de AlarmScreen en el
 * reloj): la abre el full-screen intent de la alarma aunque el móvil esté
 * bloqueado y con la pantalla apagada. Nativa y sin WebView a propósito: la
 * web puede no estar viva y esto tiene que salir en el acto. Colores de
 * berserk a mano (tokens del frontend): vacío, tinta, ámbar para el OK.
 */
public class BkAlarmActivity extends Activity {

    static final String EXTRA_KIND = "kind";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_SUBTITLE = "subtitle";
    static final String EXTRA_IMAGE_URL = "imageUrl";

    private static final int VOID = 0xFF0A0C0F;
    private static final int INK = 0xFFE8EDF2;
    private static final int INK_MUTED = 0xFF9AA4B2;
    private static final int EMBER = 0xFFFF8A3D;

    static Intent intent(Context ctx, String kind, String title, String subtitle, String imageUrl) {
        return new Intent(ctx, BkAlarmActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_KIND, kind)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_SUBTITLE, subtitle)
                .putExtra(EXTRA_IMAGE_URL, imageUrl);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        setContentView(buildView());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setContentView(buildView());
    }

    private View buildView() {
        Intent intent = getIntent();
        final String kind = intent.getStringExtra(EXTRA_KIND);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        String imageUrl = intent.getStringExtra(EXTRA_IMAGE_URL);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(VOID);
        int pad = dp(32);
        root.setPadding(pad, pad, pad, pad);

        ImageView art = new ImageView(this);
        int artSize = dp(160);
        LinearLayout.LayoutParams artParams = new LinearLayout.LayoutParams(artSize, artSize);
        artParams.bottomMargin = dp(28);
        art.setLayoutParams(artParams);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        Bitmap cached = BkNotifications.cachedArt(imageUrl);
        if (cached != null) {
            art.setImageBitmap(cached);
        } else {
            art.setImageResource(R.drawable.bk_notif_placeholder);
            BkNotifications.loadArt(this, imageUrl, bitmap -> {
                if (bitmap != null && !isFinishing()) art.setImageBitmap(bitmap);
            });
        }
        root.addView(art);

        TextView headline = new TextView(this);
        headline.setText(title == null ? getString(R.string.bk_alarm_time_up) : title);
        headline.setTextColor(EMBER);
        headline.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        headline.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        headline.setGravity(Gravity.CENTER);
        root.addView(headline);

        if (subtitle != null && !subtitle.isEmpty()) {
            TextView detail = new TextView(this);
            detail.setText(subtitle);
            detail.setTextColor(INK);
            detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
            detail.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            detailParams.topMargin = dp(6);
            detail.setLayoutParams(detailParams);
            root.addView(detail);
        }

        Button ok = new Button(this);
        ok.setText(getString(R.string.bk_alarm_ok));
        ok.setTextColor(VOID);
        ok.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        ok.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        ok.setAllCaps(false);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(EMBER);
        pill.setCornerRadius(dp(28));
        ok.setBackground(pill);
        LinearLayout.LayoutParams okParams = new LinearLayout.LayoutParams(dp(220), dp(56));
        okParams.topMargin = dp(36);
        ok.setLayoutParams(okParams);
        ok.setOnClickListener(v -> {
            startService(new Intent(this, BkAlarmService.class)
                    .setAction(BkAlarmService.ACTION_ACK)
                    .putExtra(BkAlarmService.EXTRA_KIND, kind));
            finishAndRemoveTask();
        });
        root.addView(ok);

        TextView hint = new TextView(this);
        hint.setText(getString(R.string.bk_alarm_hint));
        hint.setTextColor(INK_MUTED);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(14);
        hint.setLayoutParams(hintParams);
        root.addView(hint);

        root.setBackgroundColor(VOID);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(VOID);
        return root;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }
}
