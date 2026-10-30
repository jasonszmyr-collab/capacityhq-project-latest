package com.capacity.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.TreeSet;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Phone-local recovery credentials. Never backed up or placed in WebView storage. */
@CapacitorPlugin(name = "RecoveryVault")
public class RecoveryVaultPlugin extends Plugin {
    private static final String ALIAS = "honorpole.recovery.v1";
    private final RecoveryUnlockSession<PluginCall> unlockSession = new RecoveryUnlockSession<>();
    private android.os.CancellationSignal unlockCancellation;
    private RecoveryUnlockSession.Request<PluginCall> legacySuccess;

    private File directory() throws Exception {
        File directory = new File(getContext().getNoBackupFilesDir(), "honorpole-recovery-v1");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception();
        return directory;
    }
    private String identity(PluginCall call) throws Exception {
        String device = call.getString("deviceId", "");
        String owner = call.getString("ownerId", "");
        if (!device.matches("HP-[0-9]{3,6}") || !owner.matches("[A-Za-z0-9_-]{1,128}")) throw new Exception();
        return owner + ":" + device;
    }
    private File file(String identity) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder();
        for (byte b : digest) name.append(String.format("%02x", b & 255));
        return new File(directory(), name + ".json");
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true);
            if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(30, KeyProperties.AUTH_DEVICE_CREDENTIAL);
            else spec.setUserAuthenticationValidityDurationSeconds(30);
            generator.init(spec.build()); generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private void unlock(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> beginUnlock(call));
        } catch (Exception ignored) {
            call.reject("Phone unlock could not be opened.");
        }
    }
    private void beginUnlock(PluginCall call) {
        if (!unlockSession.isActive() || !getBridge().getApp().isActive() ||
            getActivity().isFinishing() || getActivity().isDestroyed()) {
            call.reject("Open the app before using recovery passwords."); return;
        }
        if (unlockSession.pending() != null) {
            call.reject("A phone unlock is already in progress."); return;
        }
        RecoveryUnlockSession.Request<PluginCall> request = null;
        try {
            identity(call);
            KeyguardManager manager = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
            if (manager == null || !manager.isDeviceSecure()) {
                call.reject("Set a phone screen-lock PIN, pattern or password before using recovery passwords."); return;
            }
            key();
            request = unlockSession.begin(call, Build.VERSION.SDK_INT < 30);
            if (request == null) { call.reject("Phone unlock is unavailable."); return; }
            final RecoveryUnlockSession.Request<PluginCall> current = request;
            if (Build.VERSION.SDK_INT >= 30) {
                unlockCancellation = new android.os.CancellationSignal();
                new android.hardware.biometrics.BiometricPrompt.Builder(getActivity())
                    .setTitle("HonorPole recovery")
                    .setDescription("Enter your phone screen-lock PIN, pattern or password.")
                    .setAllowedAuthenticators(
                        android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build()
                    .authenticate(unlockCancellation, getContext().getMainExecutor(),
                        new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                            @Override public void onAuthenticationSucceeded(
                                android.hardware.biometrics.BiometricPrompt.AuthenticationResult result) {
                                finishAuthentication(current);
                            }
                            @Override public void onAuthenticationError(int code, CharSequence message) {
                                cancelRequest(current, "Phone unlock was not completed. Try again using your phone PIN, pattern or password.");
                            }
                        });
            } else {
                Intent intent = manager.createConfirmDeviceCredentialIntent(
                    "HonorPole recovery", "Use your phone PIN, pattern or password, rather than fingerprint.");
                if (intent == null) { cancelRequest(current, "Phone unlock is unavailable."); return; }
                startActivityForResult(call, intent, "unlocked");
            }
        } catch (Exception ignored) {
            if (request != null) cancelRequest(request, "Phone unlock could not be opened.");
            else call.reject("Recovery storage could not be opened. Your saved recovery records have not been removed.");
        }
    }
    private void cancelDetached(RecoveryUnlockSession.Request<PluginCall> request, String message) {
        if (request == null) return;
        legacySuccess = null;
        android.os.CancellationSignal signal = unlockCancellation;
        unlockCancellation = null;
        // Ownership is invalidated before cancellation can deliver a synchronous late callback.
        if (signal != null) { try { signal.cancel(); } catch (Exception ignored) {} }
        request.value.reject(message);
    }
    private void cancelRequest(RecoveryUnlockSession.Request<PluginCall> request, String message) {
        if (!unlockSession.isCurrent(request)) return;
        cancelDetached(unlockSession.cancel(), message);
    }
    private void finishAuthentication(RecoveryUnlockSession.Request<PluginCall> request) {
        if (!unlockSession.isCurrent(request)) return;
        if (!unlockSession.isActive()) {
            if (request.externalCredential) legacySuccess = request;
            else cancelRequest(request, "Recovery unlock was interrupted. Open the app and try again.");
            return;
        }
        PluginCall call = unlockSession.finish(request);
        if (call == null) return;
        unlockCancellation = null;
        legacySuccess = null;
        completeUnlocked(call);
    }
    @PluginMethod public void cancelPending(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> {
                cancelRequest(unlockSession.pending(), "Recovery unlock was cancelled because its page or account changed.");
                call.resolve();
            });
        } catch (Exception ignored) { call.reject("Recovery unlock cancellation could not be confirmed."); }
    }
    @Override protected void handleOnStop() {
        cancelDetached(unlockSession.stop(), "Recovery unlock was interrupted. Open the app and try again.");
    }
    @Override protected void handleOnResume() {
        unlockSession.resume();
        if (legacySuccess != null) finishAuthentication(legacySuccess);
    }
    @Override protected void handleOnDestroy() {
        cancelDetached(unlockSession.destroy(), "Recovery unlock ended with the app activity.");
    }
    @PluginMethod public void save(PluginCall call) {
        String password = call.getString("password", "");
        if (!password.matches("[0-9A-F]{32}")) { call.reject("Invalid recovery password."); return; }
        unlock(call);
    }
    @PluginMethod public void read(PluginCall call) { unlock(call); }
    @PluginMethod public void forget(PluginCall call) { unlock(call); }
    @PluginMethod public void list(PluginCall call) {
        try {
            JSArray entries = new JSArray();
            File[] files = directory().listFiles();
            TreeSet<String> names = new TreeSet<>();
            if (files != null) for (File entry : files) {
                String name = entry.getName();
                if (name.endsWith(".json")) names.add(name);
                else if (name.endsWith(".json.bak")) names.add(name.substring(0, name.length() - 4));
            }
            for (String name : names) {
                File entry = new File(directory(), name);
                try {
                    JSONObject record = new JSONObject(new String(new AtomicFile(entry).readFully(), StandardCharsets.UTF_8));
                    JSObject metadata = new JSObject();
                    metadata.put("deviceId", record.getString("deviceId")); metadata.put("ownerId", record.getString("ownerId"));
                    entries.put(metadata);
                } catch (Exception ignored) { /* An unreadable entry never exposes a credential. */ }
            }
            JSObject result = new JSObject(); result.put("entries", entries); call.resolve(result);
        } catch (Exception ignored) { call.reject("Could not list saved recovery passwords."); }
    }
    @ActivityCallback private void unlocked(PluginCall call, ActivityResult result) {
        RecoveryUnlockSession.Request<PluginCall> request = unlockSession.pending();
        if (request == null || !request.externalCredential || call == null ||
            !request.value.getCallbackId().equals(call.getCallbackId())) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            cancelRequest(request, "Phone unlock cancelled. No password was changed."); return;
        }
        finishAuthentication(request);
    }
    private void completeUnlocked(PluginCall call) {
        try {
            String id = identity(call);
            AtomicFile target = new AtomicFile(file(id));
            String method = call.getMethodName();
            if (method.equals("forget")) {
                File base = file(id);
                target.delete();
                if (base.exists() ||
                    new File(base.getPath() + ".bak").exists() ||
                    new File(base.getPath() + ".new").exists()) {
                    throw new Exception();
                }
                call.resolve(); return;
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            if (method.equals("save")) {
                String password = call.getString("password", "");
                if (!password.matches("[0-9A-F]{32}")) throw new Exception();
                cipher.init(Cipher.ENCRYPT_MODE, key());
                cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
                byte[] ciphertext = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
                JSONObject record = new JSONObject(); record.put("deviceId", call.getString("deviceId")); record.put("ownerId", call.getString("ownerId"));
                record.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
                record.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
                FileOutputStream stream = null;
                try {
                    stream = target.startWrite(); stream.write(record.toString().getBytes(StandardCharsets.UTF_8)); target.finishWrite(stream);
                } catch (Exception error) { if (stream != null) target.failWrite(stream); throw error; }
                call.resolve(); return;
            }
            if (!method.equals("read")) throw new Exception();
            JSONObject record = new JSONObject(new String(target.readFully(), StandardCharsets.UTF_8));
            if (!call.getString("deviceId").equals(record.getString("deviceId")) ||
                !call.getString("ownerId").equals(record.getString("ownerId"))) throw new Exception();
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(record.getString("iv"), Base64.NO_WRAP)));
            cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
            String password = new String(cipher.doFinal(Base64.decode(record.getString("ciphertext"), Base64.NO_WRAP)), StandardCharsets.UTF_8);
            if (!password.matches("[0-9A-F]{32}")) throw new Exception();
            JSObject reply = new JSObject(); reply.put("password", password); call.resolve(reply);
        } catch (android.security.keystore.UserNotAuthenticatedException ignored) {
            call.reject("Recovery requires your phone screen-lock PIN, pattern or password. Try again and complete that prompt; fingerprint alone cannot unlock this saved record.");
        } catch (android.security.keystore.KeyPermanentlyInvalidatedException ignored) {
            call.reject("The phone security key is no longer valid. Restore the pole's online connection to save its recovery password again.");
        } catch (Exception ignored) {
            String method = call.getMethodName();
            if ("save".equals(method)) {
                call.reject("The recovery password could not be saved. Try again using your phone PIN, pattern or password.");
            } else if ("forget".equals(method)) {
                call.reject("Removal could not be confirmed. Reload the saved-password list before trying again.");
            } else {
                call.reject("The saved recovery password could not be read. Try again using your phone PIN, pattern or password. If the problem continues, restore the pole's online connection to save it again.");
            }
        }
    }
}
