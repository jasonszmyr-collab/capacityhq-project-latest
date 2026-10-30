import { Capacitor, registerPlugin } from "@capacitor/core";

export interface RecoveryEntry { ownerId: string; deviceId: string; }
interface RecoveryVaultPlugin {
    list(): Promise<{ entries: RecoveryEntry[] }>;
    save(options: RecoveryEntry & { password: string }): Promise<void>;
    read(options: RecoveryEntry): Promise<{ password: string }>;
    forget(options: RecoveryEntry): Promise<void>;
    cancelPending(): Promise<void>;
}
const native = registerPlugin<RecoveryVaultPlugin>("RecoveryVault");
export function recoveryAvailable() { return Capacitor.getPlatform() === "android"; }
function supported() {
    if (!recoveryAvailable()) throw new Error("Saved offline recovery is available in the Android app. No password was saved in this browser.");
}
function valid(entry: RecoveryEntry) {
    if (!/^HP-\d{3,6}$/.test(entry.deviceId) || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.ownerId))
        throw new Error("Invalid recovery record.");
}
export const recoveryVault = {
    async cancelPending() {
        if (recoveryAvailable()) await native.cancelPending();
    },
    async list(ownerId: string | null): Promise<RecoveryEntry[]> {
        supported();
        const result = await native.list();
        return result.entries.filter(entry => {
            try { valid(entry); return !ownerId || entry.ownerId === ownerId; } catch { return false; }
        });
    },
    async save(entry: RecoveryEntry, password: string) {
        supported(); valid(entry);
        if (!/^[0-9A-F]{32}$/.test(password)) throw new Error("Invalid permanent recovery password.");
        await native.save({ ...entry, password });
    },
    async read(entry: RecoveryEntry): Promise<string> {
        supported(); valid(entry);
        const reply = await native.read(entry);
        if (!/^[0-9A-F]{32}$/.test(reply.password)) throw new Error("Invalid saved recovery password.");
        return reply.password;
    },
    async forget(entry: RecoveryEntry) { supported(); valid(entry); await native.forget(entry); }
};
