/**
 * HonorPole Version 1.0
 * ------------------------------------------------------------------
 * File: Version.ts
 *
 * Purpose:
 * Central source of truth for all application version information.
 *
 * This file is referenced throughout the application by:
 * - Diagnostics
 * - Logging
 * - Settings
 * - Support
 * - OTA Compatibility
 * - Firmware Validation
 * - Cloud Services
 *
 * Copyright © Honor Pole Innovations
 */

export enum BuildType {
    DEVELOPMENT = 'Development',
    BETA = 'Beta',
    RELEASE = 'Release',
}

export interface VersionInfo {
    company: string;
    application: string;
    platformVersion: string;
    buildVersion: string;
    firmwareVersion: string;
    protocolVersion: string;
    buildDate: string;
    buildType: BuildType;
}

export const VERSION: Readonly<VersionInfo> = Object.freeze({
    company: 'Honor Pole Innovations',

    application: 'HonorPole',

    platformVersion: '1.0.0',

    buildVersion: '1.0.0',

    firmwareVersion: '4.1.0',

    protocolVersion: '1.0',

    buildDate: '2026-07-19',

    buildType: BuildType.DEVELOPMENT,
});

/**
 * Returns a formatted version string.
 *
 * Example:
 * HonorPole v1.0.0
 */
export function getApplicationVersion(): string {
    return `${VERSION.application} v${VERSION.platformVersion}`;
}

/**
 * Returns the firmware version supported by
 * this application.
 */
export function getSupportedFirmwareVersion(): string {
    return VERSION.firmwareVersion;
}

/**
 * Returns true when running a development build.
 */
export function isDevelopmentBuild(): boolean {
    return VERSION.buildType === BuildType.DEVELOPMENT;
}

/**
 * Returns true when running a beta build.
 */
export function isBetaBuild(): boolean {
    return VERSION.buildType === BuildType.BETA;
}

/**
 * Returns true when running a release build.
 */
export function isReleaseBuild(): boolean {
    return VERSION.buildType === BuildType.RELEASE;
}