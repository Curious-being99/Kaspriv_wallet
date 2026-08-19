package com.kaspriv.wallet;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Tapjacking & Overlay Obstruction Defense
        // Discards touch events if another application's window overlay obscures the wallet screen
        try {
            View rootView = getWindow().getDecorView().getRootView();
            if (rootView != null) {
                rootView.setFilterTouchesWhenObscured(true);
            }
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().setFilterTouchesWhenObscured(true);
            }
        } catch (Exception e) {
            // Ignore if decor view is not available on older devices
        }
    }
}

