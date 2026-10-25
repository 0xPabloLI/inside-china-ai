/**
 * The search keyword behind the #778 wire-contract fixtures.
 *
 * `probe-source-contracts.mjs` captures every fixture with this keyword and
 * `__tests__/source-contract-fixtures.test.mjs` locks the parsed shape against
 * it — `titleFromWire` treats a title equal to the keyword as the adapter's
 * fallback. Both sides must therefore read the same constant: if they drift
 * apart, the locks silently stop describing what was actually captured.
 */
export const SOURCE_CONTRACT_KEYWORD = "artificial intelligence robot";
