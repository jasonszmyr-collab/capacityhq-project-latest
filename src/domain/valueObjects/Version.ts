//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// Version.ts
//
// PART 1 OF 3
//
// Location:
// src/domain/valueObjects/Version.ts
//
// Description:
// Immutable semantic version value object.
//
// Represents firmware versions in the form:
//
//      Major.Minor.Patch
//
// Examples:
//
//      1.0.0
//      2.5.13
//      4.1.0
//
//=============================================================================

/**
 * ============================================================================
 * Version
 * ============================================================================
 *
 * Immutable value object representing a semantic firmware version.
 *
 * Responsibilities:
 *
 * • Parse semantic version strings
 * • Validate version format
 * • Compare versions
 * • Create incremented versions
 * • Serialize and deserialize
 *
 * This class intentionally contains no firmware,
 * networking, OTA, storage, or UI logic.
 *
 * ============================================================================
 */

export class Version {

    //-------------------------------------------------------------------------
    // Private Fields
    //-------------------------------------------------------------------------

    private readonly _major: number;

    private readonly _minor: number;

    private readonly _patch: number;

    //-------------------------------------------------------------------------
    // Constructor
    //-------------------------------------------------------------------------

    public constructor(
        version: string = "0.0.0"
    ) {

        const parsed = Version.parse(version);

        this._major = parsed.major;

        this._minor = parsed.minor;

        this._patch = parsed.patch;

    }

    //-------------------------------------------------------------------------
    // Parsing
    //-------------------------------------------------------------------------

    /**
     * Parses and validates a semantic version.
     */
    private static parse(
        version: string
    ): {

        major: number;

        minor: number;

        patch: number;

    } {

        if (!version) {

            throw new Error(
                "Version cannot be empty."
            );

        }

        const trimmed = version.trim();

        const parts = trimmed.split(".");

        if (parts.length !== 3) {

            throw new Error(

                `Invalid semantic version: "${version}".`

            );

        }

        const major = Number(parts[0]);

        const minor = Number(parts[1]);

        const patch = Number(parts[2]);

        if (

            Number.isNaN(major)

            ||

            Number.isNaN(minor)

            ||

            Number.isNaN(patch)

        ) {

            throw new Error(

                `Invalid semantic version: "${version}".`

            );

        }

        if (

            major < 0

            ||

            minor < 0

            ||

            patch < 0

        ) {

            throw new Error(

                "Version numbers cannot be negative."

            );

        }

        return {

            major,

            minor,

            patch

        };

    }

    //-------------------------------------------------------------------------
    // Public Properties
    //-------------------------------------------------------------------------

    /**
     * Major version.
     */
    public get major(): number {

        return this._major;

    }

    /**
     * Minor version.
     */
    public get minor(): number {

        return this._minor;

    }

    /**
     * Patch version.
     */
    public get patch(): number {

        return this._patch;

    }

    /**
     * Returns the semantic version string.
     */
    public get value(): string {

        return `${this._major}.${this._minor}.${this._patch}`;

    }

    //-------------------------------------------------------------------------
    // Equality
    //-------------------------------------------------------------------------

    /**
     * Returns true if both versions are identical.
     */
    public equals(
        other: Version
    ): boolean {

        return (

            this._major === other.major

            &&

            this._minor === other.minor

            &&

            this._patch === other.patch

        );

    }

    /**
     * Returns true if the versions differ.
     */
    public notEquals(
        other: Version
    ): boolean {

        return !this.equals(other);

    }

    //-------------------------------------------------------------------------
    // Comparison
    //-------------------------------------------------------------------------

    /**
     * Returns true if this version is newer
     * than the supplied version.
     */
    public isGreaterThan(
        other: Version
    ): boolean {

        if (this._major > other.major) {

            return true;

        }

        if (this._major < other.major) {

            return false;

        }

        if (this._minor > other.minor) {

            return true;

        }

        if (this._minor < other.minor) {

            return false;

        }

        return this._patch > other.patch;

    }
//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// Version.ts
//
// PART 2 OF 3
//
// Location:
// src/domain/valueObjects/Version.ts
//
//=============================================================================

    /**
     * Returns true if this version is older
     * than the supplied version.
     */
    public isLessThan(
        other: Version
    ): boolean {

        if (this._major < other.major) {

            return true;

        }

        if (this._major > other.major) {

            return false;

        }

        if (this._minor < other.minor) {

            return true;

        }

        if (this._minor > other.minor) {

            return false;

        }

        return this._patch < other.patch;

    }

    /**
     * Returns true if this version is greater
     * than or equal to the supplied version.
     */
    public isGreaterThanOrEqual(
        other: Version
    ): boolean {

        return this.isGreaterThan(other)
            || this.equals(other);

    }

    /**
     * Returns true if this version is less
     * than or equal to the supplied version.
     */
    public isLessThanOrEqual(
        other: Version
    ): boolean {

        return this.isLessThan(other)
            || this.equals(other);

    }

    /**
     * Compares this version to another.
     *
     * Returns:
     *
     *  -1 = Older
     *   0 = Equal
     *   1 = Newer
     */
    public compareTo(
        other: Version
    ): number {

        if (this.isLessThan(other)) {

            return -1;

        }

        if (this.isGreaterThan(other)) {

            return 1;

        }

        return 0;

    }

    //-------------------------------------------------------------------------
    // Version Increment Methods
    //-------------------------------------------------------------------------

    /**
     * Creates a new Version with the
     * major version incremented.
     *
     * Example:
     *
     * 1.4.7 -> 2.0.0
     */
    public incrementMajor(): Version {

        return new Version(

            `${this._major + 1}.0.0`

        );

    }

    /**
     * Creates a new Version with the
     * minor version incremented.
     *
     * Example:
     *
     * 1.4.7 -> 1.5.0
     */
    public incrementMinor(): Version {

        return new Version(

            `${this._major}.${this._minor + 1}.0`

        );

    }

    /**
     * Creates a new Version with the
     * patch version incremented.
     *
     * Example:
     *
     * 1.4.7 -> 1.4.8
     */
    public incrementPatch(): Version {

        return new Version(

            `${this._major}.${this._minor}.${this._patch + 1}`

        );

    }

    //-------------------------------------------------------------------------
    // Utility Methods
    //-------------------------------------------------------------------------

    /**
     * Creates a deep copy of
     * this Version object.
     */
    public clone(): Version {

        return new Version(

            this.toString()

        );

    }

    /**
     * Returns true when this
     * version is 0.0.0.
     */
    public isEmpty(): boolean {

        return (

            this._major === 0

            &&

            this._minor === 0

            &&

            this._patch === 0

        );

    }

    /**
     * Returns true when this
     * version represents the
     * initial release.
     */
    public isInitialRelease(): boolean {

        return (

            this._major === 1

            &&

            this._minor === 0

            &&

            this._patch === 0

        );

    }

    /**
     * Returns the semantic version
     * as a formatted string.
     */
    public toString(): string {

        return this.value;

    }

    /**
     * Returns a unique string suitable
     * for caching and hashing.
     */
    public hashCode(): string {

        return this.value;

    }
//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// Version.ts
//
// PART 3 OF 3
//
// Location:
// src/domain/valueObjects/Version.ts
//
//=============================================================================

    //-------------------------------------------------------------------------
    // Serialization
    //-------------------------------------------------------------------------

    /**
     * Serializes this Version object.
     */
    public toJSON(): {
        major: number;
        minor: number;
        patch: number;
        value: string;
    } {

        return {

            major: this._major,

            minor: this._minor,

            patch: this._patch,

            value: this.value

        };

    }

    /**
     * Creates a Version from a serialized object.
     */
    public static fromJSON(data: {

        major?: number;

        minor?: number;

        patch?: number;

        value?: string;

    }): Version {

        if (typeof data.value === "string") {

            return new Version(data.value);

        }

        return new Version(

            `${data.major ?? 0}.${data.minor ?? 0}.${data.patch ?? 0}`

        );

    }

    //-------------------------------------------------------------------------
    // Factory Methods
    //-------------------------------------------------------------------------

    /**
     * Creates a Version from
     * individual components.
     */
    public static create(

        major: number,

        minor: number,

        patch: number

    ): Version {

        return new Version(

            `${major}.${minor}.${patch}`

        );

    }

    /**
     * Returns Version 0.0.0.
     */
    public static zero(): Version {

        return new Version("0.0.0");

    }

    /**
     * Returns Version 1.0.0.
     */
    public static initial(): Version {

        return new Version("1.0.0");

    }

    //-------------------------------------------------------------------------
    // Object Overrides
    //-------------------------------------------------------------------------

    /**
     * Returns the primitive value
     * of this Version object.
     */
    public valueOf(): string {

        return this.value;

    }

}