/**
 * Pure rules for the per-simulation values a visitor's browser remembers.
 *
 * Before card 106 the control panel stored every parameter, so a returning
 * visitor kept whatever the defaults were on their first visit: a default
 * that moved later (Inside-out, the band count, Tail refinement) never
 * reached them until they pressed Reset. The stored blob now carries a
 * format marker and only the values that differ from the kernel's defaults,
 * so a later default change reaches every visitor who did not choose
 * otherwise.
 *
 * A legacy blob (no current marker) cannot say whether a stored value was a
 * choice or an untouched default. For the handful of defaults that moved
 * before the marker existed, the stored value equal to the retired default is
 * treated as unset; everything else in a legacy blob is kept.
 *
 * Pure: no DOM, no storage. `src/app/controls.ts` encodes on save and
 * migrates on restore; `src/app/persistence.ts` is unchanged.
 */

export type StoredValue = number | boolean | string;
export type StoredValues = Record<string, StoredValue>;

/** Minimal shape of a parameter descriptor this module needs. */
export interface StoredDefault {
  key: string;
  default?: StoredValue;
}

/** Key of the format marker inside a stored blob. */
export const STORED_VALUES_FORMAT_KEY = "__format";
/** Current blob format: marker plus non-default values only. */
export const STORED_VALUES_FORMAT = 2;

/**
 * Defaults that moved before the format marker existed, per simulation
 * slug. In a legacy blob a stored value equal to one of these is treated as
 * unset.
 */
export const RETIRED_DEFAULTS: Readonly<Record<string, Readonly<StoredValues>>> = {
  "logistic-mandelbrot": { tailRefinement: 0 },
};

/**
 * The blob to store for `params`: the format marker, then each schema key
 * whose value differs from the descriptor default, in schema order. Keys the
 * schema does not name are dropped.
 */
export function encodeStoredValues(
  params: Readonly<StoredValues>,
  schema: ReadonlyArray<StoredDefault>,
): StoredValues {
  void params;
  void schema;
  throw new Error("card 106: encodeStoredValues is not implemented");
}

/** Whether a stored blob predates the current format marker. */
export function isLegacyStoredValues(stored: Readonly<StoredValues>): boolean {
  void stored;
  throw new Error("card 106: isLegacyStoredValues is not implemented");
}

/**
 * A legacy blob with every key whose value equals the retired default for
 * that key removed, as a new object. A blob that carries the current marker
 * is returned as an equal copy; the input is never mutated.
 */
export function migrateLegacyStoredValues(
  stored: Readonly<StoredValues>,
  retiredDefaults: Readonly<StoredValues>,
): StoredValues {
  void stored;
  void retiredDefaults;
  throw new Error("card 106: migrateLegacyStoredValues is not implemented");
}
