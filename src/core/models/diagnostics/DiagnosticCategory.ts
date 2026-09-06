/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: DiagnosticCategory.ts
 *
 * Description:
 * Defines the subsystem that generated a diagnostic event.
 * ============================================================================
 */

export enum DiagnosticCategory {
    System = "System",
    Motion = "Motion",
    Network = "Network",
    Cloud = "Cloud",
    Firmware = "Firmware",
    Calibration = "Calibration",
    Security = "Security",
    Hardware = "Hardware"
}