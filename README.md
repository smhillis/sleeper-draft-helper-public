# sleeper-draft-helper-public

Public Sleeper draft-assistant experience for WhoToDraftNext.com.

## Draft strategy

Recommendations use league-specific scoring, roster needs, value over replacement (VOR), positional tier drops, ADP-based next-pick survival probability, and opportunity cost.

For leagues that require one kicker and one team defense, the default roster-completion policy reserves those positions for the final two draft selections. Other unfinished required starters are filled before that reserve window so the roster can still finish legally. Leagues without K/DEF slots are unaffected, and leagues with different specialty-slot counts reserve only the number of selections actually required.

## Validation

Run `npm run validate:draft-engine` to execute the synthetic scoring/roster scenarios, opportunity-strategy checks, and full deterministic mock-draft simulation against the production recommendation engine.

The public app is read-only and never submits a Sleeper draft pick.
