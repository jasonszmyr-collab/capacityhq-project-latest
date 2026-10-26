// Retry only the assigned-device read. Never dispatch or replay commands.
export interface DeviceListRecoveryOptions<T> {
    load: () => Promise<T[]>;
    getScope: () => string;
    onLoaded: (devices: T[]) => void;
    onError: () => void;
    retryMs?: number;
}

export function watchDeviceList<T>(options: DeviceListRecoveryOptions<T>): () => void {
    const scope = options.getScope();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = () => !stopped && scope === options.getScope();

    async function read(): Promise<void> {
        if (!active()) return;
        let devices: T[];
        try {
            devices = await options.load();
        } catch {
            if (!active()) return;
            options.onError();
            if (active()) timer = setTimeout(() => void read(), options.retryMs ?? 5000);
            return;
        }
        if (!active()) return;
        stopped = true; // A successful empty list is also final, not a network error.
        options.onLoaded(devices);
    }

    void read();
    return () => {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
    };
}
