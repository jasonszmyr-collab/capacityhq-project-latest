import { useEffect, useRef } from "react";
import cloudService from "../services/cloudService";
import type { CommandDispatchResult } from "../services/commandResponse";
import { watchCommandDelivery } from "../services/commandDelivery";

export function useCommandDelivery(deviceId: string | null, onMessage: (message: string) => void) {
    const currentDevice = useRef(deviceId);
    currentDevice.current = deviceId;
    const cancelRef = useRef<(() => void) | null>(null);
    const mounted = useRef(true);

    function cancelCommandTracking() {
        cancelRef.current?.();
        cancelRef.current = null;
    }

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; cancelCommandTracking(); };
    }, [deviceId]);

    function trackCommand(result: CommandDispatchResult, requestedDevice: string, command: string) {
        cancelCommandTracking();
        if (!mounted.current || currentDevice.current !== requestedDevice) return;
        onMessage(result.message);
        if (result.stage !== "queued") return;
        if (!result.commandId) {
            onMessage(`${command.toUpperCase()} queued for ${requestedDevice}. No command ID was returned; delivery cannot be tracked.`);
            return;
        }
        const userId = cloudService.getUserId();
        cancelRef.current = watchCommandDelivery(
            { deviceId: requestedDevice, commandId: result.commandId, command },
            () => cloudService.getCommandDeliveryStatus(requestedDevice),
            onMessage,
            () => mounted.current && currentDevice.current === requestedDevice &&
                cloudService.getUserId() === userId && cloudService.isAuthenticated()
        );
    }

    return { trackCommand, cancelCommandTracking };
}
