import { readWiFiScanResponse, WiFiScanError } from "./wifiScanResponse";

export interface SetupContext { deviceId: string | null; scope: string; }
export interface SetupSession {
    deviceId: string; scope: string; password: string; expiresAt: number; recoveryPassword?: string;
}
interface Reply { status: number; data: unknown; }
export interface SetupDependencies {
    context(): SetupContext;
    cloud(deviceId: string, requestId?: string): Promise<unknown>;
    local(path: "/status" | "/scan" | "/save", headers?: Record<string, string>, data?: unknown): Promise<Reply>;
    now(): number;
    pause(): Promise<void>;
    encode(value: string): string;
}
function object(value: unknown): Record<string, unknown> {
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { throw new Error("Invalid setup response."); } }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid setup response.");
    return value as Record<string, unknown>;
}
const hex = (value: unknown): value is string => typeof value === "string" && /^[0-9A-F]{32}$/.test(value);

// Credentials live only in memory and are never sent to discovery/LAN addresses.
export class ProtectedSetupSession {
    private session: SetupSession | null = null;
    private generation = 0;
    private saving = false;
    constructor(private readonly deps: SetupDependencies) {}
    clear() { this.session = null; ++this.generation; }
    cancelPending() { ++this.generation; }
    private context(): SetupContext {
        const context = this.deps.context();
        if (!context.deviceId || !/^HP-\d{3,6}$/.test(context.deviceId)) throw new Error("Enter the pole ID and private setup-card password in protected setup, or sign in and select an HonorPole on Home.");
        return context;
    }
    private current(context: SetupContext, generation: number) {
        const next = this.deps.context();
        if (generation !== this.generation || next.scope !== context.scope || next.deviceId !== context.deviceId) {
            throw new Error("Setup cancelled or the selected pole/account changed. Open setup again.");
        }
    }
    details(): SetupSession | null {
        const context = this.deps.context();
        if (this.session && (this.session.expiresAt <= this.deps.now() ||
            this.session.scope !== context.scope || this.session.deviceId !== context.deviceId)) this.clear();
        return this.session ? { ...this.session } : null;
    }
    useUsb(password: string) {
        const context = this.context();
        if (!hex(password)) throw new Error("Enter the 32-character private setup password from the pole setup card or USB SETUP, using uppercase letters and digits.");
        this.clear();
        this.session = { deviceId: context.deviceId!, scope: context.scope, password, expiresAt: this.deps.now() + 600000 };
    }
    async open(): Promise<void> {
        this.clear();
        const context = this.context();
        const generation = this.generation;
        const deadline = this.deps.now() + 45000;
        try {
            const opened = object(await this.deps.cloud(context.deviceId!));
            this.current(context, generation);
            if (opened.success !== true || opened.deviceId !== context.deviceId || !hex(opened.requestId)) throw new Error("Invalid setup request response.");
            const requestId = opened.requestId;
            while (this.deps.now() < deadline) {
                const reply = object(await this.deps.cloud(context.deviceId!, requestId));
                this.current(context, generation);
                if (this.deps.now() >= deadline) break;
                if (reply.success !== true || reply.deviceId !== context.deviceId || reply.requestId !== requestId) throw new Error("Setup response did not match this pole and request.");
                if (reply.result === "REFUSED") throw new Error("HonorPole refused setup. Close any existing setup window and keep the pole idle, then try again.");
                if (reply.result === "OPEN") {
                    if (!hex(reply.password) || reply.ssid !== `HonorPole-Setup-${context.deviceId}` ||
                        typeof reply.remainingMs !== "number" || !Number.isFinite(reply.remainingMs) || reply.remainingMs <= 0 || reply.remainingMs > 600000) throw new Error("Invalid protected setup credentials.");
                    if (reply.recoveryPassword !== undefined && !hex(reply.recoveryPassword))
                        throw new Error("Invalid recovery credential. Setup was not retained.");
                    this.session = { deviceId: context.deviceId!, scope: context.scope, password: reply.password,
                        expiresAt: this.deps.now() + Math.max(0, reply.remainingMs - 2000),
                        ...(hex(reply.recoveryPassword) ? {recoveryPassword:reply.recoveryPassword} : {}) };
                    return;
                }
                if (reply.result !== "PENDING") throw new Error("Unknown setup result.");
                await this.deps.pause();
                this.current(context, generation);
            }
            throw new Error("Setup opening was not confirmed. Do not retry immediately; check the pole and wait for the pending request to expire.");
        } catch (error) {
            if (generation === this.generation) this.session = null;
            throw error;
        }
    }
    async scan() {
        const context = this.context(), generation = this.generation;
        try {
            // Setup scanning uses only the AP address, never a cached LAN pole or mDNS.
            // Verify identity before asking that AP to scan. No credentials are sent.
            const response = await this.deps.local("/status");
            this.current(context, generation);
            if (response.status !== 200) throw new WiFiScanError("request",
                "The setup address did not confirm the pole. Reconnect to its setup Wi-Fi and refresh.");
            const status = object(response.data);
            const identities = [status.deviceId, status.serialNumber, status.device_id].filter(value => value !== undefined);
            if (status.success === false || status.error || !identities.length ||
                identities.some(value => value !== context.deviceId)) {
                throw new WiFiScanError("invalid", "This setup network did not identify the selected HonorPole. Select the matching pole and reconnect to its setup Wi-Fi.");
            }
            const result = await this.deps.local("/scan");
            this.current(context, generation);
            return readWiFiScanResponse(result.status, result.data);
        } catch (error) {
            if (error instanceof WiFiScanError) throw error;
            throw new WiFiScanError("unreachable", error instanceof Error ? error.message :
                "Cannot reach the setup address. Connect to this pole's setup Wi-Fi and refresh.");
        }
    }
    async save(ssid: string, password: string): Promise<void> {
        if (this.saving) throw new Error("A Wi-Fi save is already in progress.");
        const session = this.details();
        if (!session) throw new Error("Open protected setup or enter the private setup-card password first.");
        if (!ssid.trim() || ssid.length > 32) throw new Error("Select a valid Wi-Fi network.");
        const context = this.context(), generation = this.generation;
        this.saving = true;
        try {
            // Do not authenticate until the AP identifies itself as the selected pole.
            const response = await this.deps.local("/status");
            this.current(context, generation);
            if (!this.details()) throw new Error("Setup credentials expired. Open setup again.");
            if (response.status !== 200) throw new Error("Cannot verify the pole at its setup address. Connect to its setup Wi-Fi.");
            const status = object(response.data);
            const identities = [status.deviceId, status.serialNumber].filter(value => value !== undefined);
            if (status.success === false || status.error || !identities.length || identities.some(value => value !== session.deviceId)) throw new Error("The setup network is not the selected HonorPole. No credentials were sent.");
            // A sent write is never automatically replayed, including after a timeout.
            this.session = null;
            const result = await this.deps.local("/save", {
                "Content-Type": "application/json",
                Authorization: `Basic ${this.deps.encode(`setup:${session.password}`)}`
            }, { ssid, password });
            this.current(context, generation);
            if (result.status === 401) throw new Error("Setup authentication was refused. Reopen setup and use its current setup password.");
            if (result.status === 403) throw new Error("Protected setup is closed or this request did not arrive through its setup Wi-Fi. Reopen setup and reconnect.");
            if (result.status !== 200) throw new Error(`Wi-Fi settings were not confirmed (HTTP ${result.status}). Check the pole before trying again.`);
            const saved = object(result.data);
            if (saved.success !== true || saved.error || saved.ok === false) throw new Error("The pole did not confirm saving Wi-Fi settings. Check its status before trying again.");
        } finally { this.saving = false; }
    }
}
