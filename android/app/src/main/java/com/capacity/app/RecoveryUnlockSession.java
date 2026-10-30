package com.capacity.app;

/** In-memory request ownership. All production calls run on the Android UI thread. */
final class RecoveryUnlockSession<T> {
    static final class Request<T> {
        final T value;
        final boolean externalCredential;
        private Request(T value, boolean externalCredential) {
            this.value = value;
            this.externalCredential = externalCredential;
        }
    }
    private boolean active = true;
    private boolean destroyed;
    private Request<T> pending;

    Request<T> begin(T value, boolean externalCredential) {
        if (!active || destroyed || pending != null) return null;
        pending = new Request<>(value, externalCredential);
        return pending;
    }
    Request<T> pending() { return pending; }
    boolean isActive() { return active && !destroyed; }
    boolean isCurrent(Request<T> request) { return request != null && pending == request && !destroyed; }
    T finish(Request<T> request) {
        if (!isActive() || !isCurrent(request)) return null;
        pending = null;
        return request.value;
    }
    Request<T> cancel() {
        Request<T> previous = pending;
        pending = null;
        return previous;
    }
    Request<T> stop() {
        active = false;
        // An older Android credential activity legitimately stops our activity.
        if (pending != null && !pending.externalCredential) return cancel();
        return null;
    }
    void resume() { if (!destroyed) active = true; }
    Request<T> destroy() {
        destroyed = true;
        active = false;
        return cancel();
    }
}
