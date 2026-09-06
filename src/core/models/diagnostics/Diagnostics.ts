/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Diagnostics.ts
 *
 * Description:
 * Aggregate root for all diagnostic information within the HonorPole platform.
 * Owns active diagnostics, diagnostic history, health calculations,
 * duplicate suppression, and filtering.
 * ============================================================================
 */

import { DiagnosticEntry } from "./DiagnosticEntry";
import { DiagnosticSeverity } from "./DiagnosticSeverity";
import { DiagnosticCategory } from "./DiagnosticCategory";

export class Diagnostics {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private readonly _activeEntries = new Map<string, DiagnosticEntry>();

    private readonly _history: DiagnosticEntry[] = [];

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get activeEntries(): readonly DiagnosticEntry[] {

        return Array.from(this._activeEntries.values());

    }

    public get history(): readonly DiagnosticEntry[] {

        return [...this._history];

    }

    public get activeCount(): number {

        return this._activeEntries.size;

    }

    public get historyCount(): number {

        return this._history.length;

    }

    public get latest(): DiagnosticEntry | undefined {

        if (this._history.length === 0) {
            return undefined;
        }

        return this._history[this._history.length - 1];

    }

    public get warningCount(): number {

        return this.activeEntries.filter(x => x.isWarning()).length;

    }

    public get errorCount(): number {

        return this.activeEntries.filter(x => x.isError()).length;

    }

    public get criticalCount(): number {

        return this.activeEntries.filter(x => x.isCritical()).length;

    }

    public get informationCount(): number {

        return this.activeEntries.filter(x => x.isInformation()).length;

    }

    public get hasWarnings(): boolean {

        return this.warningCount > 0;

    }

    public get hasErrors(): boolean {

        return this.errorCount > 0;

    }

    public get hasCriticalFaults(): boolean {

        return this.criticalCount > 0;

    }

    public get isHealthy(): boolean {

        return !this.hasErrors && !this.hasCriticalFaults;

    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    /**
     * Adds a diagnostic.
     * Duplicate active diagnostics increment the occurrence count.
     */
    public add(entry: DiagnosticEntry): void {

        const existing = this._activeEntries.get(entry.code);

        if (existing) {

            existing.incrementOccurrence();

            return;

        }

        this._activeEntries.set(entry.code, entry);

        this._history.push(entry);

    }

    /**
     * Returns true if the diagnostic exists.
     */
    public contains(code: string): boolean {

        return this._activeEntries.has(code);

    }

    /**
     * Finds an active diagnostic.
     */
    public find(code: string): DiagnosticEntry | undefined {

        return this._activeEntries.get(code);

    }

    /**
     * Acknowledges an active diagnostic.
     */
    public acknowledge(code: string): boolean {

        const entry = this._activeEntries.get(code);

        if (!entry) {

            return false;

        }

        entry.acknowledge();

        return true;

    }

    /**
     * Clears an active diagnostic.
     */
    public clear(code: string): boolean {

        const entry = this._activeEntries.get(code);

        if (!entry) {

            return false;

        }

        entry.clear();

        this._activeEntries.delete(code);

        return true;

    }

    /**
     * Clears every active diagnostic.
     */
    public clearAll(): void {

        for (const entry of this._activeEntries.values()) {

            entry.clear();

        }

        this._activeEntries.clear();

    }
    /**
     * Returns all active diagnostics matching the specified severity.
     */
    public getBySeverity(
        severity: DiagnosticSeverity
    ): readonly DiagnosticEntry[] {

        return this.activeEntries.filter(
            entry => entry.severity === severity
        );

    }

    /**
     * Returns all active diagnostics matching the specified category.
     */
    public getByCategory(
        category: DiagnosticCategory
    ): readonly DiagnosticEntry[] {

        return this.activeEntries.filter(
            entry => entry.category === category
        );

    }

    /**
     * Returns every diagnostic in history matching the specified severity.
     */
    public getHistoryBySeverity(
        severity: DiagnosticSeverity
    ): readonly DiagnosticEntry[] {

        return this._history.filter(
            entry => entry.severity === severity
        );

    }

    /**
     * Returns every diagnostic in history matching the specified category.
     */
    public getHistoryByCategory(
        category: DiagnosticCategory
    ): readonly DiagnosticEntry[] {

        return this._history.filter(
            entry => entry.category === category
        );

    }

    /**
     * Removes every historical diagnostic.
     *
     * Active diagnostics remain untouched.
     */
    public clearHistory(): void {

        this._history.length = 0;

    }

    /**
     * Completely resets the diagnostics subsystem.
     */
    public reset(): void {

        this.clearAll();

        this.clearHistory();

    }

    /**
     * Serializes the diagnostics aggregate.
     */
    public toJSON() {

        return {

            activeCount: this.activeCount,

            historyCount: this.historyCount,

            informationCount: this.informationCount,

            warningCount: this.warningCount,

            errorCount: this.errorCount,

            criticalCount: this.criticalCount,

            hasWarnings: this.hasWarnings,

            hasErrors: this.hasErrors,

            hasCriticalFaults: this.hasCriticalFaults,

            isHealthy: this.isHealthy,

            latest: this.latest?.toJSON(),

            activeEntries: this.activeEntries.map(
                entry => entry.toJSON()
            ),

            history: this._history.map(
                entry => entry.toJSON()
            )

        };

    }

}