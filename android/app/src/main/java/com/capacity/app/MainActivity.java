package com.capacity.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 🔥 Enable WebView debugging + relax restrictions
        WebView.setWebContentsDebuggingEnabled(true);
    }
}
