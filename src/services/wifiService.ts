import { CapacitorHttp } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";

/* ==========================================================
   TYPES
========================================================== */

export interface WiFiNetwork {
    ssid: string;
    signal: number;
    secure: boolean;
}

export interface WiFiCredentials {
    ssid: string;
    password: string;
}

export interface NetworkStatus {
    connected: boolean;
    connectionType: string;
    ssid?: string;
    rssi?: number;
}

export interface HonorPoleDevice {
    ip: string;
    hostname: string;
    reachable: boolean;
}

export interface HonorPoleStatus {
    reachable: boolean;
    hostname: string;
    ip: string;
    firmware: string;
    wifiConnected: boolean;
    apMode: boolean;
    currentPosition: number;
    targetPosition: number;
    fullPosition: number;
    halfPosition: number;
    moving: boolean;
    raw: any;
}

/* ==========================================================
   WIFI SERVICE
========================================================== */

class WiFiService {

    /* ======================================================
       CONSTANTS
    ====================================================== */

    private readonly STORAGE_KEY = "wifi_credentials";

    private readonly LAST_IP_KEY = "honorpole_last_ip";

    private readonly HONORPOLE_AP = "HonorPole-Setup";

    private readonly AP_URL = "http://192.168.4.1";

    private readonly MDNS_URL = "http://honorpole.local";

    private readonly REQUEST_TIMEOUT = 3000;

    private deviceUrl: string | null = null;

    /* ======================================================
       NETWORK STATUS
    ====================================================== */

    async getNetworkStatus(): Promise<NetworkStatus> {

        try {

            const status = await Network.getStatus();

            return {

                connected: status.connected,

                connectionType: status.connectionType,

                ssid: "",

                rssi: 0

            };

        }
        catch (error) {

            console.error("[WiFi] Network Status Error:", error);

            return {

                connected: false,

                connectionType: "unknown"

            };

        }

    }

    /* ======================================================
       NETWORK LISTENER
    ====================================================== */

    addNetworkListener(
        callback: (status: NetworkStatus) => void
    ) {

        return Network.addListener(

            "networkStatusChange",

            async () => {

                callback(

                    await this.getNetworkStatus()

                );

            }

        );

    }

    /* ======================================================
       CONNECTION TESTS
    ====================================================== */

    async isConnectedToHonorPole(): Promise<boolean> {

        try {

            return (

                await this.discoverHonorPole()

            ) !== null;

        }
        catch {

            return false;

        }

    }

    async testHonorPoleConnection(): Promise<boolean> {

        return this.isConnectedToHonorPole();

    }

    /* ======================================================
       HTTP HELPER
    ====================================================== */

    private async probe(
        url: string
    ): Promise<any | null> {

        try {

            const response =
                await CapacitorHttp.request({

                    method: "GET",

                    url,

                    connectTimeout:
                        this.REQUEST_TIMEOUT,

                    readTimeout:
                        this.REQUEST_TIMEOUT

                });

            if (response.status !== 200) {

                return null;

            }

            return response.data;

        }
        catch {

            return null;

        }

    }

    /* ======================================================
       LAST KNOWN DEVICE
    ====================================================== */

    private async saveLastIP(
        ip: string
    ): Promise<void> {

        this.deviceUrl = `http://${ip.replace("http://", "")}`;

        await Preferences.set({

            key: this.LAST_IP_KEY,

            value: this.deviceUrl

        });

    }

    private async loadLastIP(): Promise<string | null> {

        const { value } =
            await Preferences.get({

                key: this.LAST_IP_KEY

            });

        return value;

    }

    /* ======================================================
       DISCOVERY
       (Part 2 starts here)
    ====================================================== */
        private async probeDevice(
        baseUrl: string
    ): Promise<HonorPoleDevice | null> {

        try {

            const response =
                await CapacitorHttp.request({

                    method: "GET",

                    url: `${baseUrl}/status`,

                    connectTimeout: this.REQUEST_TIMEOUT,

                    readTimeout: this.REQUEST_TIMEOUT

                });

            if (response.status !== 200) {

                return null;

            }

            const data = response.data ?? {};

            this.deviceUrl = baseUrl;

            await this.saveLastIP(baseUrl);

            return {

                ip: baseUrl.replace("http://", ""),

                hostname: data.device ?? "HonorPole",

                reachable: true

            };

        }
        catch {

            return null;

        }

    }

    async discoverHonorPole(): Promise<HonorPoleDevice | null> {

        console.log("[WiFi] Starting HonorPole discovery...");

        const candidates: string[] = [];

        const lastIP = await this.loadLastIP();

        if (lastIP) {

            candidates.push(lastIP);

        }

        candidates.push(this.MDNS_URL);

        candidates.push(this.AP_URL);

        for (const url of candidates) {

            console.log("[WiFi] Trying:", url);

            const device =
                await this.probeDevice(url);

            if (device) {

                console.log("[WiFi] HonorPole found:", device.ip);

                return device;

            }

        }

        this.deviceUrl = null;

        console.log("[WiFi] HonorPole not found.");

        return null;

    }

    /* ======================================================
       SEND WIFI CREDENTIALS
    ====================================================== */

    async sendCredentials(
        credentials: WiFiCredentials
    ) {

        try {

            const device =
                await this.discoverHonorPole();

            if (!device || !this.deviceUrl) {

                return {

                    success: false,

                    message: "HonorPole device not found."

                };

            }

            console.log(

                "[WiFi] Sending credentials to:",

                this.deviceUrl

            );

            const body =
                new URLSearchParams({

                    ssid: credentials.ssid,

                    pass: credentials.password

                }).toString();

            const response =
                await CapacitorHttp.request({

                    method: "POST",

                    url: `${this.deviceUrl}/save`,

                    headers: {

                        "Content-Type":
                            "application/x-www-form-urlencoded"

                    },

                    data: body,

                    connectTimeout: 10000,

                    readTimeout: 10000

                });

            if (response.status !== 200) {

                return {

                    success: false,

                    message:
                        "ESP32 rejected WiFi credentials."

                };

            }

            await this.saveCredentials(credentials);

            console.log("[WiFi] Credentials stored.");

            await new Promise(

                resolve => setTimeout(resolve, 8000)

            );

            const rediscovered =
                await this.discoverHonorPole();

            if (rediscovered) {

                return {

                    success: true,

                    message:
                        "HonorPole connected successfully."

                };

            }

            return {

                success: true,

                message:
                    "Credentials saved. Device is reconnecting."

            };

        }
        catch (error: any) {

            console.error(

                "[WiFi] Provisioning failed:",

                error

            );

            return {

                success: false,

                message:
                    error?.message ??
                    "Provisioning failed."

            };

        }

    }

    /* ======================================================
       DEVICE STATUS
    ====================================================== */

    async getDeviceStatus():
        Promise<HonorPoleStatus | null> {

        try {

            const device =
                await this.discoverHonorPole();

            if (!device || !this.deviceUrl) {

                return null;

            }

            const response =
                await CapacitorHttp.request({

                    method: "GET",

                    url: `${this.deviceUrl}/status`,

                    connectTimeout: 5000,

                    readTimeout: 5000

                });

            if (response.status !== 200) {

                return null;

            }

            const status =
                response.data ?? {};

            if (

                status.ip &&

                status.ip !== device.ip

            ) {

                this.deviceUrl =
                    `http://${status.ip}`;

                await this.saveLastIP(

                    status.ip

                );

            }

            return {

                reachable: true,

                hostname:
                    status.device ??
                    device.hostname,

                ip:
                    status.ip ??
                    device.ip,

                firmware:
                    status.firmware ?? "",

                wifiConnected:
                    status.wifi ?? false,

                apMode:
                    status.ap ?? false,

                currentPosition:
                    status.currentPosition ?? 0,

                targetPosition:
                    status.targetPosition ?? 0,

                fullPosition:
                    status.fullPosition ?? 0,

                halfPosition:
                    status.halfPosition ?? 0,

                moving:
                    status.moving ?? false,

                raw: status

            };

        }
        catch (error) {

            console.error(

                "[WiFi] Status failed:",

                error

            );

            return null;

        }

    }

    /* ======================================================
       WIFI SCAN
    ====================================================== */

    async scanNetworks():
        Promise<WiFiNetwork[]> {

        try {

            const device =
                await this.discoverHonorPole();

            if (!device || !this.deviceUrl) {

                return [];

            }

            const response =
                await CapacitorHttp.request({

                    method: "GET",

                    url: `${this.deviceUrl}/scan`,

                    connectTimeout: 20000,

                    readTimeout: 20000

                });

            if (response.status !== 200) {

                return [];

            }

            const networks =
                response.data?.networks ??
                response.data ??
                [];

            return networks

                .filter(
                    (n: any) =>
                        n.ssid &&
                        n.ssid.trim().length > 0
                )

                .map((n: any) => ({

                    ssid: n.ssid,

                    signal: Math.max(

                        0,

                        Math.min(

                            100,

                            Math.round(

                                ((n.rssi ?? -100) + 100) * 2

                            )

                        )

                    ),

                    secure: Boolean(n.secure)

                }))

                .sort(

                    (a: WiFiNetwork,
                     b: WiFiNetwork) =>

                        b.signal - a.signal

                );

        }
        catch (error) {

            console.error(

                "[WiFi] Scan failed:",

                error

            );

            return [];

        }

    }

    /* ======================================================
       CREDENTIAL STORAGE
       (Part 3 starts here)
    ====================================================== */

        /* ======================================================
       CREDENTIAL STORAGE
    ====================================================== */

    private async saveCredentials(
        credentials: WiFiCredentials
    ): Promise<void> {

        await Preferences.set({

            key: this.STORAGE_KEY,

            value: JSON.stringify(credentials)

        });

    }

    async loadCredentials():
        Promise<WiFiCredentials | null> {

        try {

            const { value } =
                await Preferences.get({

                    key: this.STORAGE_KEY

                });

            if (!value) {

                return null;

            }

            return JSON.parse(value) as WiFiCredentials;

        }
        catch (error) {

            console.error(

                "[WiFi] Failed to load credentials:",

                error

            );

            return null;

        }

    }

    async clearCredentials():
        Promise<void> {

        await Preferences.remove({

            key: this.STORAGE_KEY

        });

    }

    /* ======================================================
       DEVICE URL
    ====================================================== */

    getCurrentDeviceUrl():
        string | null {

        return this.deviceUrl;

    }

    async resetDiscovery():
        Promise<void> {

        this.deviceUrl = null;

        await Preferences.remove({

            key: this.LAST_IP_KEY

        });

    }

    /* ======================================================
       ACCESS POINT HELPERS
    ====================================================== */

    getAccessPointSSID(): string {

        return this.HONORPOLE_AP;

    }

    getAccessPointURL(): string {

        return this.AP_URL;

    }

    getMDNSAddress(): string {

        return this.MDNS_URL;

    }

    /* ======================================================
       LEGACY COMPATIBILITY
    ====================================================== */

    async connectToDevice() {

        return this.discoverHonorPole();

    }

    async provisionDevice(
        credentials: WiFiCredentials
    ) {

        return this.sendCredentials(credentials);

    }

    async refreshStatus() {

        return this.getDeviceStatus();

    }

    async scanForNetworks() {

        return this.scanNetworks();

    }

}

/* ==========================================================
   SINGLETON EXPORT
========================================================== */

export const wifiService = new WiFiService();
