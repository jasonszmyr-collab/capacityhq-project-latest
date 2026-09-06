/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: DiagnosticsManager.ts
 *
 * Description:
 * Application service responsible for managing the Diagnostics aggregate.
 * Creates, acknowledges, clears, and reports diagnostic events.
 *
 * This class contains application behavior.
 * It does NOT contain UI, ESP32, HTTP, or cloud logic.
 * ============================================================================
 */

import { Diagnostics } from "./Diagnostics";
import { DiagnosticEntry } from "./DiagnosticEntry";
import { DiagnosticSeverity } from "./DiagnosticSeverity";
import { DiagnosticCategory } from "./DiagnosticCategory";

export class DiagnosticsManager {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private readonly _diagnostics: Diagnostics;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor(diagnostics?: Diagnostics) {

        this._diagnostics = diagnostics ?? new Diagnostics();

    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get diagnostics(): Diagnostics {

        return this._diagnostics;

    }

    public get isHealthy(): boolean {

        return this._diagnostics.isHealthy;

    }

    public get activeCount(): number {

        return this._diagnostics.activeCount;

    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    /**
     * Reports a diagnostic.
     */
    public report(
        severity: DiagnosticSeverity,
        category: DiagnosticCategory,
        code: string,
        message: string
    ): void {

        const entry = new DiagnosticEntry(
            severity,
            category,
            code,
            message
        );

        this._diagnostics.add(entry);

    }

    /**
     * Reports an informational diagnostic.
     */
    public reportInformation(
        category: DiagnosticCategory,
        code: string,
        message: string
    ): void {

        this.report(
            DiagnosticSeverity.Information,
            category,
            code,
            message
        );

    }

    /**
     * Reports a warning diagnostic.
     */
    public reportWarning(
        category: DiagnosticCategory,
        code: string,
        message: string
    ): void {

        this.report(
            DiagnosticSeverity.Warning,
            category,
            code,
            message
        );

    }

    /**
     * Reports an error diagnostic.
     */
    public reportError(
        category: DiagnosticCategory,
        code: string,
        message: string
    ): void {

        this.report(
            DiagnosticSeverity.Error,
            category,
            code,
            message
        );

    }

    /**
     * Reports a critical diagnostic.
     */
    public reportCritical(
        category: DiagnosticCategory,
        code: string,
        message: string
    ): void {

        this.report(
            DiagnosticSeverity.Critical,
            category,
            code,
            message
        );

    }

    /**
     * Acknowledges a diagnostic.
     */
    public acknowledge(code: string): boolean {

        return this._diagnostics.acknowledge(code);

    }

    /**
     * Clears a diagnostic.
     */
    public clear(code: string): boolean {

        return this._diagnostics.clear(code);

    }

    /**
     * Clears every active diagnostic.
     */
    public clearAll(): void {

        this._diagnostics.clearAll();

    }
    /**
     * Determines whether an active diagnostic exists.
     */
    public contains(code: string): boolean {

        return this._diagnostics.contains(code);

    }

    /**
     * Finds an active diagnostic.
     */
    public find(code: string): DiagnosticEntry | undefined {

        return this._diagnostics.find(code);

    }

    /**
     * Reports a motor fault.
     */
    public reportMotorFault(message: string): void {

        this.reportCritical(
            DiagnosticCategory.Motion,
            "MOTOR_FAULT",
            message
        );

    }

    /**
     * Reports a WiFi disconnect.
     */
    public reportWiFiDisconnected(message = "WiFi connection lost."): void {

        this.reportWarning(
            DiagnosticCategory.Network,
            "WIFI_DISCONNECTED",
            message
        );

    }

    /**
     * Reports a cloud disconnect.
     */
    public reportCloudDisconnected(message = "Cloud connection lost."): void {

        this.reportWarning(
            DiagnosticCategory.Cloud,
            "CLOUD_DISCONNECTED",
            message
        );

    }

    /**
     * Reports a firmware fault.
     */
    public reportFirmwareFault(message: string): void {

        this.reportError(
            DiagnosticCategory.Firmware,
            "FIRMWARE_ERROR",
            message
        );

    }

    /**
     * Reports a calibration failure.
     */
    public reportCalibrationFailed(message: string): void {

        this.reportError(
            DiagnosticCategory.Calibration,
            "CALIBRATION_FAILED",
            message
        );

    }

    /**
     * Reports a hardware fault.
     */
    public reportHardwareFault(message: string): void {

        this.reportCritical(
            DiagnosticCategory.Hardware,
            "HARDWARE_FAULT",
            message
        );

    }

    /**
     * Reports a security violation.
     */
    public reportSecurityViolation(message: string): void {

        this.reportCritical(
            DiagnosticCategory.Security,
            "SECURITY_VIOLATION",
            message
        );

    }

    /**
     * Reports a general system fault.
     */
    public reportSystemFault(message: string): void {

        this.reportError(
            DiagnosticCategory.System,
            "SYSTEM_FAULT",
            message
        );

    }

    /**
     * Resets the diagnostics subsystem.
     */
    public reset(): void {

        this._diagnostics.reset();

    }

    /**
     * Returns a serializable representation of the diagnostics subsystem.
     */
    public toJSON() {

        return {

            diagnostics: this._diagnostics.toJSON()

        };

    }

}